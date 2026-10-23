from django.db.models import Q
from django.utils import timezone
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from apps.accounts.models import Role
from apps.accounts.permissions import SchoolPermission
from apps.people.models import Enrollment
from apps.people.scoping import (
    can_manage_section,
    can_teach,
    has_role,
    own_student_ids,
    student_for,
    teacher_for,
)

from . import selectors, services
from .models import Question, Topic
from .serializers import QuestionSerializer, QuizSerializer, SubmitSerializer, TopicSerializer, quiz_state

# The views below only decide who may do what and shape responses. Queries
# live in selectors.py and the rules for changing quizzes in services.py.


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
        qs = selectors.visible_quizzes(request)
        if is_staff(request):
            qs = selectors.with_class_counts(qs)
        params = request.query_params
        mine = params.get("mine") == "true" and has_role(request, Role.TEACHER)
        return selectors.filter_quizzes(
            qs,
            section=params.get("section"),
            subject=params.get("subject"),
            teacher=teacher_for(request) if mine else None,
            student=self.focus_student(),
            state=params.get("state"),
        )

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
            ctx["attempts"] = selectors.attempts_by_quiz(student)
        return ctx

    def fresh(self, quiz):
        """The quiz as the list shows it, with its totals."""
        return self.get_serializer(self.get_queryset().get(pk=quiz.pk)).data

    # Who may write -----------------------------------------------------

    def require_teacher(self, doing):
        if not has_role(self.request, Role.TEACHER):
            raise PermissionDenied(f"Only teachers {doing}.")

    def check_can_set(self, section, subject):
        if not has_role(self.request, Role.TEACHER) or not can_teach(self.request, section.pk, subject.pk):
            raise PermissionDenied("You can only set quizzes for a section and subject you teach.")

    def check_owner(self, quiz):
        teacher = teacher_for(self.request)
        if quiz.created_by_id != self.request.user.pk and (teacher is None or quiz.teacher_id != teacher.pk):
            raise PermissionDenied("Only the teacher who set this quiz can change it.")

    # Writing (teachers) ------------------------------------------------

    def create(self, request, *args, **kwargs):
        self.require_teacher("set quizzes")
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.check_can_set(serializer.validated_data["section"], serializer.validated_data["subject"])
        quiz = services.create_quiz(serializer.validated_data, user=request.user, teacher=teacher_for(request))
        return Response(self.fresh(quiz), status=201)

    def update(self, request, *args, **kwargs):
        self.require_teacher("change quizzes")
        quiz = self.get_object()
        self.check_owner(quiz)
        serializer = self.get_serializer(quiz, data=request.data, partial=kwargs.get("partial", False))
        serializer.is_valid(raise_exception=True)
        self.check_can_set(quiz.section, quiz.subject)
        services.update_quiz(quiz, serializer.validated_data, user=request.user, teacher=teacher_for(request))
        return Response(self.fresh(quiz))

    def destroy(self, request, *args, **kwargs):
        self.require_teacher("remove quizzes")
        quiz = self.get_object()
        self.check_owner(quiz)
        services.delete_quiz(quiz, user=request.user)
        return Response(status=204)

    @action(detail=True, methods=["post"])
    def close(self, request, pk=None):
        """Close an open quiz now, so answers are shown to students."""
        quiz = self.get_object()
        self.require_teacher("close quizzes")
        self.check_owner(quiz)
        services.close_quiz(quiz)
        return Response(self.fresh(quiz))

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
        body = selectors.paper(quiz, student_id=student_id, reveal=section_staff or state == "closed")
        return Response({"quiz": self.get_serializer(quiz).data, "state": state, **body})

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
        body = SubmitSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        attempt = services.submit_attempt(quiz, student, body.validated_data["answers"],
                                          body.validated_data.get("started_at"))
        return Response({"score": attempt.score, "max_score": attempt.max_score,
                         "submitted_at": attempt.submitted_at, "answers_shown_at": quiz.closes_at}, status=201)

    @action(detail=True, methods=["get"])
    def results(self, request, pk=None):
        """Scores per student, and which questions most students got wrong (staff only)."""
        quiz = self.get_object()
        if not can_manage_section(request, quiz.section_id):
            raise PermissionDenied("Only the section's teachers and admins can see the whole class's scores.")
        return Response({"quiz": self.fresh(quiz), **selectors.results(quiz)})


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
