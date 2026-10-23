from django.db import models
from django.db.models import Q

from apps.tenancy.context import get_current_school_id
from apps.tenancy.models import TenantModel


class AcademicYear(TenantModel):
    name = models.CharField(max_length=20, help_text="For example 2026-27.")
    start_date = models.DateField()
    end_date = models.DateField()
    is_current = models.BooleanField(default=False)

    class Meta:
        db_table = "academic_years"
        ordering = ["-start_date"]
        constraints = [
            models.UniqueConstraint(fields=["school", "name"], name="unique_academic_year_name"),
            models.UniqueConstraint(
                fields=["school"], condition=Q(is_current=True), name="one_current_academic_year"
            ),
            models.CheckConstraint(condition=Q(end_date__gt=models.F("start_date")), name="year_ends_after_start"),
        ]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if self.school_id is None:
            self.school_id = get_current_school_id()
        if self.is_current:
            AcademicYear.objects.filter(school_id=self.school_id, is_current=True).exclude(pk=self.pk).update(is_current=False)
        super().save(*args, **kwargs)


class SchoolClass(TenantModel):
    """A grade, such as Grade 5. Sections (5-A, 5-B) belong to a class."""

    name = models.CharField(max_length=50)
    order = models.PositiveSmallIntegerField(default=0, help_text="Position in lists; also used for promotion.")

    class Meta:
        db_table = "classes"
        ordering = ["order", "name"]
        verbose_name = "class"
        verbose_name_plural = "classes"
        constraints = [models.UniqueConstraint(fields=["school", "name"], name="unique_class_name")]

    def __str__(self):
        return self.name


class Subject(TenantModel):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=20, blank=True)

    class Meta:
        db_table = "subjects"
        ordering = ["name"]
        constraints = [models.UniqueConstraint(fields=["school", "name"], name="unique_subject_name")]

    def __str__(self):
        return self.name


class Section(TenantModel):
    school_class = models.ForeignKey(SchoolClass, on_delete=models.PROTECT, related_name="sections")
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.PROTECT, related_name="sections")
    name = models.CharField(max_length=20, help_text="For example A.")
    class_teacher = models.ForeignKey(
        "people.Teacher", on_delete=models.SET_NULL, null=True, blank=True, related_name="class_sections"
    )

    class Meta:
        db_table = "sections"
        ordering = ["school_class__order", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["school", "academic_year", "school_class", "name"], name="unique_section"
            )
        ]

    def __str__(self):
        return f"{self.school_class.name}-{self.name}"


class SectionSubject(TenantModel):
    """Who teaches which subject to which section."""

    section = models.ForeignKey(Section, on_delete=models.CASCADE, related_name="section_subjects")
    subject = models.ForeignKey(Subject, on_delete=models.PROTECT, related_name="section_subjects")
    teacher = models.ForeignKey(
        "people.Teacher", on_delete=models.SET_NULL, null=True, blank=True, related_name="section_subjects"
    )

    class Meta:
        db_table = "section_subjects"
        ordering = ["section", "subject__name"]
        constraints = [models.UniqueConstraint(fields=["section", "subject"], name="unique_section_subject")]

    def __str__(self):
        return f"{self.section} {self.subject}"
