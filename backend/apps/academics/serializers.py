from rest_framework import serializers

from apps.people.models import Teacher

from .models import AcademicYear, SchoolClass, Section, SectionSubject, Subject


class AcademicYearSerializer(serializers.ModelSerializer):
    class Meta:
        model = AcademicYear
        fields = ["id", "name", "start_date", "end_date", "is_current"]

    def validate(self, attrs):
        start = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end = attrs.get("end_date", getattr(self.instance, "end_date", None))
        if start and end and end <= start:
            raise serializers.ValidationError({"end_date": "The year must end after it starts."})
        return attrs


class SchoolClassSerializer(serializers.ModelSerializer):
    class Meta:
        model = SchoolClass
        fields = ["id", "name", "order"]


class SubjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subject
        fields = ["id", "name", "code"]


class TeacherRefField(serializers.PrimaryKeyRelatedField):
    def get_queryset(self):
        return Teacher.objects.all()


class SectionSubjectSerializer(serializers.ModelSerializer):
    subject_name = serializers.CharField(source="subject.name", read_only=True)
    teacher_name = serializers.CharField(source="teacher.user.name", read_only=True, default=None)
    teacher = TeacherRefField(allow_null=True, required=False)

    class Meta:
        model = SectionSubject
        fields = ["id", "section", "subject", "subject_name", "teacher", "teacher_name"]


class SectionSerializer(serializers.ModelSerializer):
    class_name = serializers.CharField(source="school_class.name", read_only=True)
    academic_year_name = serializers.CharField(source="academic_year.name", read_only=True)
    class_teacher = TeacherRefField(allow_null=True, required=False)
    class_teacher_name = serializers.CharField(source="class_teacher.user.name", read_only=True, default=None)
    display_name = serializers.SerializerMethodField()
    student_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Section
        fields = [
            "id", "school_class", "class_name", "academic_year", "academic_year_name", "name",
            "display_name", "class_teacher", "class_teacher_name", "student_count",
        ]

    def get_display_name(self, obj):
        return f"{obj.school_class.name}-{obj.name}"

    def validate(self, attrs):
        # Unique per year, class and name; report it as a field error, not a 500.
        year = attrs.get("academic_year", getattr(self.instance, "academic_year", None))
        klass = attrs.get("school_class", getattr(self.instance, "school_class", None))
        name = attrs.get("name", getattr(self.instance, "name", None))
        clash = Section.objects.filter(academic_year=year, school_class=klass, name=name)
        if self.instance:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError({"name": "This section already exists for that class and year."})
        return attrs
