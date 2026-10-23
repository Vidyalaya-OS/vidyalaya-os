from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academics.models import Section, SectionSubject
from apps.academics.views import SchoolScopedViewSet
from apps.accounts import audit
from apps.accounts.models import Role
from apps.accounts.permissions import IsSchoolAdmin, SchoolPermission
from apps.people.models import Enrollment
from apps.people.scoping import (
    active_enrollments,
    can_manage_section,
    can_teach,
    class_teacher_section_ids,
    has_role,
    own_section_ids,
    teacher_for,
    teacher_section_ids,
    teacher_subject_pairs,
    visible_students,
)

from .models import Exam, ExamTerm, GradeScale, Mark, ReportCard, grade_for
from .results import exam_stats, marks_progress, pct, term_attendance, term_report
from .serializers import (
    CreateExamsSerializer,
    ExamSerializer,
    ExamTermSerializer,
    GradeScaleSerializer,
    MarksSheetSerializer,
    RemarksSerializer,
    SectionTermSerializer,
)


def is_staff(request):
    return has_role(request, Role.ADMIN, Role.TEACHER)


class GradeScaleViewSet(SchoolScopedViewSet):
    queryset = GradeScale.objects.all()
    serializer_class = GradeScaleSerializer
    pagination_class = None


class ExamTermViewSet(SchoolScopedViewSet):
    """Exam terms of a year (the current one unless ?academic_year= is given)."""

    serializer_class = ExamTermSerializer
    pagination_class = None

    def get_queryset(self):
        qs = ExamTerm.objects.select_related("academic_year", "grade_scale")
        year = self.request.query_params.get("academic_year")
        return qs.filter(academic_year_id=year) if year else qs.filter(academic_year__is_current=True)

    @action(detail=True, methods=["post"], url_path="create-exams")
    @transaction.atomic
    def create_exams(self, request, pk=None):
        """Add a test for every subject taught in the given sections (or every
        section of a class). Tests that already exist are left alone."""
        term = self.get_object()
        data = CreateExamsSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        sections = data.validated_data.get("sections") or []
        if data.validated_data.get("school_class"):
            sections += list(Section.objects.filter(school_class=data.validated_data["school_class"],
                                                    academic_year=term.academic_year))
        if not sections:
            raise ValidationError({"sections": "Choose sections or a class."})
        if any(s.academic_year_id != term.academic_year_id for s in sections):
            raise ValidationError({"sections": "Every section must be in the term's academic year."})
        created = 0
        for link in SectionSubject.objects.filter(section__in=sections):
            _, new = Exam.objects.get_or_create(
                exam_term=term, section_id=link.section_id, subject_id=link.subject_id,
                defaults={"max_marks": data.validated_data["max_marks"],
                          "pass_marks": data.validated_data.get("pass_marks"),
                          "date": data.validated_data.get("date")})
            created += new
        audit.record(request.user, "exam_term.create_exams", "exam_term", term.pk, after={"created": created})
        return Response({"created": created}, status=201)


