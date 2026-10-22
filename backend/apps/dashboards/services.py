"""What the student and parent home screens show, built from the feature
apps. Every query runs inside the request's school (row-level security), and
callers only pass students the user may see."""

from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from apps.academics.models import AcademicYear
from apps.attendance.models import AttendanceRecord
from apps.attendance.stats import summarize
from apps.exams.models import Exam, Mark, ReportCard, grade_for
from apps.exams.results import exam_stats, pct
from apps.fees.models import StudentFeeDue
from apps.fees.services import dues_with_balance, totals
from apps.homework.models import Homework, HomeworkStatus
from apps.people.models import Enrollment
from apps.quizzes.models import QuizAttempt
from apps.quizzes.serializers import quiz_state
from apps.quizzes.views import quizzes_with_totals
from apps.tenancy.context import school_today
from apps.timetable.models import TimetableEntry

HOMEWORK_DAYS = 7
RECENT = 5


def profile(student, enrollment):
    section = enrollment.section if enrollment else None
    return {
        "id": str(student.pk), "name": student.user.name, "admission_no": student.admission_no,
        "section": str(section.pk) if section else None, "section_name": str(section) if section else None,
        "roll_no": enrollment.roll_no if enrollment else None,
        "class_teacher": section.class_teacher.user.name if section and section.class_teacher else None,
    }


def todays_timetable(enrollment, today):
    if enrollment is None:
        return []
    entries = TimetableEntry.objects.filter(section=enrollment.section, day_of_week=today.isoweekday()).select_related(
        "period", "subject", "teacher__user").order_by("period__order", "period__start_time")
    return [{
        "id": str(e.pk), "period_name": e.period.name, "start_time": e.period.start_time,
        "end_time": e.period.end_time, "subject_name": e.subject.name,
        "teacher_name": e.teacher.user.name if e.teacher else None, "room": e.room,
    } for e in entries]


def homework(student, enrollment, today):
    """Homework not marked done that is overdue or due in the next week."""
    if enrollment is None:
        return {"items": [], "pending": 0, "overdue": 0}
    done = set(HomeworkStatus.objects.filter(student=student).values_list("homework_id", flat=True))
    qs = Homework.objects.filter(section=enrollment.section).exclude(pk__in=done).select_related("subject")
    pending = qs.filter(due_date__gte=today)
    overdue = qs.filter(due_date__lt=today, due_date__gte=enrollment.academic_year.start_date)
    soon = list(overdue.order_by("due_date")[:RECENT]) + list(
        pending.filter(due_date__lte=today + timedelta(days=HOMEWORK_DAYS)).order_by("due_date")[:10])
    return {
        "items": [{"id": str(h.pk), "title": h.title, "subject_name": h.subject.name, "due_date": h.due_date,
                   "overdue": h.due_date < today} for h in soon],
        "pending": pending.count(), "overdue": overdue.count(),
    }


def quizzes(student, enrollment):
    """Open quizzes not yet taken, the next ones to open, and recent scores."""
    attempts = {a.quiz_id: a for a in QuizAttempt.objects.filter(student=student)}
    now = timezone.now()
    out = {"pending": [], "upcoming": [], "recent_scores": []}
    if enrollment is not None:
        section_quizzes = quizzes_with_totals().filter(section=enrollment.section)
        for q in section_quizzes.filter(opens_at__lte=now, closes_at__gt=now).order_by("closes_at"):
            if q.pk not in attempts:
                out["pending"].append(quiz_row(q))
        out["upcoming"] = [quiz_row(q) for q in section_quizzes.filter(opens_at__gt=now).order_by("opens_at")[:RECENT]]
    taken = quizzes_with_totals().filter(pk__in=attempts).order_by("-opens_at")[:RECENT]
    for q in taken:
        a = attempts[q.pk]
        out["recent_scores"].append({**quiz_row(q), "score": a.score, "max_score": a.max_score,
                                     "percentage": pct(a.score, a.max_score), "submitted_at": a.submitted_at})
    return out


def quiz_row(q):
    return {"id": str(q.pk), "title": q.title, "subject_name": q.subject.name,
            "topic_name": q.topic.name if q.topic else None, "opens_at": q.opens_at, "closes_at": q.closes_at,
            "state": quiz_state(q), "question_count": q.question_count, "max_score": q.max_score}


def tests(student):
    """The latest published test results, and published report cards."""
    marks = list(Mark.objects.filter(enrollment__student=student, exam__status=Exam.Status.PUBLISHED).select_related(
        "exam__subject", "exam__exam_term").order_by("-exam__published_at", "-exam__date")[:RECENT])
    stats = exam_stats([m.exam_id for m in marks])
    latest = []
    for m in marks:
        exam = m.exam
        obtained = None if m.is_absent else m.marks_obtained
        p = pct(obtained, exam.max_marks)
        latest.append({
            "exam": str(exam.pk), "subject_name": exam.subject.name, "exam_term": str(exam.exam_term_id),
            "exam_term_name": exam.exam_term.name, "date": exam.date, "max_marks": exam.max_marks,
            "marks_obtained": obtained, "is_absent": m.is_absent, "percentage": p,
            "grade": grade_for(p, exam.exam_term.bands), "class_average": stats.get(exam.pk, {}).get("average"),
        })
    cards = ReportCard.objects.filter(student=student, published_at__isnull=False).select_related(
        "exam_term").order_by("-published_at")
    return {
        "latest": latest,
        "report_cards": [{"exam_term": str(c.exam_term_id), "exam_term_name": c.exam_term.name,
                          "published_at": c.published_at} for c in cards],
    }


def attendance(student, today):
    records = AttendanceRecord.objects.filter(enrollment__student=student)
    today_record = records.filter(date=today).first()
    month = records.filter(date__gte=today.replace(day=1), date__lte=today).values_list("status", flat=True)
    year = AcademicYear.objects.filter(is_current=True).first()
    year_statuses = records.filter(enrollment__academic_year=year).values_list("status", flat=True) if year else []
    return {
        "today": today_record.status if today_record else None,
        "month": today.strftime("%Y-%m"),
        "month_summary": summarize(month),
        "year_summary": summarize(year_statuses),
    }


def fees(student):
    year = AcademicYear.objects.filter(is_current=True).first()
    if year is None:
        return None
    dues = list(dues_with_balance(StudentFeeDue.objects.filter(student=student, academic_year=year)))
    return {"academic_year_name": year.name, **totals(dues)}


def current_enrollment(student):
    return (Enrollment.objects.filter(student=student, status=Enrollment.Status.ACTIVE)
            .filter(Q(academic_year__is_current=True))
            .select_related("section__school_class", "section__class_teacher__user", "academic_year").first())


def student_dashboard(student):
    today = school_today()
    enrollment = current_enrollment(student)
    return {
        "today": today, "day_name": today.strftime("%A"),
        "student": profile(student, enrollment),
        "timetable": todays_timetable(enrollment, today),
        "homework": homework(student, enrollment, today),
        "quizzes": quizzes(student, enrollment),
        "tests": tests(student),
        "attendance": attendance(student, today),
    }


def child_summary(student, currency):
    today = school_today()
    enrollment = current_enrollment(student)
    return {
        "student": profile(student, enrollment),
        "attendance": attendance(student, today),
        "homework": homework(student, enrollment, today),
        "tests": tests(student),
        "quizzes": quizzes(student, enrollment),
        "fees": fees(student),
        "currency": currency,
    }
