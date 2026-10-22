from collections import Counter
from datetime import date, timedelta

from django.db import transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academics.models import AcademicYear, Section
from apps.accounts import audit
from apps.accounts.models import Role
from apps.accounts.permissions import SchoolPermission
from apps.people.models import Enrollment
from apps.people.scoping import (
    active_enrollments,
    can_manage_section,
    class_teacher_section_ids,
    has_role,
    teacher_for,
    teacher_section_ids,
    visible_students,
)
from apps.tenancy.context import school_today

from .models import AttendanceRecord
from .serializers import SheetSerializer
from .stats import summarize

def parse_date(value, default=None, field="date"):
    if not value:
        return default
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise ValidationError({field: "Use the format YYYY-MM-DD."})


def parse_month(value):
    """'2026-10' -> (first day, last day). Defaults to this month."""
    try:
        first = date.fromisoformat(f"{value}-01") if value else school_today().replace(day=1)
    except ValueError:
        raise ValidationError({"month": "Use the format YYYY-MM."})
    last = (first.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
    return first, last


def current_year():
    return AcademicYear.objects.filter(is_current=True).first()


def staff_sections(request):
    """Sections an admin (all, this year) or teacher (their own) may manage."""
    qs = Section.objects.filter(academic_year__is_current=True).select_related("school_class")
    if not has_role(request, Role.ADMIN):
        qs = qs.filter(pk__in=teacher_section_ids(teacher_for(request)))
    return qs.order_by("school_class__order", "school_class__name", "name")


class StaffView(APIView):
    permission_classes = [SchoolPermission]
    read_roles = {Role.ADMIN, Role.TEACHER}
    write_roles = {Role.ADMIN, Role.TEACHER}

    def section_or_403(self, request, section_id):
        section = get_object_or_404(Section.objects.select_related("school_class", "academic_year"), pk=section_id)
        if not can_manage_section(request, section.pk):
            raise PermissionDenied("You do not teach this section.")
        return section


class AttendanceSheetView(StaffView):
    """GET a section's roll call for a day; POST it back to save.

    Everyone starts present, so a teacher only taps the absent or late ones.
    """

    def get(self, request):
        section = self.section_or_403(request, request.query_params.get("section"))
        day = parse_date(request.query_params.get("date"), school_today())
        return Response(self.sheet(section, day))

    def sheet(self, section, day):
        records = {
            r.enrollment_id: r
            for r in AttendanceRecord.objects.filter(enrollment__section=section, date=day).select_related(
                "marked_by")
        }
        last = max(records.values(), key=lambda r: r.updated_at, default=None)
        students = [
            {
                "enrollment": str(e.pk), "student": str(e.student_id), "name": e.student.user.name,
                "roll_no": e.roll_no, "admission_no": e.student.admission_no,
                "status": records[e.pk].status if e.pk in records else AttendanceRecord.Status.PRESENT,
                "remark": records[e.pk].remark if e.pk in records else "",
                "marked": e.pk in records,
            }
            for e in active_enrollments(section.pk)
        ]
        return {
            "section": str(section.pk), "section_name": str(section), "date": day,
            "marked": bool(records), "marked_by": last.marked_by.name if last else None,
            "updated_at": last.updated_at if last else None,
            "students": students, "summary": summarize(s["status"] for s in students),
        }

    @transaction.atomic
    def post(self, request):
        data = SheetSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        section, day = data.validated_data["section"], data.validated_data["date"]
        self.section_or_403(request, section.pk)
        today = school_today()
        if day > today:
            raise ValidationError({"date": "Attendance cannot be marked for a future date."})
        year = section.academic_year
        if not (year.start_date <= day <= year.end_date):
            raise ValidationError({"date": f"This date is outside the {year.name} academic year."})
        enrollments = {e.pk: e for e in active_enrollments(section.pk)}
        given = {}
        for row in data.validated_data["records"]:
            if row["enrollment"].pk not in enrollments:
                raise ValidationError({"records": f"{row['enrollment'].student} is not in {section}."})
            given[row["enrollment"].pk] = row
        existing = {r.enrollment_id: r for r in AttendanceRecord.objects.filter(
            enrollment_id__in=enrollments, date=day)}
        changed = []
        for pk in enrollments:
            row = given.get(pk, {"status": AttendanceRecord.Status.PRESENT, "remark": ""})
            record = existing.get(pk)
            if record is None:
                AttendanceRecord.objects.create(enrollment_id=pk, date=day, status=row["status"],
                                                remark=row.get("remark", ""), marked_by=request.user)
            elif (record.status, record.remark) != (row["status"], row.get("remark", "")):
                changed.append({"enrollment": str(pk), "from": record.status, "to": row["status"]})
                record.status, record.remark, record.marked_by = row["status"], row.get("remark", ""), request.user
                record.save(update_fields=["status", "remark", "marked_by", "updated_at"])
        if changed and day < today:
            # Changes after the day are logged with who and when.
            audit.record(request.user, "attendance.change_after_day", "section", section.pk,
                         after={"date": day.isoformat(), "changes": changed})
        return Response(self.sheet(section, day))


class StudentAttendanceView(APIView):
    """A student's month calendar and year percentage. Admins, the student's
    teachers, the student and their parents can read it."""

    permission_classes = [SchoolPermission]

    def get(self, request, student_id):
        student = get_object_or_404(visible_students(request), pk=student_id)
        first, last = parse_month(request.query_params.get("month"))
        records = AttendanceRecord.objects.filter(enrollment__student=student)
        month = list(records.filter(date__range=(first, last)).order_by("date"))
        year = current_year()
        year_statuses = (
            records.filter(enrollment__academic_year=year).values_list("status", flat=True) if year else []
        )
        return Response({
            "student": str(student.pk), "name": student.user.name,
            "month": first.strftime("%Y-%m"), "first_day": first, "last_day": last,
            "days": [{"date": r.date, "status": r.status, "remark": r.remark} for r in month],
            "month_summary": summarize(r.status for r in month),
            "academic_year": year.name if year else None,
            "year_summary": summarize(year_statuses),
        })


class DailyReportView(StaffView):
    """Each section's attendance for one day, and the school total."""

    def get(self, request):
        day = parse_date(request.query_params.get("date"), school_today())
        sections = staff_sections(request).annotate(
            students=Count("enrollments", filter=Q(enrollments__status=Enrollment.Status.ACTIVE), distinct=True))
        counts = {}
        for section_id, status, n in (
            AttendanceRecord.objects.filter(date=day, enrollment__section__in=sections)
            .values_list("enrollment__section_id", "status").annotate(n=Count("id"))
        ):
            counts.setdefault(section_id, Counter())[status] = n
        rows, total = [], Counter()
        for s in sections:
            c = counts.get(s.pk, Counter())
            total.update(c)
            rows.append({"section": str(s.pk), "section_name": str(s), "students": s.students,
                         "marked": bool(c), **summarize(c.elements())})
        return Response({"date": day, "sections": rows, "total": summarize(total.elements()),
                         "unmarked_sections": sum(1 for r in rows if not r["marked"])})


def student_rows(records):
    """Per-student summaries from a queryset of attendance records."""
    per = {}
    for enrollment_id, status in records.values_list("enrollment_id", "status"):
        per.setdefault(enrollment_id, []).append(status)
    return per


class MonthlyReportView(StaffView):
    """Each student of a section over a month (or a date range)."""

    def get(self, request):
        section = self.section_or_403(request, request.query_params.get("section"))
        first, last = parse_month(request.query_params.get("month"))
        per = student_rows(AttendanceRecord.objects.filter(enrollment__section=section, date__range=(first, last)))
        rows = [
            {"student": str(e.student_id), "name": e.student.user.name, "roll_no": e.roll_no,
             **summarize(per.get(e.pk, []))}
            for e in active_enrollments(section.pk)
        ]
        return Response({"section": str(section.pk), "section_name": str(section), "month": first.strftime("%Y-%m"),
                         "students": rows})


class LowAttendanceView(StaffView):
    """Students under a threshold (default 75%) this academic year."""

    def get(self, request):
        try:
            threshold = float(request.query_params.get("threshold", 75))
        except ValueError:
            raise ValidationError({"threshold": "Give a number, such as 75."})
        sections = staff_sections(request)
        if request.query_params.get("section"):
            sections = sections.filter(pk=request.query_params["section"])
        enrollments = Enrollment.objects.filter(section__in=sections, status=Enrollment.Status.ACTIVE).select_related(
            "student__user", "section__school_class")
        per = student_rows(AttendanceRecord.objects.filter(enrollment__in=enrollments))
        rows = []
        for e in enrollments:
            s = summarize(per.get(e.pk, []))
            if s["percentage"] is not None and s["percentage"] < threshold:
                rows.append({"student": str(e.student_id), "name": e.student.user.name,
                             "section_name": str(e.section), "roll_no": e.roll_no, **s})
        rows.sort(key=lambda r: r["percentage"])
        return Response({"threshold": threshold, "students": rows})


class PendingAttendanceView(StaffView):
    """Sections still to mark today: a teacher's class-teacher sections (or
    the sections they teach, if they are nobody's class teacher); every
    section for an admin."""

    def get(self, request):
        day = parse_date(request.query_params.get("date"), school_today())
        sections = staff_sections(request)
        if not has_role(request, Role.ADMIN):
            own = class_teacher_section_ids(teacher_for(request))
            if own:
                sections = sections.filter(pk__in=own)
        marked = set(AttendanceRecord.objects.filter(date=day, enrollment__section__in=sections).values_list(
            "enrollment__section_id", flat=True))
        return Response({"date": day, "sections": [
            {"section": str(s.pk), "section_name": str(s), "marked": s.pk in marked} for s in sections
        ]})
