"""Turning marks into results: percentages, grades, class averages, totals."""

from decimal import Decimal

from django.db.models import Avg, Count, Max, Q

from apps.attendance.models import AttendanceRecord
from apps.attendance.stats import summarize

from .models import Exam, Mark, grade_for


def pct(obtained, maximum):
    if obtained is None or not maximum:
        return None
    return round(float(obtained) * 100 / float(maximum), 1)


def exam_stats(exam_ids):
    """Class average, highest mark and how many sat, per exam (absentees left out)."""
    rows = (
        Mark.objects.filter(exam_id__in=exam_ids, is_absent=False, marks_obtained__isnull=False)
        .values("exam_id").annotate(average=Avg("marks_obtained"), highest=Max("marks_obtained"), sat=Count("id"))
    )
    return {r["exam_id"]: {"average": round(float(r["average"]), 2), "highest": r["highest"], "sat": r["sat"]}
            for r in rows}


def student_exams(student, term, published_only):
    """The term's tests of every section the student was in that year. If the
    student moved section, the test they have a mark in wins for a subject."""
    exams = Exam.objects.filter(
        exam_term=term, section__enrollments__student=student, section__enrollments__academic_year=term.academic_year
    ).select_related("subject").distinct().order_by("subject__name")
    if published_only:
        exams = exams.filter(status=Exam.Status.PUBLISHED)
    marks = {m.exam_id: m for m in Mark.objects.filter(exam__in=exams, enrollment__student=student)}
    by_subject = {}
    for exam in exams:
        if exam.subject_id not in by_subject or exam.pk in marks:
            by_subject[exam.subject_id] = exam
    return list(by_subject.values()), marks


def term_report(student, term, published_only):
    exams, marks = student_exams(student, term, published_only)
    stats = exam_stats([e.pk for e in exams])
    bands = term.bands
    subjects, total, total_max = [], Decimal(0), Decimal(0)
    for exam in exams:
        mark = marks.get(exam.pk)
        obtained = None if mark is None or mark.is_absent else mark.marks_obtained
        p = pct(obtained, exam.max_marks)
        if mark is not None and (mark.is_absent or mark.marks_obtained is not None):
            total += obtained or 0
            total_max += exam.max_marks
        s = stats.get(exam.pk, {})
        subjects.append({
            "exam": str(exam.pk), "subject": str(exam.subject_id), "subject_name": exam.subject.name,
            "date": exam.date, "max_marks": exam.max_marks, "pass_marks": exam.pass_marks,
            "marks_obtained": obtained, "is_absent": bool(mark and mark.is_absent),
            "remark": mark.remark if mark else "", "percentage": p, "grade": grade_for(p, bands),
            "passed": None if exam.pass_marks is None or mark is None else (obtained or 0) >= exam.pass_marks,
            "class_average": s.get("average"), "highest": s.get("highest"), "status": exam.status,
        })
    overall = pct(total, total_max)
    return {
        "exam_term": str(term.pk), "exam_term_name": term.name, "subjects": subjects,
        "total": total, "total_max": total_max, "percentage": overall, "grade": grade_for(overall, bands),
    }


def term_attendance(student, term):
    records = AttendanceRecord.objects.filter(enrollment__student=student,
                                              enrollment__academic_year=term.academic_year)
    if term.start_date:
        records = records.filter(date__gte=term.start_date)
    if term.end_date:
        records = records.filter(date__lte=term.end_date)
    return summarize(records.values_list("status", flat=True))


def marks_progress(exams):
    """Exams annotated with how many marks are in and how many students sat it."""
    return exams.annotate(
        marks_entered=Count("marks", filter=Q(marks__is_absent=True) | Q(marks__marks_obtained__isnull=False),
                            distinct=True),
        students=Count("section__enrollments", filter=Q(section__enrollments__status="active"), distinct=True),
    )
