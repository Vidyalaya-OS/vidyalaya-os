from django.db import transaction
from django.db.models import Prefetch, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academics.models import AcademicYear, SchoolClass, Section, SectionSubject, Subject
from apps.accounts import audit, services
from apps.accounts.models import Role, SchoolMembership
from apps.accounts.permissions import IsSchoolAdmin, SchoolPermission

from .models import Enrollment, Guardian, Student, StudentGuardian, Teacher
from .scoping import guardian_for, has_role, teacher_for, teacher_section_ids, visible_students
from .serializers import (
    AdminSerializer,
    EnrollmentSerializer,
    GuardianInputSerializer,
    GuardianSerializer,
    LeaveSerializer,
    MoveStudentSerializer,
    PromoteSerializer,
    StudentSerializer,
    TeacherSerializer,
    check_roll_no,
    ensure_guardian,
    link_guardian,
)


class RegistrationViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """People are never deleted, so history is kept; they are marked as left."""

    permission_classes = [SchoolPermission]

    def perform_create(self, serializer):
        obj = serializer.save()
        audit.record(self.request.user, f"{obj._meta.model_name}.create", obj._meta.model_name, obj.pk,
                     after={"name": obj.user.name})

    def perform_update(self, serializer):
        obj = serializer.save()
        audit.record(self.request.user, f"{obj._meta.model_name}.update", obj._meta.model_name, obj.pk,
                     after={k: str(v) for k, v in serializer.validated_data.items() if k != "user"})

    @action(detail=True, methods=["post"], url_path="resend-invite")
    def resend_invite(self, request, pk=None):
        obj = self.get_object()
        sent = services.send_invite(obj.user)
        if not sent:
            reason = "They have no email or phone." if not (obj.user.email or obj.user.phone) else (
                "They have already set a password.")
            return Response({"sent": False, "detail": reason})
        return Response({"sent": True})


