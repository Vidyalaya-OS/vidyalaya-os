from django.db import transaction
from rest_framework import serializers

from apps.academics.models import AcademicYear, Section, SectionSubject, Subject
from apps.accounts import services
from apps.accounts.models import Role, User, normalize_email, normalize_phone

from .models import Enrollment, Guardian, Student, StudentGuardian, Teacher


def check_contact_free(user, email, phone):
    """Changing a person's email or phone must not take someone else's."""
    email, phone = normalize_email(email), normalize_phone(phone)
    if email and User.objects.filter(email=email).exclude(pk=user.pk).exists():
        raise serializers.ValidationError({"email": "Another person already uses this email."})
    if phone and User.objects.filter(phone=phone).exclude(pk=user.pk).exists():
        raise serializers.ValidationError({"phone": "Another person already uses this phone number."})


def update_person(user, attrs):
    """Apply name, email and phone changes to the shared login."""
    changes = {k: attrs.pop(k) for k in ("name", "email", "phone") if k in attrs}
    if not changes:
        return False
    check_contact_free(user, changes.get("email"), changes.get("phone"))
    had_contact = bool(user.email or user.phone)
    for key, value in changes.items():
        setattr(user, key, value or (None if key != "name" else user.name))
    user.save()
    return not had_contact and bool(user.email or user.phone)


class PersonFields(serializers.Serializer):
    """Name and contact fields shared by students, teachers and parents."""

    name = serializers.CharField(source="user.name", max_length=200)
    email = serializers.EmailField(source="user.email", required=False, allow_null=True, allow_blank=True)
    phone = serializers.CharField(source="user.phone", required=False, allow_null=True, allow_blank=True)
    user_id = serializers.UUIDField(source="user.id", read_only=True)
    login_status = serializers.CharField(source="user.status", read_only=True)


class EnrollmentSerializer(serializers.ModelSerializer):
    section_name = serializers.SerializerMethodField()
    academic_year_name = serializers.CharField(source="academic_year.name", read_only=True)

    class Meta:
        model = Enrollment
        fields = ["id", "section", "section_name", "academic_year", "academic_year_name", "roll_no", "status",
                  "ended_on", "created_at"]

    def get_section_name(self, obj):
        return str(obj.section)


class GuardianBriefSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="guardian.user.name")
    email = serializers.EmailField(source="guardian.user.email")
    phone = serializers.CharField(source="guardian.user.phone")
    relation = serializers.CharField(source="guardian.relation")
    id = serializers.UUIDField(source="guardian.id")

    class Meta:
        model = StudentGuardian
        fields = ["id", "name", "email", "phone", "relation", "is_primary"]


class GuardianInputSerializer(serializers.Serializer):
    """Link an existing parent by id, or describe a new one."""

    guardian_id = serializers.PrimaryKeyRelatedField(queryset=Guardian.objects.all(), required=False)
    name = serializers.CharField(required=False, max_length=200)
    email = serializers.EmailField(required=False, allow_blank=True)
    phone = serializers.CharField(required=False, allow_blank=True)
    relation = serializers.CharField(required=False, allow_blank=True, max_length=50)
    is_primary = serializers.BooleanField(default=False)

    def validate(self, attrs):
        if not attrs.get("guardian_id"):
            if not attrs.get("name"):
                raise serializers.ValidationError({"name": "Give the parent's name, or pick an existing parent."})
            if not (attrs.get("email") or attrs.get("phone")):
                raise serializers.ValidationError({"email": "A parent needs an email or phone number to log in."})
        return attrs


def ensure_guardian(data, invite=True):
    """Find or create the parent described by GuardianInputSerializer data."""
    guardian = data.get("guardian_id")
    if guardian is None:
        user, _ = services.find_or_create_user(data["name"], data.get("email"), data.get("phone"))
        guardian, created = Guardian.objects.get_or_create(user=user, defaults={"relation": data.get("relation", "")})
        if not created and data.get("relation") and not guardian.relation:
            guardian.relation = data["relation"]
            guardian.save(update_fields=["relation", "updated_at"])
    services.grant_role(guardian.user, Role.PARENT)
    if invite:
        services.send_invite(guardian.user)
    return guardian


def link_guardian(student, guardian, is_primary=False):
    link, _ = StudentGuardian.objects.get_or_create(student=student, guardian=guardian)
    if is_primary:
        StudentGuardian.objects.filter(student=student).exclude(pk=link.pk).update(is_primary=False)
    if link.is_primary != is_primary:
        link.is_primary = is_primary
        link.save(update_fields=["is_primary", "updated_at"])
    return link


def check_roll_no(section, roll_no, exclude_enrollment=None):
    if roll_no is None:
        return
    clash = Enrollment.objects.filter(section=section, roll_no=roll_no, status=Enrollment.Status.ACTIVE)
    if exclude_enrollment is not None:
        clash = clash.exclude(pk=exclude_enrollment.pk)
    if clash.exists():
        raise serializers.ValidationError({"roll_no": f"Roll number {roll_no} is already taken in {section}."})


