from rest_framework import serializers

from apps.academics.models import Section, Subject

from .models import Homework, HomeworkAttachment

MAX_ATTACHMENT_MB = 10


class AttachmentSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = HomeworkAttachment
        fields = ["id", "name", "size", "url"]

    def get_url(self, obj):
        # Served through the API after a permission check, never as a public file.
        return f"/api/homework/{obj.homework_id}/attachments/{obj.pk}"


class HomeworkSerializer(serializers.ModelSerializer):
    section = serializers.PrimaryKeyRelatedField(queryset=Section.objects.all())
    subject = serializers.PrimaryKeyRelatedField(queryset=Subject.objects.all())
    section_name = serializers.SerializerMethodField()
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    teacher_name = serializers.CharField(source="teacher.user.name", read_only=True, default=None)
    attachments = AttachmentSerializer(many=True, read_only=True)
    # For a student (or a parent looking at one child): whether it is marked done.
    done = serializers.SerializerMethodField()
    done_count = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = Homework
        fields = [
            "id", "section", "section_name", "subject", "subject_name", "teacher", "teacher_name", "title",
            "instructions", "assigned_on", "due_date", "attachments", "done", "done_count", "created_at",
        ]
        read_only_fields = ["teacher", "assigned_on", "created_at"]

    def get_section_name(self, obj):
        return str(obj.section)

    def get_done(self, obj):
        done_ids = self.context.get("done_ids")
        return None if done_ids is None else obj.pk in done_ids

    def validate(self, attrs):
        if self.instance is not None and "section" in attrs and attrs["section"] != self.instance.section:
            raise serializers.ValidationError({"section": "Post new homework to move it to another section."})
        due = attrs.get("due_date")
        assigned = getattr(self.instance, "assigned_on", None) or self.context.get("today")
        if due and assigned and due < assigned:
            raise serializers.ValidationError({"due_date": "The due date cannot be before the day it is set."})
        return attrs
