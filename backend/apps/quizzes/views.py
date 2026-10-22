from collections import Counter

from django.db import IntegrityError, transaction
from django.db.models import Count, IntegerField, OuterRef, Q, Subquery, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.accounts import audit
from apps.accounts.models import Role
from apps.accounts.permissions import SchoolPermission
from apps.people.models import Enrollment
from apps.people.scoping import (
    active_enrollments,
    can_manage_section,
    can_teach,
    has_role,
    own_section_ids,
    own_student_ids,
    student_for,
    teacher_for,
    teacher_section_ids,
)
from apps.tenancy.context import school_today

from .models import Question, Quiz, QuizAnswer, QuizAttempt, QuizQuestion, Topic
from .serializers import QuestionSerializer, QuizSerializer, SubmitSerializer, TopicSerializer, quiz_state


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


def is_staff(request):
    return has_role(request, Role.ADMIN, Role.TEACHER)


class QuizViewSet(viewsets.ModelViewSet):
    """After-class quizzes. Teachers create them for sections and subjects
    they teach; students take them while open; parents see their children's
    scores; admins read everything.

    Filters: section, subject, student (a parent's child, or a student staff
    look at), state (upcoming, open, closed, or pending: open and not yet
    taken by the student), mine=true (a teacher's own quizzes).
    """

    serializer_class = QuizSerializer
    permission_classes = [SchoolPermission]
    write_roles = {Role.TEACHER, Role.STUDENT}

    def get_queryset(self):
        request = self.request
        qs = visible_quizzes(request)
        params = request.query_params
        if is_staff(request):
            qs = qs.annotate(
                attempt_count=Coalesce(_count(QuizAttempt, quiz=OuterRef("pk")), 0),
                student_count=Coalesce(Subquery(
                    Enrollment.objects.filter(section=OuterRef("section"), status=Enrollment.Status.ACTIVE)
                    .values("section").annotate(n=Count("pk")).values("n"), output_field=IntegerField()), 0),
            )
        if params.get("section"):
            qs = qs.filter(section_id=params["section"])
        if params.get("subject"):
            qs = qs.filter(subject_id=params["subject"])
        if params.get("mine") == "true" and has_role(request, Role.TEACHER):
            qs = qs.filter(teacher=teacher_for(request))
        student = self.focus_student()
        if student is not None:
            qs = qs.filter(section__enrollments__student_id=student,
                           section__enrollments__status=Enrollment.Status.ACTIVE)
        now = timezone.now()
        state = params.get("state")
        if state == "upcoming":
            qs = qs.filter(opens_at__gt=now)
        elif state in ("open", "pending"):
            qs = qs.filter(opens_at__lte=now, closes_at__gt=now)
            if state == "pending" and student is not None:
                qs = qs.exclude(attempts__student_id=student)
        elif state == "closed":
            qs = qs.filter(closes_at__lte=now)
        return qs.order_by("-opens_at", "-created_at")

    def focus_student(self):
        """The student whose attempts are shown: the student themself, or the
        ?student= child of a parent (or a student staff look at)."""
        wanted = self.request.query_params.get("student")
        if wanted:
            if not is_staff(self.request) and wanted not in {str(i) for i in own_student_ids(self.request)}:
                raise PermissionDenied("You can only see your own or your children's quizzes.")
            return wanted
        if has_role(self.request, Role.STUDENT):
            student = student_for(self.request)
            return str(student.pk) if student else None
        return None

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        student = self.focus_student() if self.request.method == "GET" else None
        if student:
            ctx["attempts"] = {a.quiz_id: a for a in QuizAttempt.objects.filter(student_id=student)}
        return ctx

    # Writing (teachers) ------------------------------------------------

    def check_can_set(self, section, subject):
        if not has_role(self.request, Role.TEACHER) or not can_teach(self.request, section.pk, subject.pk):
            raise PermissionDenied("You can only set quizzes for a section and subject you teach.")

    def check_owner(self, quiz):
        teacher = teacher_for(self.request)
        if quiz.created_by_id != self.request.user.pk and (teacher is None or quiz.teacher_id != teacher.pk):
            raise PermissionDenied("Only the teacher who set this quiz can change it.")

    def topic_for(self, name, subject, section):
        name = (name or "").strip()
        if not name:
            return None
        topic, _ = Topic.objects.get_or_create(subject=subject, school_class=section.school_class, name=name)
        return topic

    def save_questions(self, quiz, items):
        teacher = teacher_for(self.request)
        for order, item in enumerate(items, start=1):
            question = item.get("question")
            if question is None:
                question = Question.objects.create(
                    subject=quiz.subject, topic=quiz.topic, type=item["type"], text=item["text"].strip(),
                    options=item["options"], correct_option=item["correct_option"], teacher=teacher,
                    created_by=self.request.user)
            elif not (question.created_by_id == self.request.user.pk
                      or (teacher is not None and question.teacher_id == teacher.pk)):
                raise PermissionDenied("You can only reuse questions from your own bank.")
            QuizQuestion.objects.create(quiz=quiz, question=question, order=order, marks=item["marks"])

    def create(self, request, *args, **kwargs):
        if not has_role(request, Role.TEACHER):
            raise PermissionDenied("Only teachers set quizzes.")
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        self.check_can_set(data["section"], data["subject"])
        questions = data.pop("questions")
        topic = self.topic_for(data.pop("topic", ""), data["subject"], data["section"])
        data.setdefault("taught_on", school_today())
        with transaction.atomic():
            quiz = Quiz.objects.create(**data, topic=topic, teacher=teacher_for(request), created_by=request.user)
            self.save_questions(quiz, questions)
        audit.record(request.user, "quiz.create", "quiz", quiz.pk, after={"title": quiz.title})
        return Response(self.get_serializer(self.get_queryset().get(pk=quiz.pk)).data, status=201)

    def update(self, request, *args, **kwargs):
        if not has_role(request, Role.TEACHER):
            raise PermissionDenied("Only teachers change quizzes.")
        quiz = self.get_object()
        self.check_owner(quiz)
        serializer = self.get_serializer(quiz, data=request.data, partial=kwargs.get("partial", False))
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        questions = data.pop("questions", None)
        topic_name = data.pop("topic", None)
        attempted = quiz.attempts.exists()
        if questions is not None and attempted:
            raise ValidationError({"questions": "Students have already taken this quiz, so its questions are fixed."})
        if attempted and "opens_at" in data and data["opens_at"] != quiz.opens_at:
            raise ValidationError({"opens_at": "Students have already taken this quiz."})
        self.check_can_set(quiz.section, quiz.subject)
        with transaction.atomic():
            for k, v in data.items():
                setattr(quiz, k, v)
            if topic_name is not None:
                quiz.topic = self.topic_for(topic_name, quiz.subject, quiz.section)
            quiz.save()
            if questions is not None:
                quiz.quiz_questions.all().delete()
                self.save_questions(quiz, questions)
        return Response(self.get_serializer(self.get_queryset().get(pk=quiz.pk)).data)

    def destroy(self, request, *args, **kwargs):
        if not has_role(request, Role.TEACHER):
            raise PermissionDenied("Only teachers remove quizzes.")
        quiz = self.get_object()
        self.check_owner(quiz)
        if quiz.attempts.exists():
            raise ValidationError({"detail": "Students have taken this quiz, so it is kept. Close it instead."})
        audit.record(request.user, "quiz.delete", "quiz", quiz.pk, before={"title": quiz.title})
        quiz.delete()
        return Response(status=204)

    @action(detail=True, methods=["post"])
    def close(self, request, pk=None):
        """Close an open quiz now, so answers are shown to students."""
        quiz = self.get_object()
        if not has_role(request, Role.TEACHER):
            raise PermissionDenied("Only teachers close quizzes.")
        self.check_owner(quiz)
        state = quiz_state(quiz)
        if state == "upcoming":
            raise ValidationError({"detail": "This quiz has not opened yet. Change its times or remove it."})
        if state == "open":
            quiz.closes_at = timezone.now()
            quiz.save(update_fields=["closes_at", "updated_at"])
        return Response(self.get_serializer(self.get_queryset().get(pk=quiz.pk)).data)

    # Taking (students) and reviewing -----------------------------------

    @action(detail=True, methods=["get"])
    def paper(self, request, pk=None):
        """The questions. Staff see the answers. A student sees the questions
        once the quiz opens, and their own answers with the right ones after it
        closes. A parent (?student=child) sees the same once it closes."""
        quiz = self.get_object()
        state = quiz_state(quiz)
        # Admins and the section's teachers; a teacher who is also a parent of
        # a child in another teacher's section is not staff for this quiz.
        section_staff = can_manage_section(request, quiz.section_id)
        staff = section_staff and not request.query_params.get("student")
        student_id = None if staff else self.focus_student()
        if not staff:
            if student_id is None:
                raise PermissionDenied("Only staff, students and parents can see quiz questions.")
            if state == "upcoming":
                raise PermissionDenied(f"This quiz opens at {timezone.localtime(quiz.opens_at):%d %b %Y %H:%M}.")
            taking = has_role(request, Role.STUDENT) and str(getattr(student_for(request), "pk", "")) == student_id
            if state == "open" and not taking and not section_staff:
                raise PermissionDenied("You can see the questions once the quiz closes.")
        attempt = (QuizAttempt.objects.filter(quiz=quiz, student_id=student_id).prefetch_related("answers").first()
                   if student_id else None)
        answers = {a.question_id: a for a in attempt.answers.all()} if attempt else {}
        reveal = section_staff or state == "closed"
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
        return Response({
            "quiz": self.get_serializer(quiz).data,
            "state": state,
            "answers_shown": reveal,
            "attempt": None if attempt is None else {
                "score": attempt.score, "max_score": attempt.max_score, "submitted_at": attempt.submitted_at},
            "questions": questions,
        })

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        """A student hands in their answers, once, while the quiz is open."""
        quiz = self.get_object()
        student = student_for(request) if has_role(request, Role.STUDENT) else None
        if student is None:
            raise PermissionDenied("Only students take quizzes.")
        if not Enrollment.objects.filter(student=student, section=quiz.section,
                                         status=Enrollment.Status.ACTIVE).exists():
            raise PermissionDenied("This quiz is for another section.")
        state = quiz_state(quiz)
        if state != "open":
            raise ValidationError({"detail": "This quiz has not opened yet." if state == "upcoming"
                                   else "This quiz has closed."})
        body = SubmitSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        given = {str(k): v for k, v in body.validated_data["answers"].items()}
        items = list(quiz.quiz_questions.select_related("question"))
        known = {str(qq.question_id) for qq in items}
        unknown = set(given) - known
        if unknown:
            raise ValidationError({"answers": "Some answers are for questions not in this quiz."})
        now = timezone.now()
        started = body.validated_data.get("started_at") or now
        started = min(max(started, quiz.opens_at), now)
        score, max_score, rows = 0, 0, []
        for qq in items:
            choice = given.get(str(qq.question_id))
            if choice is not None and choice >= len(qq.question.options):
                raise ValidationError({"answers": "An answer is not one of the choices."})
            correct = choice is not None and choice == qq.question.correct_option
            score += qq.marks if correct else 0
            max_score += qq.marks
            rows.append((qq.question, choice, correct))
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
        return Response({"score": score, "max_score": max_score, "submitted_at": now,
                         "answers_shown_at": quiz.closes_at}, status=201)

    @action(detail=True, methods=["get"])
    def results(self, request, pk=None):
        """Scores per student, and which questions most students got wrong (staff only)."""
        quiz = self.get_object()
        if not can_manage_section(request, quiz.section_id):
            raise PermissionDenied("Only the section's teachers and admins can see the whole class's scores.")
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
        return Response({
            "quiz": self.get_serializer(self.get_queryset().get(pk=quiz.pk)).data,
            "attempted": taken, "students": len(students),
            "average_score": round(sum(scores) / taken, 2) if taken else None,
            "max_score": sum(q["marks"] for q in questions),
            "scores": students,
            "questions": questions,
            # Most missed first, for the teacher to go over in the next class.
            "most_missed": [q["id"] for q in sorted(
                (q for q in questions if q["wrong"] > 0), key=lambda q: (-q["wrong"], q["order"]))],
        })


class TopicViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """Topics taught, for tagging quizzes. Staff read; filters: subject, school_class."""

    serializer_class = TopicSerializer
    permission_classes = [SchoolPermission]
    read_roles = {Role.ADMIN, Role.TEACHER}
    pagination_class = None

    def get_queryset(self):
        qs = Topic.objects.select_related("subject")
        params = self.request.query_params
        if params.get("subject"):
            qs = qs.filter(subject_id=params["subject"])
        if params.get("school_class"):
            qs = qs.filter(Q(school_class_id=params["school_class"]) | Q(school_class__isnull=True))
        return qs


class QuestionBankViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """A teacher's own question bank, to reuse in new quizzes.
    Filters: subject, topic, search."""

    serializer_class = QuestionSerializer
    permission_classes = [SchoolPermission]
    read_roles = {Role.TEACHER}

    def get_queryset(self):
        teacher = teacher_for(self.request)
        mine = Q(created_by=self.request.user)
        if teacher is not None:
            mine |= Q(teacher=teacher)
        qs = Question.objects.filter(mine).select_related("subject", "topic").order_by("-created_at")
        params = self.request.query_params
        if params.get("subject"):
            qs = qs.filter(subject_id=params["subject"])
        if params.get("topic"):
            qs = qs.filter(topic_id=params["topic"])
        if params.get("search"):
            qs = qs.filter(Q(text__icontains=params["search"]) | Q(topic__name__icontains=params["search"]))
        return qs
