"""Writing quizzes: setting, changing, closing and handing in. Views check who
is asking and pass plain values in; the rules about quizzes live here."""

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.accounts import audit
from apps.tenancy.context import school_today

from .models import Question, Quiz, QuizAnswer, QuizAttempt, QuizQuestion, Topic
from .serializers import quiz_state


def topic_for(name, subject, section):
    """The topic called `name` for this subject and class, created on first use."""
    name = (name or "").strip()
    if not name:
        return None
    topic, _ = Topic.objects.get_or_create(subject=subject, school_class=section.school_class, name=name)
    return topic


def _save_questions(quiz, items, *, user, teacher):
    for order, item in enumerate(items, start=1):
        question = item.get("question")
        if question is None:
            question = Question.objects.create(
                subject=quiz.subject, topic=quiz.topic, type=item["type"], text=item["text"].strip(),
                options=item["options"], correct_option=item["correct_option"], teacher=teacher,
                created_by=user)
        elif not (question.created_by_id == user.pk or (teacher is not None and question.teacher_id == teacher.pk)):
            raise PermissionDenied("You can only reuse questions from your own bank.")
        QuizQuestion.objects.create(quiz=quiz, question=question, order=order, marks=item["marks"])


@transaction.atomic
def create_quiz(data, *, user, teacher):
    """Create a quiz and its questions from validated serializer data."""
    data = dict(data)
    questions = data.pop("questions")
    topic = topic_for(data.pop("topic", ""), data["subject"], data["section"])
    data.setdefault("taught_on", school_today())
    quiz = Quiz.objects.create(**data, topic=topic, teacher=teacher, created_by=user)
    _save_questions(quiz, questions, user=user, teacher=teacher)
    audit.record(user, "quiz.create", "quiz", quiz.pk, after={"title": quiz.title})
    return quiz


@transaction.atomic
def update_quiz(quiz, data, *, user, teacher):
    """Change a quiz. Once a student has handed it in, its questions and
    opening time are fixed."""
    data = dict(data)
    questions = data.pop("questions", None)
    topic_name = data.pop("topic", None)
    attempted = quiz.attempts.exists()
    if questions is not None and attempted:
        raise ValidationError({"questions": "Students have already taken this quiz, so its questions are fixed."})
    if attempted and "opens_at" in data and data["opens_at"] != quiz.opens_at:
        raise ValidationError({"opens_at": "Students have already taken this quiz."})
    for k, v in data.items():
        setattr(quiz, k, v)
    if topic_name is not None:
        quiz.topic = topic_for(topic_name, quiz.subject, quiz.section)
    quiz.save()
    if questions is not None:
        quiz.quiz_questions.all().delete()
        _save_questions(quiz, questions, user=user, teacher=teacher)
    return quiz


def delete_quiz(quiz, *, user):
    if quiz.attempts.exists():
        raise ValidationError({"detail": "Students have taken this quiz, so it is kept. Close it instead."})
    audit.record(user, "quiz.delete", "quiz", quiz.pk, before={"title": quiz.title})
    quiz.delete()


def close_quiz(quiz):
    """Close an open quiz now, so the answers are shown."""
    state = quiz_state(quiz)
    if state == "upcoming":
        raise ValidationError({"detail": "This quiz has not opened yet. Change its times or remove it."})
    if state == "open":
        quiz.closes_at = timezone.now()
        quiz.save(update_fields=["closes_at", "updated_at"])
    return quiz


def grade(items, given):
    """Mark answers. `items` are the quiz's QuizQuestions, `given` maps a
    question id (as text) to the chosen option. Returns (score, max_score,
    rows) where rows are (question, choice, correct)."""
    known = {str(qq.question_id) for qq in items}
    if set(given) - known:
        raise ValidationError({"answers": "Some answers are for questions not in this quiz."})
    score, max_score, rows = 0, 0, []
    for qq in items:
        choice = given.get(str(qq.question_id))
        if choice is not None and choice >= len(qq.question.options):
            raise ValidationError({"answers": "An answer is not one of the choices."})
        correct = choice is not None and choice == qq.question.correct_option
        score += qq.marks if correct else 0
        max_score += qq.marks
        rows.append((qq.question, choice, correct))
    return score, max_score, rows


def submit_attempt(quiz, student, answers, started_at=None):
    """A student hands in their answers, once, while the quiz is open."""
    state = quiz_state(quiz)
    if state != "open":
        raise ValidationError({"detail": "This quiz has not opened yet." if state == "upcoming"
                               else "This quiz has closed."})
    given = {str(k): v for k, v in answers.items()}
    items = list(quiz.quiz_questions.select_related("question"))
    score, max_score, rows = grade(items, given)
    now = timezone.now()
    started = min(max(started_at or now, quiz.opens_at), now)
    try:
        with transaction.atomic():
            attempt = QuizAttempt.objects.create(quiz=quiz, student=student, started_at=started,
                                                 submitted_at=now, score=score, max_score=max_score)
            QuizAnswer.objects.bulk_create([
                QuizAnswer(attempt=attempt, question=q, answer=choice, is_correct=correct,
                           school_id=attempt.school_id)
                for q, choice, correct in rows])
    except IntegrityError:
        raise ValidationError({"detail": "You have already handed in this quiz."})
    return attempt
