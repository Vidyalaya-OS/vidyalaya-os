from django.conf import settings
from django.db import models
from django.db.models import Q

from apps.tenancy.models import TenantModel


def student_photo_path(instance, filename):
    # Files live under a per-school folder.
    return f"schools/{instance.school_id}/students/{instance.id}/{filename}"


class Student(TenantModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        LEFT = "left", "Left the school"
        GRADUATED = "graduated", "Graduated"

    class Gender(models.TextChoices):
        FEMALE = "female", "Female"
        MALE = "male", "Male"
        OTHER = "other", "Other"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="student_records")
    admission_no = models.CharField(max_length=50)
    dob = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=10, choices=Gender.choices, blank=True)
    photo = models.FileField(upload_to=student_photo_path, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    left_on = models.DateField(null=True, blank=True)

    class Meta:
        db_table = "students"
        ordering = ["user__name"]
        constraints = [
            models.UniqueConstraint(fields=["school", "admission_no"], name="unique_admission_no"),
            models.UniqueConstraint(fields=["school", "user"], name="unique_student_user"),
        ]

    def __str__(self):
        return f"{self.user.name} ({self.admission_no})"

    @property
    def current_enrollment(self):
        return (
            self.enrollments.filter(status=Enrollment.Status.ACTIVE)
            .select_related("section__school_class", "academic_year")
            .order_by("-academic_year__start_date")
            .first()
        )


class Enrollment(TenantModel):
    """A student in a section for one academic year. Never deleted, so history is kept."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        TRANSFERRED = "transferred", "Moved to another section"
        PROMOTED = "promoted", "Promoted"
        LEFT = "left", "Left"
        COMPLETED = "completed", "Completed the year"

    student = models.ForeignKey(Student, on_delete=models.PROTECT, related_name="enrollments")
    section = models.ForeignKey("academics.Section", on_delete=models.PROTECT, related_name="enrollments")
    academic_year = models.ForeignKey("academics.AcademicYear", on_delete=models.PROTECT, related_name="enrollments")
    roll_no = models.PositiveIntegerField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    ended_on = models.DateField(null=True, blank=True)

    class Meta:
        db_table = "enrollments"
        ordering = ["section", "roll_no"]
        constraints = [
            # A student has at most one active enrollment in a year.
            models.UniqueConstraint(
                fields=["student", "academic_year"],
                condition=Q(status="active"),
                name="one_active_enrollment_per_year",
            ),
            models.UniqueConstraint(
                fields=["section", "roll_no"],
                condition=Q(status="active", roll_no__isnull=False),
                name="unique_active_roll_no",
            ),
        ]

    def __str__(self):
        return f"{self.student} in {self.section}"


class Teacher(TenantModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        LEFT = "left", "Left the school"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="teacher_records")
    employee_no = models.CharField(max_length=50, blank=True)
    qualification = models.CharField(max_length=200, blank=True)
    joined_on = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)

    class Meta:
        db_table = "teachers"
        ordering = ["user__name"]
        constraints = [
            models.UniqueConstraint(fields=["school", "user"], name="unique_teacher_user"),
            models.UniqueConstraint(
                fields=["school", "employee_no"], condition=~Q(employee_no=""), name="unique_employee_no"
            ),
        ]

    def __str__(self):
        return self.user.name


class Guardian(TenantModel):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="guardian_records")
    relation = models.CharField(max_length=50, blank=True, help_text="Mother, father, guardian.")
    children = models.ManyToManyField(Student, through="StudentGuardian", related_name="guardians")

    class Meta:
        db_table = "guardians"
        ordering = ["user__name"]
        constraints = [models.UniqueConstraint(fields=["school", "user"], name="unique_guardian_user")]

    def __str__(self):
        return self.user.name


class StudentGuardian(TenantModel):
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="guardian_links")
    guardian = models.ForeignKey(Guardian, on_delete=models.CASCADE, related_name="child_links")
    is_primary = models.BooleanField(default=False)

    class Meta:
        db_table = "student_guardians"
        constraints = [models.UniqueConstraint(fields=["student", "guardian"], name="unique_student_guardian")]
