"""The platform owner's actions on schools: onboarding, status changes and
admin invites. Each one is recorded in the audit log."""

from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.accounts import audit
from apps.accounts import services as accounts
from apps.accounts.models import Role, SchoolMembership

from . import context
from .models import School


@transaction.atomic
def onboard_school(*, actor, school, admin, academic_year=None):
    """Create a school, optionally its current academic year, and its first
    admin, who is emailed an invite. `school` holds School fields, `admin`
    holds name, email and phone, `academic_year` holds name, start and end."""
    from apps.academics.models import AcademicYear

    created = School.objects.create(**school)
    with context.school_context(created):
        if academic_year:
            AcademicYear.objects.create(
                name=academic_year["name"], start_date=academic_year["start"],
                end_date=academic_year["end"], is_current=True,
            )
        user, _ = accounts.find_or_create_user(admin["name"], admin["email"], admin.get("phone"))
        accounts.grant_role(user, Role.ADMIN)
        accounts.send_invite(user, created)
        audit.record(actor, "school.create", "school", created.pk, after={"name": created.name}, school=created)
    return created


def set_status(school, new_status, *, actor):
    """Make a school active, suspended (read-only) or archived (closed)."""
    old = school.status
    school.status = new_status
    school.save(update_fields=["status", "updated_at"])
    audit.record(actor, f"school.{new_status}", "school", school.pk,
                 before={"status": old}, after={"status": new_status}, school=school)
    return school


def first_admin(school):
    """The school's longest-standing active admin membership, or None."""
    with context.school_context(school):
        return (
            SchoolMembership.objects.filter(role=Role.ADMIN, is_active=True)
            .select_related("user")
            .order_by("created_at")
            .first()
        )


def resend_admin_invite(school):
    """Send the first admin a fresh invite. Returns False when they have
    already set a password (nothing is sent)."""
    membership = first_admin(school)
    if membership is None:
        raise ValidationError({"detail": "This school has no admin."})
    with context.school_context(school):
        return accounts.send_invite(membership.user, school)