class ExamViewSet(viewsets.ModelViewSet):
    """Tests. Admins manage all; teachers manage tests of subjects they teach
    (or sections they are class teacher of). Students and parents can list
    their sections' tests; their marks show through results once published.

    Filters: exam_term, section, subject, status, mine=true (teacher).
    """

    serializer_class = ExamSerializer
    permission_classes = [SchoolPermission]
    write_roles = {Role.ADMIN, Role.TEACHER}
    pagination_class = None

    def get_queryset(self):
        qs = Exam.objects.select_related("exam_term", "section__school_class", "subject")
        request, params = self.request, self.request.query_params
        if not has_role(request, Role.ADMIN):
            sections = own_section_ids(request)
            if has_role(request, Role.TEACHER):
                sections |= teacher_section_ids(teacher_for(request))
            qs = qs.filter(section_id__in=sections)
        if params.get("exam_term"):
            qs = qs.filter(exam_term_id=params["exam_term"])
        else:
            qs = qs.filter(exam_term__academic_year__is_current=True)
        for key in ("section", "subject", "status"):
            if params.get(key):
                qs = qs.filter(**{key: params[key]})
        if params.get("mine") == "true" and has_role(request, Role.TEACHER):
            teacher = teacher_for(request)
            mine = Q(section_id__in=class_teacher_section_ids(teacher))
            for section_id, subject_id in teacher_subject_pairs(teacher):
                mine |= Q(section_id=section_id, subject_id=subject_id)
            qs = qs.filter(mine)
        return marks_progress(qs).order_by("exam_term__order", "section__school_class__order", "section__name",
                                            "subject__name")

    def check_teaches(self, section, subject):
        if not can_teach(self.request, section.pk, subject.pk):
            raise PermissionDenied("You can only manage tests for subjects you teach.")

    def perform_create(self, serializer):
        self.check_teaches(serializer.validated_data["section"], serializer.validated_data["subject"])
        exam = serializer.save()
        audit.record(self.request.user, "exam.create", "exam", exam.pk, after={"exam": str(exam)})

    def perform_update(self, serializer):
        self.check_teaches(serializer.instance.section, serializer.instance.subject)
        serializer.save()

    def perform_destroy(self, instance):
        self.check_teaches(instance.section, instance.subject)
        if instance.is_locked or instance.marks.exists():
            raise ValidationError({"detail": "Marks are already entered for this test, so it can't be removed."})
        audit.record(self.request.user, "exam.delete", "exam", instance.pk, before={"exam": str(instance)})
        instance.delete()

    def staff_exam(self):
        exam = self.get_object()
        self.check_teaches(exam.section, exam.subject)
        return exam

    @action(detail=True, methods=["get", "put"])
    def marks(self, request, pk=None):
        """The marks grid for one test: GET the roster, PUT rows to save."""
        exam = self.staff_exam()
        if request.method == "PUT":
            self.save_marks(request, exam)
        marks = {m.enrollment_id: m for m in exam.marks.all()}
        rows = []
        for e in self.roster(exam, marks):
            m = marks.get(e.pk)
            rows.append({
                "enrollment": str(e.pk), "student": str(e.student_id), "name": e.student.user.name,
                "roll_no": e.roll_no, "admission_no": e.student.admission_no,
                "marks_obtained": m.marks_obtained if m else None, "is_absent": m.is_absent if m else False,
                "remark": m.remark if m else "", "entered": m is not None,
            })
        stats = exam_stats([exam.pk]).get(exam.pk, {})
        return Response({"exam": ExamSerializer(marks_progress(Exam.objects.filter(pk=exam.pk)).get()).data,
                         "locked": exam.is_locked, "rows": rows, "class_average": stats.get("average"),
                         "highest": stats.get("highest")})

    @staticmethod
    def roster(exam, marks):
        """Active students of the section, plus anyone who already has a mark (moved or left since)."""
        return (Enrollment.objects.filter(section=exam.section)
                .filter(status=Enrollment.Status.ACTIVE) | Enrollment.objects.filter(pk__in=list(marks))
                ).select_related("student__user").distinct().order_by("roll_no", "student__user__name")

    @transaction.atomic
    def save_marks(self, request, exam):
        if exam.is_locked:
            raise ValidationError({"detail": "Results are published, so marks are locked. Ask the admin to unpublish."})
        data = MarksSheetSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        allowed = set(Enrollment.objects.filter(section=exam.section).values_list("pk", flat=True))
        existing = {m.enrollment_id: m for m in exam.marks.select_for_update()}
        changes, errors = [], {}
        for i, row in enumerate(data.validated_data["rows"]):
            eid, value, absent = row["enrollment"], row.get("marks_obtained"), row["is_absent"]
            if eid not in allowed:
                errors[str(eid)] = "This student is not in the section."
                continue
            if value is not None and value > exam.max_marks:
                errors[str(eid)] = f"Marks can't be above {exam.max_marks:g}."
                continue
            if absent:
                value = None
            mark = existing.get(eid)
            if mark is None:
                if value is None and not absent and not row["remark"]:
                    continue
                Mark.objects.create(exam=exam, enrollment_id=eid, marks_obtained=value, is_absent=absent,
                                    remark=row["remark"], entered_by=request.user)
                changes.append({"enrollment": str(eid), "from": None, "to": "absent" if absent else str(value)})
            elif (mark.marks_obtained, mark.is_absent, mark.remark) != (value, absent, row["remark"]):
                before = "absent" if mark.is_absent else str(mark.marks_obtained)
                mark.marks_obtained, mark.is_absent, mark.remark = value, absent, row["remark"]
                mark.entered_by = request.user
                mark.save(update_fields=["marks_obtained", "is_absent", "remark", "entered_by", "updated_at"])
                changes.append({"enrollment": str(eid), "from": before, "to": "absent" if absent else str(value)})
        if errors:
            transaction.set_rollback(True)
            raise ValidationError({"rows": errors})
        if changes:
            audit.record(request.user, "marks.save", "exam", exam.pk, after={"changes": changes})

    @action(detail=True, methods=["post"], permission_classes=[IsSchoolAdmin])
    def publish(self, request, pk=None):
        """Publish results: students and parents see them, and marks lock."""
        exam = self.get_object()
        self.publish_exams(request, Exam.objects.filter(pk=exam.pk), request.data.get("allow_missing", False))
        return Response(ExamSerializer(marks_progress(Exam.objects.filter(pk=exam.pk)).get()).data)

    @action(detail=True, methods=["post"], permission_classes=[IsSchoolAdmin])
    def unpublish(self, request, pk=None):
        """Hide results again and unlock marks, to correct a mistake. Logged."""
        exam = self.get_object()
        if ReportCard.objects.filter(exam_term=exam.exam_term, section=exam.section,
                                     published_at__isnull=False).exists():
            raise ValidationError({"detail": "Report cards for this section are published. Unpublish them first."})
        Exam.objects.filter(pk=exam.pk).update(status=Exam.Status.DRAFT, published_at=None)
        audit.record(request.user, "exam.unpublish", "exam", exam.pk)
        return Response(ExamSerializer(marks_progress(Exam.objects.filter(pk=exam.pk)).get()).data)

    @staticmethod
    def publish_exams(request, exams, allow_missing):
        missing = []
        for exam in exams.filter(status=Exam.Status.DRAFT).select_related("subject", "section__school_class"):
            have = set(exam.marks.filter(is_absent=True).values_list("enrollment_id", flat=True)) | set(
                exam.marks.filter(marks_obtained__isnull=False).values_list("enrollment_id", flat=True))
            for e in active_enrollments(exam.section_id):
                if e.pk not in have:
                    missing.append(f"{e.student.user.name} ({exam.subject.name})")
        if missing and not allow_missing:
            raise ValidationError({"missing": missing,
                                   "detail": f"{len(missing)} marks are not entered yet. Publish anyway?"})
        ids = list(exams.filter(status=Exam.Status.DRAFT).values_list("pk", flat=True))
        Exam.objects.filter(pk__in=ids).update(status=Exam.Status.PUBLISHED, published_at=timezone.now())
        for pk in ids:
            audit.record(request.user, "exam.publish", "exam", pk, after={"missing": len(missing)})
        return ids

    @action(detail=True, methods=["get"])
    def results(self, request, pk=None):
        """Every student's result in one test, for staff."""
        exam = self.staff_exam()
        bands = exam.exam_term.bands
        stats = exam_stats([exam.pk]).get(exam.pk, {})
        rows = []
        for m in exam.marks.select_related("enrollment__student__user").order_by("enrollment__roll_no"):
            p = pct(m.marks_obtained, exam.max_marks)
            rows.append({"student": str(m.enrollment.student_id), "name": m.enrollment.student.user.name,
                         "roll_no": m.enrollment.roll_no, "marks_obtained": m.marks_obtained,
                         "is_absent": m.is_absent, "percentage": p, "grade": grade_for(p, bands)})
        return Response({"exam": str(exam.pk), "class_average": stats.get("average"), "highest": stats.get("highest"),
                         "rows": rows})


