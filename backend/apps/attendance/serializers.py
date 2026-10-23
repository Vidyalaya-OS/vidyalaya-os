from rest_framework import serializers

from apps.academics.models import Section
from apps.people.models import Enrollment, Teacher

from .models import AttendanceRecord


class SheetRowSerializer(serializers.Serializer):
    enrollment = serializers.PrimaryKeyRelatedField(queryset=Enrollment.objects.all())
    status = serializers.ChoiceField(choices=AttendanceRecord.Status.choices)
    remark = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")


class SheetSerializer(serializers.Serializer):
    """A whole section's attendance for a day. Students left out are present."""

    section = serializers.PrimaryKeyRelatedField(queryset=Section.objects.all())
    date = serializers.DateField()
    records = SheetRowSerializer(many=True, required=False, default=list)


class TeacherRowSerializer(serializers.Serializer):
    teacher = serializers.PrimaryKeyRelatedField(queryset=Teacher.objects.all())
    status = serializers.ChoiceField(choices=AttendanceRecord.Status.choices)
    remark = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")


class TeacherSheetSerializer(serializers.Serializer):
    """All active teachers' attendance for a day. Teachers left out are present."""

    date = serializers.DateField()
    records = TeacherRowSerializer(many=True, required=False, default=list)
