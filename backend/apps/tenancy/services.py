"""The platform owner's actions on schools: onboarding, status changes and
admin invites. Each one is recorded in the audit log."""

from django.db import transaction
from rest_framework.exceptions import NotFound, ValidationError

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


def school_admins(school):
    """The school's active admins, oldest first."""
    with context.school_context(school):
        return list(SchoolMembership.objects.filter(role=Role.ADMIN, is_active=True).select_related("user")
                    .order_by("created_at"))


@transaction.atomic
def add_admin(school, person, *, actor):
    """Make a person (name, email, phone) an admin of the school. Someone new
    is sent an invite; someone who already has a login keeps their password."""
    with context.school_context(school):
        user, _ = accounts.find_or_create_user(person["name"], person["email"], person.get("phone"))
        membership = accounts.grant_role(user, Role.ADMIN)
        accounts.send_invite(user, school)
        audit.record(actor, "admin.create", "user", user.pk, school=school)
    return membership


def _admin(school, user_id):
    membership = (SchoolMembership.objects.filter(role=Role.ADMIN, is_active=True, user_id=user_id)
                  .select_related("user").first())
    if membership is None:
        raise NotFound("This person is not an admin of the school.")
    return membership


@transaction.atomic
def remove_admin(school, user_id, *, actor):
    """Take admin rights away. Their login and other roles stay."""
    with context.school_context(school):
        membership = _admin(school, user_id)
        if SchoolMembership.objects.filter(role=Role.ADMIN, is_active=True).count() == 1:
            raise ValidationError({"detail": "A school needs at least one admin."})
        membership.is_active = False
        membership.save(update_fields=["is_active", "updated_at"])
        audit.record(actor, "admin.remove", "user", user_id, school=school)


def send_admin_login_link(school, user_id, *, actor):
    """An invite or a password reset link for one of the school's admins."""
    with context.school_context(school):
        membership = _admin(school, user_id)
        sent = accounts.send_login_link(membership.user, school)
        if sent:
            audit.record(actor, "admin.send_login_link", "user", user_id, after={"link": sent}, school=school)
    return sent
