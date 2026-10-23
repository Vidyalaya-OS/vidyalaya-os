import os

from django.db import transaction
from django.db.models import Count
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.accounts import audit
from apps.accounts.models import Role
from apps.accounts.permissions import SchoolPermission
from apps.people.models import Enrollment
from apps.people.scoping import (
    can_teach,
    has_role,
    own_section_ids,
    own_student_ids,
    student_for,
    teacher_for,
    teacher_section_ids,
)
from apps.tenancy.context import school_today

from .models import Homework, HomeworkAttachment, HomeworkStatus
from .serializers import MAX_ATTACHMENT_MB, AttachmentSerializer, HomeworkSerializer


class HomeworkViewSet(viewsets.ModelViewSet):
    """Teachers post homework to sections and subjects they teach. Admins
    read everything; students and parents read their own (children's)
    sections, and students mark homework as done.

    Filters: section, subject, student (a parent's child, or a student id an
    admin or teacher looks at), due_from, due_to, upcoming=true (due today or later).
    """

    serializer_class = HomeworkSerializer
    permission_classes = [SchoolPermission]
    write_roles = {Role.TEACHER, Role.STUDENT}
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        qs = Homework.objects.select_related("section__school_class", "subject", "teacher__user").prefetch_related(
            "attachments")
        request = self.request
        params = request.query_params
        if not has_role(request, Role.ADMIN):
            sections = own_section_ids(request)
            if has_role(request, Role.TEACHER):
                sections |= teacher_section_ids(teacher_for(request))
            qs = qs.filter(section_id__in=sections)
        if params.get("section"):
            qs = qs.filter(section_id=params["section"])
        if params.get("subject"):
            qs = qs.filter(subject_id=params["subject"])
        student = self.focus_student()
        if student is not None:
            qs = qs.filter(section__enrollments__student=student,
                           section__enrollments__status=Enrollment.Status.ACTIVE)
        if params.get("upcoming") == "true":
            qs = qs.filter(due_date__gte=school_today())
        if params.get("due_from"):
            qs = qs.filter(due_date__gte=params["due_from"])
        if params.get("due_to"):
            qs = qs.filter(due_date__lte=params["due_to"])
        if has_role(request, Role.ADMIN, Role.TEACHER):
            qs = qs.annotate(done_count=Count("statuses", distinct=True))
        return qs.order_by("due_date", "created_at")

    def focus_student(self):
        """The student whose done marks are shown: the student themself, or
        the ?student= child of a parent."""
        wanted = self.request.query_params.get("student")
        if wanted:
            if not has_role(self.request, Role.ADMIN, Role.TEACHER) and wanted not in {
                    str(i) for i in own_student_ids(self.request)}:
                raise PermissionDenied("You can only see your own or your children's homework.")
            return wanted
        if has_role(self.request, Role.STUDENT):
            student = student_for(self.request)
            return str(student.pk) if student else None
        return None

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["today"] = school_today()
        student = self.focus_student() if self.request.method == "GET" else None
        if student:
            ctx["done_ids"] = set(HomeworkStatus.objects.filter(student_id=student).values_list(
                "homework_id", flat=True))
        return ctx

    def check_can_post(self, section, subject):
        if not has_role(self.request, Role.TEACHER) or not can_teach(self.request, section.pk, subject.pk):
            raise PermissionDenied("You can only post homework for a section and subject you teach.")

    def check_owner(self, homework):
        teacher = teacher_for(self.request)
        if homework.created_by_id != self.request.user.pk and (teacher is None or homework.teacher_id != teacher.pk):
            raise PermissionDenied("Only the teacher who posted this homework can change it.")

    @transaction.atomic
    def perform_create(self, serializer):
        self.check_can_post(serializer.validated_data["section"], serializer.validated_data["subject"])
        hw = serializer.save(teacher=teacher_for(self.request), created_by=self.request.user,
                             assigned_on=school_today())
        for f in self.request.FILES.getlist("files"):
            self.add_file(hw, f)
        audit.record(self.request.user, "homework.create", "homework", hw.pk, after={"title": hw.title})

    def perform_update(self, serializer):
        self.check_owner(serializer.instance)
        subject = serializer.validated_data.get("subject", serializer.instance.subject)
        self.check_can_post(serializer.instance.section, subject)
        serializer.save()

    def perform_destroy(self, instance):
        self.check_owner(instance)
        audit.record(self.request.user, "homework.delete", "homework", instance.pk, before={"title": instance.title})
        instance.delete()

    def create(self, request, *args, **kwargs):
        if not has_role(request, Role.TEACHER):
            raise PermissionDenied("Only teachers post homework.")
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if not has_role(request, Role.TEACHER):
            raise PermissionDenied("Only teachers change homework.")
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if not has_role(request, Role.TEACHER):
            raise PermissionDenied("Only teachers remove homework.")
        return super().destroy(request, *args, **kwargs)

    @staticmethod
    def add_file(homework, f):
        if f.size > MAX_ATTACHMENT_MB * 1024 * 1024:
            raise ValidationError({"files": f"{f.name} is larger than {MAX_ATTACHMENT_MB} MB."})
        name = os.path.basename(f.name)[:200]
        return HomeworkAttachment.objects.create(homework=homework, file=f, name=name, size=f.size)

    @action(detail=True, methods=["post"], url_path="attachments")
    def upload(self, request, pk=None):
        homework = self.get_object()
        self.check_owner(homework)
        files = request.FILES.getlist("files") or request.FILES.getlist("file")
        if not files:
            raise ValidationError({"files": "Attach at least one file."})
        added = [self.add_file(homework, f) for f in files]
        return Response(AttachmentSerializer(added, many=True).data, status=201)

    @action(detail=True, methods=["get", "delete"], url_path=r"attachments/(?P<attachment_id>[0-9a-f-]+)")
    def attachment(self, request, pk=None, attachment_id=None):
        homework = self.get_object()
        item = get_object_or_404(HomeworkAttachment, pk=attachment_id, homework=homework)
        if request.method == "DELETE":
            self.check_owner(homework)
            item.file.delete(save=False)
            item.delete()
            return Response(status=204)
        return FileResponse(item.file.open("rb"), as_attachment=True, filename=item.name)

    @action(detail=True, methods=["post", "delete"])
    def done(self, request, pk=None):
        """A student marks homework as done (POST) or not done (DELETE)."""
        homework = self.get_object()
        student = student_for(request) if has_role(request, Role.STUDENT) else None
        if student is None:
            raise PermissionDenied("Only students mark their homework as done.")
        if request.method == "DELETE":
            HomeworkStatus.objects.filter(homework=homework, student=student).delete()
            return Response({"done": False})
        HomeworkStatus.objects.get_or_create(homework=homework, student=student,
                                             defaults={"done_at": timezone.now()})
        return Response({"done": True})

    @action(detail=True, methods=["get"])
    def statuses(self, request, pk=None):
        """Which students of the section have marked it done (staff only)."""
        homework = self.get_object()
        if not has_role(request, Role.ADMIN, Role.TEACHER):
            raise PermissionDenied("Only staff can see this.")
        done = dict(HomeworkStatus.objects.filter(homework=homework).values_list("student_id", "done_at"))
        rows = [{"student": str(e.student_id), "name": e.student.user.name, "roll_no": e.roll_no,
                 "done": e.student_id in done, "done_at": done.get(e.student_id)}
                for e in Enrollment.objects.filter(section=homework.section, status=Enrollment.Status.ACTIVE)
                .select_related("student__user").order_by("roll_no", "student__user__name")]
        return Response(rows)