class StudentSerializer(PersonFields, serializers.ModelSerializer):
    current_enrollment = serializers.SerializerMethodField()
    guardians = GuardianBriefSerializer(source="guardian_links", many=True, read_only=True)

    # Write-only, used on create.
    section = serializers.PrimaryKeyRelatedField(
        queryset=Section.objects.all(), write_only=True, required=False, allow_null=True
    )
    roll_no = serializers.IntegerField(write_only=True, required=False, allow_null=True, min_value=1)
    guardian_list = GuardianInputSerializer(many=True, write_only=True, required=False)
    send_invites = serializers.BooleanField(write_only=True, default=True)

    class Meta:
        model = Student
        fields = [
            "id", "user_id", "name", "email", "phone", "login_status", "admission_no", "dob", "gender", "photo",
            "status", "left_on", "current_enrollment", "guardians",
            "section", "roll_no", "guardian_list", "send_invites", "created_at",
        ]
        read_only_fields = ["status", "left_on", "created_at"]

    def get_current_enrollment(self, obj):
        enrollment = obj.current_enrollment
        return EnrollmentSerializer(enrollment).data if enrollment else None

    def validate_admission_no(self, value):
        value = value.strip()
        clash = Student.objects.filter(admission_no__iexact=value)
        if self.instance:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError("Another student has this admission number.")
        return value

    def validate(self, attrs):
        if self.instance is None and attrs.get("section"):
            check_roll_no(attrs["section"], attrs.get("roll_no"))
        return attrs

    @transaction.atomic
    def create(self, validated):
        person = validated.pop("user")
        section = validated.pop("section", None)
        roll_no = validated.pop("roll_no", None)
        guardians = validated.pop("guardian_list", [])
        invite = validated.pop("send_invites", True)
        user, _ = services.find_or_create_user(
            person["name"], person.get("email"), person.get("phone"), require_contact=False
        )
        if Student.objects.filter(user=user).exists():
            raise serializers.ValidationError({"email": "This person is already registered as a student here."})
        student = Student.objects.create(user=user, **validated)
        services.grant_role(user, Role.STUDENT)
        if section is not None:
            Enrollment.objects.create(
                student=student, section=section, academic_year=section.academic_year, roll_no=roll_no
            )
        for g in guardians:
            link_guardian(student, ensure_guardian(g, invite=invite), g.get("is_primary", False))
        if invite:
            services.send_invite(user)
        return student

    @transaction.atomic
    def update(self, instance, validated):
        for key in ("section", "roll_no", "guardian_list"):
            validated.pop(key, None)
        invite = validated.pop("send_invites", True)
        gained_contact = update_person(instance.user, validated.pop("user", {}))
        student = super().update(instance, validated)
        if gained_contact and invite:
            services.send_invite(student.user)
        return student


class MoveStudentSerializer(serializers.Serializer):
    section = serializers.PrimaryKeyRelatedField(queryset=Section.objects.all())
    roll_no = serializers.IntegerField(required=False, allow_null=True, min_value=1)


class LeaveSerializer(serializers.Serializer):
    left_on = serializers.DateField()
    status = serializers.ChoiceField(choices=["left", "graduated"], default="left")


class PromoteSerializer(serializers.Serializer):
    from_section = serializers.PrimaryKeyRelatedField(queryset=Section.objects.all())
    to_section = serializers.PrimaryKeyRelatedField(queryset=Section.objects.all())
    student_ids = serializers.ListField(child=serializers.UUIDField(), required=False,
                                        help_text="Default: everyone active in from_section.")
    keep_roll_numbers = serializers.BooleanField(default=False)

    def validate(self, attrs):
        src, dst = attrs["from_section"], attrs["to_section"]
        if src.academic_year_id == dst.academic_year_id:
            raise serializers.ValidationError(
                {"to_section": "Promotion moves students into a later year. To change section, move the student."}
            )
        if dst.academic_year.start_date <= src.academic_year.start_date:
            raise serializers.ValidationError({"to_section": "The new section must be in a later academic year."})
        return attrs


class TeacherAssignmentSerializer(serializers.Serializer):
    section = serializers.PrimaryKeyRelatedField(queryset=Section.objects.all())
    subject = serializers.PrimaryKeyRelatedField(queryset=Subject.objects.all())


