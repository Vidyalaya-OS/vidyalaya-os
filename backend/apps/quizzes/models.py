from django.conf import settings
from django.db import models
from django.db.models import Q

from apps.tenancy.models import TenantModel


class Topic(TenantModel):
    """A topic taught in a subject, used to tag quizzes and bank questions."""

    subject = models.ForeignKey("academics.Subject", on_delete=models.PROTECT, related_name="topics")
    school_class = models.ForeignKey("academics.SchoolClass", on_delete=models.PROTECT, null=True, blank=True,
                                     related_name="topics")
    name = models.CharField(max_length=200)

    class Meta:
        db_table = "topics"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["school", "subject", "school_class", "name"], name="unique_topic"),
        ]

    def __str__(self):
        return self.name


class Question(TenantModel):
    """A question in a teacher's bank. Multiple choice and true/false both keep
    their choices in `options`; the answer is the index of the right one."""

    class Type(models.TextChoices):
        MULTIPLE_CHOICE = "mcq", "Multiple choice"
        TRUE_FALSE = "true_false", "True or false"

    subject = models.ForeignKey("academics.Subject", on_delete=models.PROTECT, related_name="questions")
    topic = models.ForeignKey(Topic, on_delete=models.SET_NULL, null=True, blank=True, related_name="questions")
    type = models.CharField(max_length=20, choices=Type.choices, default=Type.MULTIPLE_CHOICE)
    text = models.TextField()
    options = models.JSONField(help_text='The choices, in order, like ["4", "5", "6"].')
    correct_option = models.PositiveSmallIntegerField(help_text="Index of the right choice, from 0.")
    teacher = models.ForeignKey("people.Teacher", on_delete=models.SET_NULL, null=True, blank=True,
                                related_name="questions")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")

    class Meta:
        db_table = "questions"
        ordering = ["created_at"]
        indexes = [models.Index(fields=["school", "subject", "topic"])]

    def __str__(self):
        return self.text[:60]


class Quiz(TenantModel):
    """A short after-class quiz for one section, open between two times."""

    section = models.ForeignKey("academics.Section", on_delete=models.CASCADE, related_name="quizzes")
    subject = models.ForeignKey("academics.Subject", on_delete=models.PROTECT, related_name="quizzes")
    topic = models.ForeignKey(Topic, on_delete=models.SET_NULL, null=True, blank=True, related_name="quizzes")
    teacher = models.ForeignKey("people.Teacher", on_delete=models.SET_NULL, null=True, blank=True,
                                related_name="quizzes")
    title = models.CharField(max_length=200)
    taught_on = models.DateField(help_text="The day the topic was taught.")
    opens_at = models.DateTimeField()
    closes_at = models.DateTimeField()
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")

    class Meta:
        db_table = "quizzes"
        ordering = ["-opens_at"]
        verbose_name_plural = "quizzes"
        indexes = [models.Index(fields=["school", "section", "closes_at"])]
        constraints = [
            models.CheckConstraint(condition=Q(closes_at__gt=models.F("opens_at")), name="quiz_closes_after_open"),
        ]

    def __str__(self):
        return self.title


class QuizQuestion(TenantModel):
    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name="quiz_questions")
    question = models.ForeignKey(Question, on_delete=models.PROTECT, related_name="quiz_questions")
    order = models.PositiveSmallIntegerField(default=0)
    marks = models.PositiveSmallIntegerField(default=1)

    class Meta:
        db_table = "quiz_questions"
        ordering = ["order"]
        constraints = [models.UniqueConstraint(fields=["quiz", "question"], name="unique_quiz_question")]


class QuizAttempt(TenantModel):
    """One student's submitted answers to a quiz. One per student per quiz."""

    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name="attempts")
    student = models.ForeignKey("people.Student", on_delete=models.PROTECT, related_name="quiz_attempts")
    started_at = models.DateTimeField()
    submitted_at = models.DateTimeField()
    score = models.PositiveSmallIntegerField()
    max_score = models.PositiveSmallIntegerField()

    class Meta:
        db_table = "quiz_attempts"
        ordering = ["submitted_at"]
        constraints = [models.UniqueConstraint(fields=["quiz", "student"], name="one_attempt_per_quiz")]


class QuizAnswer(TenantModel):
    attempt = models.ForeignKey(QuizAttempt, on_delete=models.CASCADE, related_name="answers")
    question = models.ForeignKey(Question, on_delete=models.PROTECT, related_name="+")
    answer = models.PositiveSmallIntegerField(null=True, blank=True, help_text="The chosen option, or empty.")
    is_correct = models.BooleanField(default=False)

    class Meta:
        db_table = "quiz_answers"
        constraints = [models.UniqueConstraint(fields=["attempt", "question"], name="unique_quiz_answer")]
