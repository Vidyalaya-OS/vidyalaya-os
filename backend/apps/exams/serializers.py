from rest_framework import serializers

from apps.academics.models import AcademicYear, SchoolClass, Section, Subject

from .models import Exam, ExamTerm, GradeScale


class GradeScaleSerializer(serializers.ModelSerializer):
    class Meta:
        model = GradeScale
        fields = ["id", "name", "bands", "is_default"]

    def validate_bands(self, bands):
        if not isinstance(bands, list) or not bands:
            raise serializers.ValidationError("Give at least one band, such as {\"min\": 91, \"grade\": \"A1\"}.")
        mins, clean = set(), []
        for band in bands:
            try:
                low, grade = float(band["min"]), str(band["grade"]).strip()
            except (KeyError, TypeError, ValueError):
                raise serializers.ValidationError("Each band needs a minimum percentage and a grade.")
            if not 0 <= low <= 100 or not grade:
                raise serializers.ValidationError("Minimums are percentages from 0 to 100, and grades can't be blank.")
            if low in mins:
                raise serializers.ValidationError(f"Two bands start at {low:g}%.")
            mins.add(low)
            clean.append({"min": low, "grade": grade})
        if 0 not in mins:
            raise serializers.ValidationError("One band must start at 0% so every mark gets a grade.")
        return sorted(clean, key=lambda b: -b["min"])

    def validate_name(self, value):
        clash = GradeScale.objects.filter(name=value)
        if self.instance:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError("A scale with this name already exists.")
        return value


class ExamTermSerializer(serializers.ModelSerializer):
    academic_year = serializers.PrimaryKeyRelatedField(queryset=AcademicYear.objects.all())
    academic_year_name = serializers.CharField(source="academic_year.name", read_only=True)
    grade_scale = serializers.PrimaryKeyRelatedField(queryset=GradeScale.objects.all(), allow_null=True,
                                                     required=False)
    grade_scale_name = serializers.CharField(source="grade_scale.name", read_only=True, default=None)

    class Meta:
        model = ExamTerm
        fields = ["id", "academic_year", "academic_year_name", "name", "start_date", "end_date", "order",
                  "grade_scale", "grade_scale_name"]

    def validate(self, attrs):
        get = lambda k: attrs.get(k, getattr(self.instance, k, None))  # noqa: E731
        if get("start_date") and get("end_date") and get("end_date") < get("start_date"):
            raise serializers.ValidationError({"end_date": "The term must end after it starts."})
        clash = ExamTerm.objects.filter(academic_year=get("academic_year"), name=get("name"))
        if self.instance:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError({"name": "This term already exists for that year."})
        return attrs


class ExamSerializer(serializers.ModelSerializer):
    exam_term = serializers.PrimaryKeyRelatedField(queryset=ExamTerm.objects.all())
    section = serializers.PrimaryKeyRelatedField(queryset=Section.objects.all())
    subject = serializers.PrimaryKeyRelatedField(queryset=Subject.objects.all())
    exam_term_name = serializers.CharField(source="exam_term.name", read_only=True)
    section_name = serializers.SerializerMethodField()
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    marks_entered = serializers.IntegerField(read_only=True, required=False)
    students = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = Exam
        fields = ["id", "exam_term", "exam_term_name", "section", "section_name", "subject", "subject_name", "date",
                  "max_marks", "pass_marks", "status", "published_at", "marks_entered", "students"]
        read_only_fields = ["status", "published_at"]

    def get_section_name(self, obj):
        return str(obj.section)

    def validate(self, attrs):
        if self.instance is not None and self.instance.is_locked:
            raise serializers.ValidationError("Results are published, so this test is locked.")
        get = lambda k: attrs.get(k, getattr(self.instance, k, None))  # noqa: E731
        if self.instance is not None and self.instance.marks.exists() and any(
                k in attrs and attrs[k] != getattr(self.instance, k) for k in ("exam_term", "section", "subject")):
            raise serializers.ValidationError("Marks are already entered, so the term, section or subject can't change.")
        if get("section").academic_year_id != get("exam_term").academic_year_id:
            raise serializers.ValidationError({"section": "The section and the term are in different academic years."})
        if get("pass_marks") is not None and get("pass_marks") > get("max_marks"):
            raise serializers.ValidationError({"pass_marks": "Pass marks can't be above the maximum."})
        if self.instance is not None and "max_marks" in attrs and self.instance.marks.filter(
                marks_obtained__gt=attrs["max_marks"]).exists():
            raise serializers.ValidationError({"max_marks": "Some entered marks are above this maximum."})
        clash = Exam.objects.filter(exam_term=get("exam_term"), section=get("section"), subject=get("subject"))
        if self.instance:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError({"subject": "This section already has a test for that subject in the term."})
        return attrs


class CreateExamsSerializer(serializers.Serializer):
    """Create a test for every subject taught in some sections."""

    sections = serializers.PrimaryKeyRelatedField(queryset=Section.objects.all(), many=True, required=False)
    school_class = serializers.PrimaryKeyRelatedField(queryset=SchoolClass.objects.all(), required=False)
    max_marks = serializers.DecimalField(max_digits=6, decimal_places=2, min_value=1, default=100)
    pass_marks = serializers.DecimalField(max_digits=6, decimal_places=2, min_value=0, required=False,
                                          allow_null=True)
    date = serializers.DateField(required=False, allow_null=True)


class MarkRowSerializer(serializers.Serializer):
    enrollment = serializers.UUIDField()
    marks_obtained = serializers.DecimalField(max_digits=6, decimal_places=2, min_value=0, required=False,
                                              allow_null=True)
    is_absent = serializers.BooleanField(default=False)
    remark = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")


class MarksSheetSerializer(serializers.Serializer):
    rows = MarkRowSerializer(many=True)


class RemarkRowSerializer(serializers.Serializer):
    student = serializers.UUIDField()
    remarks = serializers.CharField(allow_blank=True, max_length=2000)


class SectionTermSerializer(serializers.Serializer):
    exam_term = serializers.PrimaryKeyRelatedField(queryset=ExamTerm.objects.all())
    section = serializers.PrimaryKeyRelatedField(queryset=Section.objects.all())


class RemarksSerializer(SectionTermSerializer):
    rows = RemarkRowSerializer(many=True)
