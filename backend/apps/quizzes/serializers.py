from django.utils import timezone
from rest_framework import serializers

from apps.academics.models import Section, Subject

from .models import Question, Quiz, Topic

MAX_OPTIONS = 6
MAX_QUESTIONS = 50
TRUE_FALSE = ["True", "False"]


def quiz_state(quiz, now=None):
    now = now or timezone.now()
    if now < quiz.opens_at:
        return "upcoming"
    if now >= quiz.closes_at:
        return "closed"
    return "open"


class TopicSerializer(serializers.ModelSerializer):
    subject_name = serializers.CharField(source="subject.name", read_only=True)

    class Meta:
        model = Topic
        fields = ["id", "subject", "subject_name", "school_class", "name"]


class QuestionSerializer(serializers.ModelSerializer):
    """A question in the teacher's bank, with its answer."""

    subject_name = serializers.CharField(source="subject.name", read_only=True)
    topic_name = serializers.CharField(source="topic.name", read_only=True, default=None)

    class Meta:
        model = Question
        fields = ["id", "subject", "subject_name", "topic", "topic_name", "type", "text", "options",
                  "correct_option", "created_at"]
        read_only_fields = fields


class QuestionInputSerializer(serializers.Serializer):
    """One question of a quiz: either a bank question by id, or a new one."""

    question = serializers.PrimaryKeyRelatedField(queryset=Question.objects.all(), required=False)
    type = serializers.ChoiceField(choices=Question.Type.choices, default=Question.Type.MULTIPLE_CHOICE)
    text = serializers.CharField(required=False, max_length=2000)
    options = serializers.ListField(child=serializers.CharField(max_length=300), required=False)
    correct_option = serializers.IntegerField(required=False, min_value=0)
    marks = serializers.IntegerField(default=1, min_value=1, max_value=100)

    def validate(self, attrs):
        if attrs.get("question") is not None:
            return attrs
        if not attrs.get("text", "").strip():
            raise serializers.ValidationError({"text": "Write the question, or pick one from your bank."})
        if attrs["type"] == Question.Type.TRUE_FALSE:
            attrs["options"] = list(TRUE_FALSE)
        options = [o.strip() for o in attrs.get("options") or []]
        if len(options) < 2 or any(not o for o in options):
            raise serializers.ValidationError({"options": "Give at least two choices, none of them empty."})
        if len(options) > MAX_OPTIONS:
            raise serializers.ValidationError({"options": f"Give at most {MAX_OPTIONS} choices."})
        if len(set(options)) != len(options):
            raise serializers.ValidationError({"options": "Two choices are the same."})
        correct = attrs.get("correct_option")
        if correct is None or correct >= len(options):
            raise serializers.ValidationError({"correct_option": "Mark which choice is right."})
        attrs["options"] = options
        return attrs


class QuizSerializer(serializers.ModelSerializer):
    section = serializers.PrimaryKeyRelatedField(queryset=Section.objects.all())
    subject = serializers.PrimaryKeyRelatedField(queryset=Subject.objects.all())
    section_name = serializers.SerializerMethodField()
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    topic_name = serializers.CharField(source="topic.name", read_only=True, default=None)
    teacher_name = serializers.CharField(source="teacher.user.name", read_only=True, default=None)
    state = serializers.SerializerMethodField()
    question_count = serializers.IntegerField(read_only=True, required=False)
    max_score = serializers.IntegerField(read_only=True, required=False)
    # Staff only: how many of the section have submitted.
    attempt_count = serializers.IntegerField(read_only=True, required=False)
    student_count = serializers.IntegerField(read_only=True, required=False)
    # For a student (or a parent looking at one child): their submission.
    my_attempt = serializers.SerializerMethodField()

    # Writing: a topic by name (created if new) and the questions.
    topic = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=200)
    questions = QuestionInputSerializer(many=True, write_only=True, required=False)

    class Meta:
        model = Quiz
        fields = [
            "id", "section", "section_name", "subject", "subject_name", "topic", "topic_name", "teacher_name",
            "title", "taught_on", "opens_at", "closes_at", "state", "question_count", "max_score",
            "attempt_count", "student_count", "my_attempt", "questions", "created_at",
        ]
        read_only_fields = ["created_at"]
        extra_kwargs = {"taught_on": {"required": False}, "opens_at": {"required": False}}

    def get_section_name(self, obj):
        return str(obj.section)

    def get_state(self, obj):
        return quiz_state(obj)

    def get_my_attempt(self, obj):
        attempts = self.context.get("attempts")
        if attempts is None:
            return None
        a = attempts.get(obj.pk)
        return None if a is None else {"score": a.score, "max_score": a.max_score, "submitted_at": a.submitted_at}

    def validate(self, attrs):
        instance = self.instance
        if instance is not None and "section" in attrs and attrs["section"] != instance.section:
            raise serializers.ValidationError({"section": "Create a new quiz to give it to another section."})
        if instance is not None and "subject" in attrs and attrs["subject"] != instance.subject:
            raise serializers.ValidationError({"subject": "Create a new quiz for another subject."})
        if instance is None:
            attrs.setdefault("opens_at", timezone.now())
            if not attrs.get("questions"):
                raise serializers.ValidationError({"questions": "Add at least one question."})
        opens = attrs.get("opens_at", getattr(instance, "opens_at", None))
        closes = attrs.get("closes_at", getattr(instance, "closes_at", None))
        if closes is None:
            raise serializers.ValidationError({"closes_at": "Set when the quiz closes."})
        if opens and closes <= opens:
            raise serializers.ValidationError({"closes_at": "The quiz must close after it opens."})
        questions = attrs.get("questions")
        if questions is not None:
            if not questions:
                raise serializers.ValidationError({"questions": "Add at least one question."})
            if len(questions) > MAX_QUESTIONS:
                raise serializers.ValidationError({"questions": f"A quiz has at most {MAX_QUESTIONS} questions."})
            subject = attrs.get("subject", getattr(instance, "subject", None))
            picked = [q["question"].pk for q in questions if q.get("question") is not None]
            if len(set(picked)) != len(picked):
                raise serializers.ValidationError({"questions": "The same bank question is added twice."})
            for q in questions:
                bank = q.get("question")
                if bank is not None and bank.subject_id != subject.pk:
                    raise serializers.ValidationError({"questions": "A bank question is from another subject."})
        return attrs


class SubmitSerializer(serializers.Serializer):
    """{"answers": {"<question id>": <chosen option index>}}. Unanswered
    questions may be left out; they score nothing."""

    answers = serializers.DictField(child=serializers.IntegerField(min_value=0, allow_null=True))
    started_at = serializers.DateTimeField(required=False)