class StudentViewSet(RegistrationViewSet):
    """Admins register and manage students. Teachers see students in their
    sections, students see themselves, and parents see their children."""

    serializer_class = StudentSerializer

    def get_queryset(self):
        qs = visible_students(self.request).select_related("user").prefetch_related(
            Prefetch("guardian_links", queryset=StudentGuardian.objects.select_related("guardian__user"))
        )
        params = self.request.query_params
        if params.get("section"):
            qs = qs.filter(enrollments__section_id=params["section"], enrollments__status=Enrollment.Status.ACTIVE)
        if params.get("school_class"):
            qs = qs.filter(enrollments__section__school_class_id=params["school_class"],
                           enrollments__status=Enrollment.Status.ACTIVE)
        if params.get("status"):
            qs = qs.filter(status=params["status"])
        if params.get("search"):
            term = params["search"]
            qs = qs.filter(Q(user__name__icontains=term) | Q(admission_no__icontains=term))
        return qs.distinct()

    @action(detail=True, methods=["get"])
    def history(self, request, pk=None):
        student = self.get_object()
        rows = student.enrollments.select_related("section__school_class", "academic_year").order_by(
            "-academic_year__start_date", "-created_at"
        )
        return Response(EnrollmentSerializer(rows, many=True).data)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def move(self, request, pk=None):
        """Move a student to another section in the same academic year."""
        student = self.get_object()
        data = MoveStudentSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        section, roll_no = data.validated_data["section"], data.validated_data.get("roll_no")
        current = student.enrollments.filter(
            status=Enrollment.Status.ACTIVE, academic_year=section.academic_year
        ).first()
        if current and current.section_id == section.id:
            return Response({"section": "The student is already in this section."}, status=400)
        check_roll_no(section, roll_no)
        if current:
            current.status = Enrollment.Status.TRANSFERRED
            current.ended_on = timezone.localdate()
            current.save(update_fields=["status", "ended_on", "updated_at"])
        new = Enrollment.objects.create(
            student=student, section=section, academic_year=section.academic_year, roll_no=roll_no
        )
        audit.record(request.user, "student.move", "student", student.pk,
                     before={"section": str(current.section) if current else None}, after={"section": str(section)})
        return Response(EnrollmentSerializer(new).data, status=201)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def leave(self, request, pk=None):
        """Mark a student as left or graduated. Their records stay."""
        student = self.get_object()
        data = LeaveSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        student.status = data.validated_data["status"]
        student.left_on = data.validated_data["left_on"]
        student.save(update_fields=["status", "left_on", "updated_at"])
        student.enrollments.filter(status=Enrollment.Status.ACTIVE).update(
            status=Enrollment.Status.LEFT, ended_on=student.left_on
        )
        services.revoke_role(student.user, Role.STUDENT)
        audit.record(request.user, "student.leave", "student", student.pk, after=dict(request.data))
        return Response(self.get_serializer(student).data)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def rejoin(self, request, pk=None):
        student = self.get_object()
        student.status, student.left_on = Student.Status.ACTIVE, None
        student.save(update_fields=["status", "left_on", "updated_at"])
        services.grant_role(student.user, Role.STUDENT)
        audit.record(request.user, "student.rejoin", "student", student.pk)
        return Response(self.get_serializer(student).data)

    @action(detail=False, methods=["post"])
    @transaction.atomic
    def promote(self, request):
        """Year-end bulk promotion from one section into a section of a later year."""
        data = PromoteSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        src, dst = data.validated_data["from_section"], data.validated_data["to_section"]
        enrollments = Enrollment.objects.filter(section=src, status=Enrollment.Status.ACTIVE).select_related(
            "student"
        )
        if data.validated_data.get("student_ids"):
            enrollments = enrollments.filter(student_id__in=data.validated_data["student_ids"])
        promoted, skipped = [], []
        today = timezone.localdate()
        for e in enrollments:
            if Enrollment.objects.filter(
                student=e.student, academic_year=dst.academic_year, status=Enrollment.Status.ACTIVE
            ).exists():
                skipped.append({"student": str(e.student_id), "reason": "Already enrolled in that year."})
                continue
            roll_no = e.roll_no if data.validated_data["keep_roll_numbers"] else None
            if roll_no is not None and Enrollment.objects.filter(
                section=dst, roll_no=roll_no, status=Enrollment.Status.ACTIVE
            ).exists():
                roll_no = None
            e.status, e.ended_on = Enrollment.Status.PROMOTED, today
            e.save(update_fields=["status", "ended_on", "updated_at"])
            Enrollment.objects.create(student=e.student, section=dst, academic_year=dst.academic_year,
                                      roll_no=roll_no)
            promoted.append(str(e.student_id))
        audit.record(request.user, "student.promote", "section", src.pk,
                     after={"to_section": str(dst.pk), "promoted": len(promoted)})
        return Response({"promoted": promoted, "skipped": skipped})

    @action(detail=True, methods=["post"], url_path="guardians")
    @transaction.atomic
    def add_guardian(self, request, pk=None):
        """Link a parent to this student: an existing one by id, or a new one."""
        student = self.get_object()
        data = GuardianInputSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        guardian = ensure_guardian(data.validated_data)
        link_guardian(student, guardian, data.validated_data.get("is_primary", False))
        audit.record(request.user, "student.link_guardian", "student", student.pk, after={"guardian": str(guardian.pk)})
        return Response(self.get_serializer(student).data, status=201)

    @action(detail=True, methods=["delete"], url_path=r"guardians/(?P<guardian_id>[0-9a-f-]+)")
    def remove_guardian(self, request, pk=None, guardian_id=None):
        student = self.get_object()
        deleted, _ = StudentGuardian.objects.filter(student=student, guardian_id=guardian_id).delete()
        if not deleted:
            return Response({"detail": "This parent is not linked to the student."}, status=404)
        audit.record(request.user, "student.unlink_guardian", "student", student.pk, after={"guardian": guardian_id})
        return Response(status=204)


class TeacherViewSet(RegistrationViewSet):
    """Admins register teachers. A teacher can read their own record."""

    serializer_class = TeacherSerializer
    read_roles = {Role.ADMIN, Role.TEACHER}

    def get_queryset(self):
        qs = Teacher.objects.select_related("user")
        if not has_role(self.request, Role.ADMIN):
            qs = qs.filter(user=self.request.user)
        params = self.request.query_params
        if params.get("status"):
            qs = qs.filter(status=params["status"])
        if params.get("search"):
            term = params["search"]
            qs = qs.filter(Q(user__name__icontains=term) | Q(employee_no__icontains=term))
        return qs

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def leave(self, request, pk=None):
        teacher = self.get_object()
        teacher.status = Teacher.Status.LEFT
        teacher.save(update_fields=["status", "updated_at"])
        SectionSubject.objects.filter(teacher=teacher, section__academic_year__is_current=True).update(teacher=None)
        Section.objects.filter(class_teacher=teacher, academic_year__is_current=True).update(class_teacher=None)
        services.revoke_role(teacher.user, Role.TEACHER)
        audit.record(request.user, "teacher.leave", "teacher", teacher.pk)
        return Response(self.get_serializer(teacher).data)

    @action(detail=True, methods=["delete"], url_path=r"assignments/(?P<assignment_id>[0-9a-f-]+)")
    def remove_assignment(self, request, pk=None, assignment_id=None):
        teacher = self.get_object()
        updated = SectionSubject.objects.filter(pk=assignment_id, teacher=teacher).update(teacher=None)
        return Response(status=204 if updated else 404)


