from rest_framework import serializers

from apps.academics.models import SectionSubject
from apps.academics.serializers import TeacherRefField

from .models import Period, TimetableEntry


class PeriodSerializer(serializers.ModelSerializer):
    class Meta:
        model = Period
        fields = ["id", "name", "start_time", "end_time", "order", "is_break"]

    def validate(self, attrs):
        start = attrs.get("start_time", getattr(self.instance, "start_time", None))
        end = attrs.get("end_time", getattr(self.instance, "end_time", None))
        if start and end and end <= start:
            raise serializers.ValidationError({"end_time": "The period must end after it starts."})
        name = attrs.get("name", getattr(self.instance, "name", None))
        clash = Period.objects.filter(name=name)
        if self.instance:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError({"name": "A period with this name already exists."})
        return attrs


def teacher_clashes(teacher, day, period, exclude_pk=None):
    """Other sections the teacher is booked in at the same day and period."""
    if teacher is None:
        return []
    qs = TimetableEntry.objects.filter(teacher=teacher, day_of_week=day, period=period).select_related(
        "section__school_class", "subject"
    )
    if exclude_pk:
        qs = qs.exclude(pk=exclude_pk)
    return [{"section": str(e.section), "subject": e.subject.name} for e in qs]


class TimetableEntrySerializer(serializers.ModelSerializer):
    section_name = serializers.SerializerMethodField()
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    teacher = TeacherRefField(allow_null=True, required=False)
    teacher_name = serializers.CharField(source="teacher.user.name", read_only=True, default=None)
    period_name = serializers.CharField(source="period.name", read_only=True)
    start_time = serializers.TimeField(source="period.start_time", read_only=True)
    end_time = serializers.TimeField(source="period.end_time", read_only=True)
    day_name = serializers.CharField(source="get_day_of_week_display", read_only=True)
    # Saving a slot that double-books a teacher is refused with the clashes
    # listed, unless the caller confirms with allow_clash.
    allow_clash = serializers.BooleanField(write_only=True, required=False, default=False)

    class Meta:
        model = TimetableEntry
        fields = [
            "id", "section", "section_name", "day_of_week", "day_name", "period", "period_name", "start_time",
            "end_time", "subject", "subject_name", "teacher", "teacher_name", "room", "allow_clash",
        ]

    def get_section_name(self, obj):
        return str(obj.section)

    def validate(self, attrs):
        get = lambda key: attrs.get(key, getattr(self.instance, key, None))  # noqa: E731
        section, subject, period, day = get("section"), get("subject"), get("period"), get("day_of_week")
        if period is not None and period.is_break:
            raise serializers.ValidationError({"period": "This period is a break."})
        slot = TimetableEntry.objects.filter(section=section, day_of_week=day, period=period)
        if self.instance:
            slot = slot.exclude(pk=self.instance.pk)
        if slot.exists():
            raise serializers.ValidationError({"period": "This section already has a class in that period."})
        if "teacher" not in attrs and (self.instance is None or "subject" in attrs):
            # Default to whoever teaches this subject to the section.
            link = SectionSubject.objects.filter(section=section, subject=subject).first()
            attrs["teacher"] = link.teacher if link else None
        clashes = teacher_clashes(get("teacher"), day, period, getattr(self.instance, "pk", None))
        if clashes and not attrs.pop("allow_clash", False):
            raise serializers.ValidationError({
                "teacher": f"{get('teacher')} is already teaching "
                           + ", ".join(f"{c['section']} ({c['subject']})" for c in clashes) + " at this time.",
                "clashes": clashes,
            })
        attrs.pop("allow_clash", None)
        return attrs
