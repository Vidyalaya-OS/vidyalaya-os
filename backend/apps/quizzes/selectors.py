"""Read-only queries for quizzes: who may see which quiz, a quiz paper as a
student or parent sees it, and the class results a teacher sees. Nothing here
writes to the database (see services.py for that)."""

from collections import Counter

from django.db.models import Count, IntegerField, OuterRef, Subquery, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.accounts.models import Role
from apps.people.models import Enrollment
from apps.people.scoping import active_enrollments, has_role, own_section_ids, teacher_for, teacher_section_ids

from .models import QuizAnswer, QuizAttempt, QuizQuestion, Quiz


def _sum_marks():
    return Subquery(QuizQuestion.objects.filter(quiz=OuterRef("pk")).values("quiz").annotate(
        s=Sum("marks")).values("s"), output_field=IntegerField())


def _count(model, **filters):
    return Subquery(model.objects.filter(**filters).values(next(iter(filters))).annotate(
        n=Count("pk")).values("n"), output_field=IntegerField())


def quizzes_with_totals():
    """Quizzes annotated with question_count and max_score."""
    return Quiz.objects.select_related("section__school_class", "subject", "topic", "teacher__user").annotate(
        question_count=Coalesce(_count(QuizQuestion, quiz=OuterRef("pk")), 0),
        max_score=Coalesce(_sum_marks(), 0),
    )


def visible_quizzes(request):
    """Quizzes of the sections this member may see: all for admins, sections
    taught for teachers, own (children's) sections for students and parents."""
    qs = quizzes_with_totals()
    if has_role(request, Role.ADMIN):
        return qs
    sections = own_section_ids(request)
    if has_role(request, Role.TEACHER):
        sections |= teacher_section_ids(teacher_for(request))
    return qs.filter(section_id__in=sections)


def with_class_counts(qs):
    """Adds attempt_count and student_count, for staff lists."""
    return qs.annotate(
        attempt_count=Coalesce(_count(QuizAttempt, quiz=OuterRef("pk")), 0),
        student_count=Coalesce(Subquery(
            Enrollment.objects.filter(section=OuterRef("section"), status=Enrollment.Status.ACTIVE)
            .values("section").annotate(n=Count("pk")).values("n"), output_field=IntegerField()), 0),
    )


def filter_quizzes(qs, *, section=None, subject=None, teacher=None, student=None, state=None):
    """Narrow a quiz list by the list screen's filters. `state` is upcoming,
    open, closed, or pending (open and not yet taken by `student`)."""
    if section:
        qs = qs.filter(section_id=section)
    if subject:
        qs = qs.filter(subject_id=subject)
    if teacher is not None:
        qs = qs.filter(teacher=teacher)
    if student is not None:
        qs = qs.filter(section__enrollments__student_id=student,
                       section__enrollments__status=Enrollment.Status.ACTIVE)
    now = timezone.now()
    if state == "upcoming":
        qs = qs.filter(opens_at__gt=now)
    elif state in ("open", "pending"):
        qs = qs.filter(opens_at__lte=now, closes_at__gt=now)
        if state == "pending" and student is not None:
            qs = qs.exclude(attempts__student_id=student)
    elif state == "closed":
        qs = qs.filter(closes_at__lte=now)
    return qs.order_by("-opens_at", "-created_at")


def attempts_by_quiz(student_id):
    return {a.quiz_id: a for a in QuizAttempt.objects.filter(student_id=student_id)}


def paper(quiz, *, student_id=None, reveal=False):
    """The questions of a quiz, with the student's own answers when given and
    the right answers when `reveal` is true."""
    attempt = (QuizAttempt.objects.filter(quiz=quiz, student_id=student_id).prefetch_related("answers").first()
               if student_id else None)
    answers = {a.question_id: a for a in attempt.answers.all()} if attempt else {}
    questions = []
    for qq in quiz.quiz_questions.select_related("question"):
        q = qq.question
        row = {"id": str(q.pk), "type": q.type, "text": q.text, "options": q.options, "marks": qq.marks}
        if reveal:
            row["correct_option"] = q.correct_option
        if attempt:
            a = answers.get(q.pk)
            row["your_answer"] = a.answer if a else None
            if reveal:
                row["is_correct"] = bool(a and a.is_correct)
        questions.append(row)
    return {
        "answers_shown": reveal,
        "attempt": None if attempt is None else {
            "score": attempt.score, "max_score": attempt.max_score, "submitted_at": attempt.submitted_at},
        "questions": questions,
    }


def results(quiz):
    """Scores per student, and how each question went, most missed first."""
    attempts = {a.student_id: a for a in QuizAttempt.objects.filter(quiz=quiz)}
    students = [{
        "student": str(e.student_id), "name": e.student.user.name, "roll_no": e.roll_no,
        "attempted": e.student_id in attempts,
        "score": attempts[e.student_id].score if e.student_id in attempts else None,
        "max_score": attempts[e.student_id].max_score if e.student_id in attempts else None,
        "submitted_at": attempts[e.student_id].submitted_at if e.student_id in attempts else None,
    } for e in active_enrollments(quiz.section_id)]
    answers = QuizAnswer.objects.filter(attempt__quiz=quiz)
    correct = Counter(answers.filter(is_correct=True).values_list("question_id", flat=True))
    picks = Counter(answers.exclude(answer__isnull=True).values_list("question_id", "answer"))
    taken = len(attempts)
    questions = []
    for qq in quiz.quiz_questions.select_related("question"):
        q = qq.question
        right = correct.get(q.pk, 0)
        questions.append({
            "id": str(q.pk), "order": qq.order, "text": q.text, "options": q.options,
            "correct_option": q.correct_option, "marks": qq.marks, "correct": right, "wrong": taken - right,
            "percent_correct": round(right * 100 / taken, 1) if taken else None,
            "choices": [picks.get((q.pk, i), 0) for i in range(len(q.options))],
        })
    scores = [a.score for a in attempts.values()]
    return {
        "attempted": taken, "students": len(students),
        "average_score": round(sum(scores) / taken, 2) if taken else None,
        "max_score": sum(q["marks"] for q in questions),
        "scores": students,
        "questions": questions,
        # Most missed first, for the teacher to go over in the next class.
        "most_missed": [q["id"] for q in sorted(
            (q for q in questions if q["wrong"] > 0), key=lambda q: (-q["wrong"], q["order"]))],
    }
