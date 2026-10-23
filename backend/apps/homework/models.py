from django.conf import settings
from django.db import models

from apps.tenancy.models import TenantModel


def attachment_path(instance, filename):
    # Files live under a per-school folder and are only served through the API.
    return f"schools/{instance.school_id}/homework/{instance.homework_id}/{filename}"


class Homework(TenantModel):
    section = models.ForeignKey("academics.Section", on_delete=models.CASCADE, related_name="homework")
    subject = models.ForeignKey("academics.Subject", on_delete=models.PROTECT, related_name="homework")
    teacher = models.ForeignKey("people.Teacher", on_delete=models.SET_NULL, null=True, blank=True,
                                related_name="homework")
    title = models.CharField(max_length=200)
    instructions = models.TextField(blank=True)
    assigned_on = models.DateField()
    due_date = models.DateField()
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")

    class Meta:
        db_table = "homework"
        ordering = ["due_date", "created_at"]
        verbose_name_plural = "homework"
        indexes = [models.Index(fields=["school", "section", "due_date"])]

    def __str__(self):
        return self.title


class HomeworkAttachment(TenantModel):
    homework = models.ForeignKey(Homework, on_delete=models.CASCADE, related_name="attachments")
    file = models.FileField(upload_to=attachment_path, max_length=300)
    name = models.CharField(max_length=200)
    size = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "homework_attachments"
        ordering = ["created_at"]


class HomeworkStatus(TenantModel):
    """A student marking homework as done."""

    homework = models.ForeignKey(Homework, on_delete=models.CASCADE, related_name="statuses")
    student = models.ForeignKey("people.Student", on_delete=models.CASCADE, related_name="homework_statuses")
    done_at = models.DateTimeField()

    class Meta:
        db_table = "homework_status"
        constraints = [models.UniqueConstraint(fields=["homework", "student"], name="unique_homework_status")]
