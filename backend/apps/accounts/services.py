from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.tenancy import context

from . import notify
from .models import Invite, SchoolMembership, User, normalize_email, normalize_phone


def find_or_create_user(name, email=None, phone=None, require_contact=True):
    """Return the person's single login, creating it if they are new.

    A person registered at two schools (or as teacher and parent) keeps one
    login. Email and phone must not point at two different people.
    """
    email, phone = normalize_email(email), normalize_phone(phone)
    if not email and not phone:
        if require_contact:
            raise ValidationError({"email": "Give an email or a phone number."})
        return User.objects.create_user(name=name.strip()), True
    by_email = User.objects.filter(email=email).first() if email else None
    by_phone = User.objects.filter(phone=phone).first() if phone else None
    if by_email and by_phone and by_email.pk != by_phone.pk:
        raise ValidationError({"phone": "This email and this phone number belong to two different people."})
    user = by_email or by_phone
    if user is None:
        return User.objects.create_user(email=email, phone=phone, name=name.strip()), True
    changed = []
    if email and not user.email:
        user.email, changed = email, changed + ["email"]
    if phone and not user.phone:
        user.phone, changed = phone, changed + ["phone"]
    if changed:
        user.save(update_fields=changed)
    return user, False


def grant_role(user, role):
    membership, created = SchoolMembership.objects.get_or_create(user=user, role=role)
    if not created and not membership.is_active:
        membership.is_active = True
        membership.save(update_fields=["is_active", "updated_at"])
    return membership


def revoke_role(user, role):
    SchoolMembership.objects.filter(user=user, role=role).update(is_active=False)


def send_invite(user, school=None):
    """Invite a person who has not set a password yet. Returns True if sent."""
    if not (user.email or user.phone):
        return False
    if user.has_usable_password() and user.status == User.Status.ACTIVE:
        return False
    school = school or context.get_current_school()
    _, token = Invite.issue(user, school)
    transaction.on_commit(lambda: notify.send_invite(user, token, school))
    return True
