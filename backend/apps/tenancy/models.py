import uuid

from django.core.validators import RegexValidator
from django.db import models

from .context import get_current_school_id

subdomain_validator = RegexValidator(
    r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$",
    "Use lowercase letters, digits and hyphens, starting and ending with a letter or digit.",
)

RESERVED_SUBDOMAINS = {"www", "api", "admin", "app", "platform", "static", "media", "mail"}


class School(models.Model):
    """The root of each tenant. Not school-scoped itself."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        SUSPENDED = "suspended", "Suspended (read-only)"
        ARCHIVED = "archived", "Archived"

    class Plan(models.TextChoices):
        TRIAL = "trial", "Trial"
        STANDARD = "standard", "Standard"
        PREMIUM = "premium", "Premium"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    subdomain = models.CharField(max_length=63, unique=True, validators=[subdomain_validator])
    board = models.CharField(max_length=100, blank=True)
    address = models.TextField(blank=True)
    logo = models.FileField(upload_to="schools/logos/", blank=True)
    timezone = models.CharField(max_length=64, default="UTC")
    currency = models.CharField(max_length=3, default="INR")
    plan = models.CharField(max_length=20, choices=Plan.choices, default=Plan.TRIAL)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "schools"
        ordering = ["name"]

    def __str__(self):
        return self.name

    @property
    def is_writable(self):
        return self.status == self.Status.ACTIVE


class TenantModel(models.Model):
    """Base for every school-owned table.

    Rows carry school_id, and PostgreSQL row-level security (see rls.py)
    only shows rows of the school set on the connection. When school is not
    given, it is filled from the current school context.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey(School, on_delete=models.PROTECT, related_name="+", editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if self.school_id is None:
            self.school_id = get_current_school_id()
        super().save(*args, **kwargs)