class GuardianViewSet(RegistrationViewSet):
    """Admins register parents. Teachers see parents of students in their
    sections; a parent sees their own record."""

    serializer_class = GuardianSerializer
    read_roles = {Role.ADMIN, Role.TEACHER, Role.PARENT}

    def get_queryset(self):
        qs = Guardian.objects.select_related("user").prefetch_related(
            Prefetch("child_links", queryset=StudentGuardian.objects.select_related("student__user"))
        )
        request = self.request
        if not has_role(request, Role.ADMIN):
            q = Q(pk__in=[])
            if has_role(request, Role.TEACHER):
                sections = teacher_section_ids(teacher_for(request))
                q |= Q(child_links__student__enrollments__section_id__in=sections,
                       child_links__student__enrollments__status=Enrollment.Status.ACTIVE)
            if has_role(request, Role.PARENT):
                q |= Q(user=request.user)
            qs = qs.filter(q)
        if request.query_params.get("search"):
            term = request.query_params["search"]
            qs = qs.filter(Q(user__name__icontains=term) | Q(user__email__icontains=term) |
                           Q(user__phone__icontains=term))
        return qs.distinct()


class AdminViewSet(viewsets.ViewSet):
    """School admins manage the other admins of their school."""

    permission_classes = [IsSchoolAdmin]

    def _rows(self):
        return SchoolMembership.objects.filter(role=Role.ADMIN, is_active=True).select_related("user")

    def list(self, request):
        return Response(AdminSerializer(self._rows(), many=True).data)

    @transaction.atomic
    def create(self, request):
        data = AdminSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        person = data.validated_data["user"]
        user, _ = services.find_or_create_user(person["name"], person["email"], person.get("phone"))
        membership = services.grant_role(user, Role.ADMIN)
        services.send_invite(user)
        audit.record(request.user, "admin.create", "user", user.pk)
        return Response(AdminSerializer(membership).data, status=201)

    @transaction.atomic
    def destroy(self, request, pk=None):
        """Remove admin rights from a person (pk is their user id). Their login stays."""
        membership = get_object_or_404(self._rows(), user_id=pk)
        if self._rows().count() == 1:
            return Response({"detail": "A school needs at least one admin."}, status=400)
        membership.is_active = False
        membership.save(update_fields=["is_active", "updated_at"])
        audit.record(request.user, "admin.remove", "user", pk)
        return Response(status=204)


class MyChildrenView(APIView):
    """A parent's linked children in this school."""

    permission_classes = [SchoolPermission]
    read_roles = {Role.PARENT}

    def get(self, request):
        guardian = guardian_for(request)
        students = Student.objects.filter(guardian_links__guardian=guardian) if guardian else Student.objects.none()
        return Response(StudentSerializer(students.select_related("user"), many=True,
                                          context={"request": request}).data)


class SetupStatusView(APIView):
    """The setup wizard's checklist for a new school."""

    permission_classes = [IsSchoolAdmin]

    def get(self, request):
        year = AcademicYear.objects.filter(is_current=True).first()
        sections = Section.objects.filter(academic_year=year) if year else Section.objects.none()
        counts = {
            "academic_year": 1 if year else 0,
            "classes": SchoolClass.objects.count(),
            "sections": sections.count(),
            "subjects": Subject.objects.count(),
            "subject_teachers": SectionSubject.objects.filter(section__in=sections, teacher__isnull=False).count(),
            "teachers": Teacher.objects.filter(status=Teacher.Status.ACTIVE).count(),
            "students": Enrollment.objects.filter(academic_year=year, status=Enrollment.Status.ACTIVE).count()
            if year else 0,
            "parents": Guardian.objects.count(),
        }
        labels = [
            ("academic_year", "Set the current academic year"),
            ("classes", "Add classes"),
            ("sections", "Add sections for this year"),
            ("subjects", "Add subjects"),
            ("teachers", "Register teachers"),
            ("subject_teachers", "Assign teachers to subjects"),
            ("students", "Register students"),
            ("parents", "Register parents"),
        ]
        steps = [{"key": k, "label": label, "count": counts[k], "done": counts[k] > 0} for k, label in labels]
        return Response({
            "current_academic_year": {"id": str(year.id), "name": year.name} if year else None,
            "steps": steps,
            "complete": all(s["done"] for s in steps),
        })