def terms_for(request):
    year = request.query_params.get("academic_year")
    if year:
        return ExamTerm.objects.filter(academic_year_id=year)
    return ExamTerm.objects.filter(academic_year__is_current=True)


class StudentResultsView(APIView):
    """A student's test results, term by term. Students and parents only see
    published results; staff see everything entered so far."""

    permission_classes = [SchoolPermission]

    def get(self, request, student_id):
        student = get_object_or_404(visible_students(request), pk=student_id)
        terms = terms_for(request).order_by("order", "start_date", "name")
        if request.query_params.get("exam_term"):
            terms = terms.filter(pk=request.query_params["exam_term"])
        published_only = not is_staff(request)
        published_cards = set(ReportCard.objects.filter(student=student, published_at__isnull=False).values_list(
            "exam_term_id", flat=True))
        out = []
        for term in terms:
            report = term_report(student, term, published_only)
            report["report_card_published"] = term.pk in published_cards
            out.append(report)
        return Response({"student": str(student.pk), "name": student.user.name, "terms": out})


class StaffSectionTermMixin:
    def section_term(self, request, data):
        s = SectionTermSerializer(data=data)
        s.is_valid(raise_exception=True)
        term, section = s.validated_data["exam_term"], s.validated_data["section"]
        if not can_manage_section(request, section.pk):
            raise PermissionDenied("You do not teach this section.")
        if term.academic_year_id != section.academic_year_id:
            raise ValidationError({"section": "The section and the term are in different academic years."})
        return term, section


