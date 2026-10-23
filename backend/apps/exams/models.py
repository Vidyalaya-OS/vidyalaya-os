from django.conf import settings
from django.db import models
from django.db.models import Q

from apps.tenancy.models import TenantModel

# Used when a school has not set up its own grading scale (percentage bands).
DEFAULT_BANDS = [
    {"min": 91, "grade": "A1"}, {"min": 81, "grade": "A2"}, {"min": 71, "grade": "B1"},
    {"min": 61, "grade": "B2"}, {"min": 51, "grade": "C1"}, {"min": 41, "grade": "C2"},
    {"min": 33, "grade": "D"}, {"min": 0, "grade": "E"},
]


def grade_for(percentage, bands=None):
    """The grade of the highest band whose minimum the percentage reaches."""
    if percentage is None:
        return None
    for band in sorted(bands or DEFAULT_BANDS, key=lambda b: -float(b["min"])):
        if percentage >= float(band["min"]):
            return band["grade"]
    return None


class GradeScale(TenantModel):
    """Percentage bands to grades, such as 91 and above is A1."""

    name = models.CharField(max_length=100)
    bands = models.JSONField(help_text='A list like [{"min": 91, "grade": "A1"}, ...].')
    is_default = models.BooleanField(default=False)

    class Meta:
        db_table = "grade_scales"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["school", "name"], name="unique_grade_scale_name"),
            models.UniqueConstraint(fields=["school"], condition=Q(is_default=True), name="one_default_grade_scale"),
        ]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if self.is_default:
            GradeScale.objects.exclude(pk=self.pk).filter(is_default=True).update(is_default=False)
        super().save(*args, **kwargs)


class ExamTerm(TenantModel):
    """Unit test 1, Half-yearly, Final. A report card covers one term."""

    academic_year = models.ForeignKey("academics.AcademicYear", on_delete=models.PROTECT, related_name="exam_terms")
    name = models.CharField(max_length=100)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    order = models.PositiveSmallIntegerField(default=0)
    grade_scale = models.ForeignKey(GradeScale, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")

    class Meta:
        db_table = "exam_terms"
        ordering = ["academic_year__start_date", "order", "start_date", "name"]
        constraints = [
            models.UniqueConstraint(fields=["school", "academic_year", "name"], name="unique_exam_term_name")
        ]

    def __str__(self):
        return self.name

    @property
    def bands(self):
        scale = self.grade_scale or GradeScale.objects.filter(is_default=True).first()
        return scale.bands if scale else DEFAULT_BANDS


class Exam(TenantModel):
    """One subject's test for one section in a term. Marks lock once published."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Marks being entered"
        PUBLISHED = "published", "Published"

    exam_term = models.ForeignKey(ExamTerm, on_delete=models.PROTECT, related_name="exams")
    section = models.ForeignKey("academics.Section", on_delete=models.PROTECT, related_name="exams")
    subject = models.ForeignKey("academics.Subject", on_delete=models.PROTECT, related_name="exams")
    date = models.DateField(null=True, blank=True)
    max_marks = models.DecimalField(max_digits=6, decimal_places=2, default=100)
    pass_marks = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    published_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "exams"
        ordering = ["exam_term", "section", "subject__name"]
        constraints = [
            models.UniqueConstraint(fields=["exam_term", "section", "subject"], name="unique_exam_per_subject"),
            models.CheckConstraint(condition=Q(max_marks__gt=0), name="exam_max_marks_positive"),
        ]

    def __str__(self):
        return f"{self.exam_term} {self.section} {self.subject}"

    @property
    def is_locked(self):
        return self.status == self.Status.PUBLISHED


class Mark(TenantModel):
    exam = models.ForeignKey(Exam, on_delete=models.PROTECT, related_name="marks")
    enrollment = models.ForeignKey("people.Enrollment", on_delete=models.PROTECT, related_name="marks")
    marks_obtained = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    is_absent = models.BooleanField(default=False)
    remark = models.CharField(max_length=200, blank=True)
    entered_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")

    class Meta:
        db_table = "marks"
        constraints = [models.UniqueConstraint(fields=["exam", "enrollment"], name="unique_mark")]


class ReportCard(TenantModel):
    """A student's term report: their marks, attendance and the teacher's
    remarks. Students and parents see it once the admin publishes it."""

    student = models.ForeignKey("people.Student", on_delete=models.PROTECT, related_name="report_cards")
    exam_term = models.ForeignKey(ExamTerm, on_delete=models.PROTECT, related_name="report_cards")
    section = models.ForeignKey("academics.Section", on_delete=models.PROTECT, related_name="report_cards")
    remarks = models.TextField(blank=True)
    remarks_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name="+")
    attendance_pct = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    published_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "report_cards"
        constraints = [models.UniqueConstraint(fields=["student", "exam_term"], name="unique_report_card")]