class TeacherSerializer(PersonFields, serializers.ModelSerializer):
    teaches = serializers.SerializerMethodField()
    class_teacher_of = serializers.SerializerMethodField()
    assignments = TeacherAssignmentSerializer(many=True, write_only=True, required=False)
    send_invites = serializers.BooleanField(write_only=True, default=True)

    class Meta:
        model = Teacher
        fields = [
            "id", "user_id", "name", "email", "phone", "login_status", "employee_no", "qualification", "joined_on",
            "status", "teaches", "class_teacher_of", "assignments", "send_invites", "created_at",
        ]
        read_only_fields = ["status", "created_at"]

    def get_teaches(self, obj):
        rows = obj.section_subjects.filter(section__academic_year__is_current=True).select_related(
            "section__school_class", "subject"
        )
        return [
            {"section": str(r.section_id), "section_name": str(r.section), "subject": str(r.subject_id),
             "subject_name": r.subject.name}
            for r in rows
        ]

    def get_class_teacher_of(self, obj):
        rows = obj.class_sections.filter(academic_year__is_current=True).select_related("school_class")
        return [{"section": str(s.id), "section_name": str(s)} for s in rows]

    def validate_employee_no(self, value):
        value = value.strip()
        if value:
            clash = Teacher.objects.filter(employee_no__iexact=value)
            if self.instance:
                clash = clash.exclude(pk=self.instance.pk)
            if clash.exists():
                raise serializers.ValidationError("Another teacher has this employee number.")
        return value

    def validate(self, attrs):
        person = attrs.get("user", {})
        if self.instance is None and not (person.get("email") or person.get("phone")):
            raise serializers.ValidationError({"email": "A teacher needs an email or phone number to log in."})
        return attrs

    def _assign(self, teacher, assignments):
        for a in assignments:
            row, _ = SectionSubject.objects.get_or_create(section=a["section"], subject=a["subject"])
            row.teacher = teacher
            row.save(update_fields=["teacher", "updated_at"])

    @transaction.atomic
    def create(self, validated):
        person = validated.pop("user")
        assignments = validated.pop("assignments", [])
        invite = validated.pop("send_invites", True)
        user, _ = services.find_or_create_user(person["name"], person.get("email"), person.get("phone"))
        if Teacher.objects.filter(user=user).exists():
            raise serializers.ValidationError({"email": "This person is already registered as a teacher here."})
        teacher = Teacher.objects.create(user=user, **validated)
        services.grant_role(user, Role.TEACHER)
        self._assign(teacher, assignments)
        if invite:
            services.send_invite(user)
        return teacher

    @transaction.atomic
    def update(self, instance, validated):
        assignments = validated.pop("assignments", None)
        invite = validated.pop("send_invites", True)
        gained_contact = update_person(instance.user, validated.pop("user", {}))
        teacher = super().update(instance, validated)
        if assignments is not None:
            self._assign(teacher, assignments)
        if gained_contact and invite:
            services.send_invite(teacher.user)
        return teacher


class ChildBriefSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="student.id")
    name = serializers.CharField(source="student.user.name")
    admission_no = serializers.CharField(source="student.admission_no")
    section_name = serializers.SerializerMethodField()

    class Meta:
        model = StudentGuardian
        fields = ["id", "name", "admission_no", "section_name", "is_primary"]

    def get_section_name(self, obj):
        enrollment = obj.student.current_enrollment
        return str(enrollment.section) if enrollment else None


class GuardianSerializer(PersonFields, serializers.ModelSerializer):
    children = ChildBriefSerializer(source="child_links", many=True, read_only=True)
    child_ids = serializers.PrimaryKeyRelatedField(
        queryset=Student.objects.all(), many=True, write_only=True, required=False
    )
    send_invites = serializers.BooleanField(write_only=True, default=True)

    class Meta:
        model = Guardian
        fields = ["id", "user_id", "name", "email", "phone", "login_status", "relation", "children", "child_ids",
                  "send_invites", "created_at"]
        read_only_fields = ["created_at"]

    def validate(self, attrs):
        person = attrs.get("user", {})
        if self.instance is None and not (person.get("email") or person.get("phone")):
            raise serializers.ValidationError({"email": "A parent needs an email or phone number to log in."})
        return attrs

    @transaction.atomic
    def create(self, validated):
        person = validated.pop("user")
        children = validated.pop("child_ids", [])
        invite = validated.pop("send_invites", True)
        user, _ = services.find_or_create_user(person["name"], person.get("email"), person.get("phone"))
        if Guardian.objects.filter(user=user).exists():
            raise serializers.ValidationError({"email": "This person is already registered as a parent here."})
        guardian = Guardian.objects.create(user=user, **validated)
        services.grant_role(user, Role.PARENT)
        for child in children:
            link_guardian(child, guardian)
        if invite:
            services.send_invite(user)
        return guardian

    @transaction.atomic
    def update(self, instance, validated):
        children = validated.pop("child_ids", None)
        validated.pop("send_invites", None)
        update_person(instance.user, validated.pop("user", {}))
        guardian = super().update(instance, validated)
        if children is not None:
            for child in children:
                link_guardian(child, guardian)
        return guardian


class AdminSerializer(serializers.Serializer):
    """Another school admin for the same school."""

    id = serializers.UUIDField(source="user.id", read_only=True)
    name = serializers.CharField(source="user.name", max_length=200)
    email = serializers.EmailField(source="user.email")
    phone = serializers.CharField(source="user.phone", required=False, allow_blank=True, allow_null=True)
    login_status = serializers.CharField(source="user.status", read_only=True)
    membership_id = serializers.UUIDField(source="id", read_only=True)


def current_year():
    return AcademicYear.objects.filter(is_current=True).first()