class SectionReportCardsView(StaffSectionTermMixin, APIView):
    """Report cards of one section for one term: totals, attendance, remarks
    and whether each is published. Staff only."""

    permission_classes = [SchoolPermission]
    read_roles = {Role.ADMIN, Role.TEACHER}

    def get(self, request):
        term, section = self.section_term(request, request.query_params)
        cards = {c.student_id: c for c in ReportCard.objects.filter(exam_term=term, section=section)}
        rows = []
        for e in active_enrollments(section.pk):
            report = term_report(e.student, term, published_only=False)
            card = cards.get(e.student_id)
            rows.append({
                "student": str(e.student_id), "name": e.student.user.name, "roll_no": e.roll_no,
                "total": report["total"], "total_max": report["total_max"], "percentage": report["percentage"],
                "grade": report["grade"], "attendance": term_attendance(e.student, term)["percentage"],
                "remarks": card.remarks if card else "", "published_at": card.published_at if card else None,
            })
        exams = Exam.objects.filter(exam_term=term, section=section)
        return Response({
            "exam_term": str(term.pk), "exam_term_name": term.name, "section": str(section.pk),
            "section_name": str(section), "rows": rows,
            "exams": ExamSerializer(marks_progress(exams), many=True).data,
            "published": bool(rows) and all(r["published_at"] for r in rows),
        })


