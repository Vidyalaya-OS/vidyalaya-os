"""Outgoing email and SMS.

Email goes through Django's email backend (console in development, Amazon SES
in production). SMS is logged until a gateway is chosen for the first country.
"""

import logging

from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger("apps.notify")


def send_sms(phone, message):
    logger.info("SMS to %s: %s", phone, message)


def _deliver(user, subject, message):
    if user.email:
        send_mail(subject, message, settings.DEFAULT_FROM_EMAIL, [user.email])
    elif user.phone:
        send_sms(user.phone, message)


def invite_url(token):
    return f"{settings.WEB_APP_URL.rstrip('/')}/invite/{token}"


def reset_url(token):
    return f"{settings.WEB_APP_URL.rstrip('/')}/reset-password/{token}"


def send_invite(user, token, school=None):
    where = f"{school.name} on {settings.APP_NAME}" if school else settings.APP_NAME
    message = (
        f"Hello {user.name},\n\n"
        f"You have been invited to {where}. Set your password here:\n{invite_url(token)}\n\n"
        f"The link is valid for {settings.INVITE_VALID_DAYS} days."
    )
    _deliver(user, f"Your invitation to {where}", message)


def send_login_code(user, code):
    message = f"Your {settings.APP_NAME} login code is {code}. It expires in 10 minutes."
    _deliver(user, f"Your {settings.APP_NAME} login code", message)


def send_password_reset(user, token):
    minutes = settings.PASSWORD_RESET_VALID_MINUTES
    message = (
        f"Hello {user.name},\n\n"
        f"Choose a new {settings.APP_NAME} password here:\n{reset_url(token)}\n\n"
        f"The link works once, for {minutes} minutes. If you did not ask for it, ignore this message; "
        f"your password stays the same."
    )
    _deliver(user, f"Reset your {settings.APP_NAME} password", message)