class ReportCardRemarksView(StaffSectionTermMixin, APIView):
    """Teachers of the section (or admins) write each student's remarks."""

    permission_classes = [SchoolPermission]
    write_roles = {Role.ADMIN, Role.TEACHER}

    @transaction.atomic
    def put(self, request):
        term, section = self.section_term(request, request.data)
        data = RemarksSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        students = {e.student_id for e in active_enrollments(section.pk)}
        for row in data.validated_data["rows"]:
            if row["student"] not in students:
                raise ValidationError({"rows": f"Student {row['student']} is not in {section}."})
            card, _ = ReportCard.objects.get_or_create(student_id=row["student"], exam_term=term,
                                                       defaults={"section": section})
            if card.published_at:
                raise ValidationError({"detail": "Some report cards are published. Ask the admin to unpublish first."})
            if card.remarks != row["remarks"] or card.section_id != section.pk:
                card.remarks, card.remarks_by, card.section = row["remarks"], request.user, section
                card.save(update_fields=["remarks", "remarks_by", "section", "updated_at"])
        return Response({"saved": len(data.validated_data["rows"])})


class PublishReportCardsView(StaffSectionTermMixin, APIView):
    """Admins publish (POST) or unpublish (DELETE) a section's report cards
    for a term. Publishing also publishes the term's tests and locks marks."""

    permission_classes = [IsSchoolAdmin]

    @transaction.atomic
    def post(self, request):
        term, section = self.section_term(request, request.data)
        ExamViewSet.publish_exams(request, Exam.objects.filter(exam_term=term, section=section),
                                  request.data.get("allow_missing", False))
        now, count = timezone.now(), 0
        for e in active_enrollments(section.pk):
            card, _ = ReportCard.objects.get_or_create(student=e.student, exam_term=term, defaults={"section": section})
            card.section = section
            card.attendance_pct = term_attendance(e.student, term)["percentage"]
            card.published_at = now
            card.save(update_fields=["section", "attendance_pct", "published_at", "updated_at"])
            count += 1
        audit.record(request.user, "report_cards.publish", "section", section.pk,
                     after={"exam_term": str(term.pk), "count": count})
        return Response({"published": count})

    @transaction.atomic
    def delete(self, request):
        term, section = self.section_term(request, request.data or request.query_params)
        count = ReportCard.objects.filter(exam_term=term, section=section).update(published_at=None)
        audit.record(request.user, "report_cards.unpublish", "section", section.pk, after={"exam_term": str(term.pk)})
        return Response({"unpublished": count}, status=status.HTTP_200_OK)


class StudentReportCardView(APIView):
    """One student's report card for one term, ready to print. Students and
    parents only get it once it is published."""

    permission_classes = [SchoolPermission]

    def get(self, request, student_id, term_id):
        student = get_object_or_404(visible_students(request).select_related("user"), pk=student_id)
        term = get_object_or_404(ExamTerm.objects.select_related("academic_year"), pk=term_id)
        card = ReportCard.objects.filter(student=student, exam_term=term).select_related(
            "section__school_class", "section__class_teacher__user").first()
        published = bool(card and card.published_at)
        if not published and not is_staff(request):
            return Response({"detail": "This report card is not published yet."}, status=404)
        enrollment = (Enrollment.objects.filter(student=student, academic_year=term.academic_year)
                      .select_related("section__school_class", "section__class_teacher__user")
                      .order_by("-status", "-created_at").first())
        section = card.section if card else (enrollment.section if enrollment else None)
        school = request.school
        attendance = term_attendance(student, term)
        if published and card.attendance_pct is not None:
            attendance["percentage"] = float(card.attendance_pct)
        return Response({
            "school": {"name": school.name, "address": school.address, "board": school.board,
                       "logo": request.build_absolute_uri(school.logo.url) if school.logo else None},
            "student": {"id": str(student.pk), "name": student.user.name, "admission_no": student.admission_no,
                        "dob": student.dob, "roll_no": enrollment.roll_no if enrollment else None},
            "section_name": str(section) if section else None,
            "class_teacher": section.class_teacher.user.name if section and section.class_teacher else None,
            "academic_year": term.academic_year.name,
            "result": term_report(student, term, published_only=not is_staff(request)),
            "attendance": attendance,
            "remarks": card.remarks if card else "",
            "published_at": card.published_at if card else None,
            "bands": term.bands,
        })
