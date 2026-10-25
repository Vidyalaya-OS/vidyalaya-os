"""Create a platform owner without putting a password in code or settings.

    python manage.py create_platform_owner --email you@example.com --name "Your Name"

The owner gets no password here. The command prints a one-time link (and
sends it by email once email is set up); the owner opens it and chooses their
own password. Run it again with another email to add a second owner. For an
owner who already has a password, it prints a password reset link instead.
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.accounts import audit, notify, services
from apps.accounts.models import Invite, User


class Command(BaseCommand):
    help = "Create (or find) a platform owner and print a one-time link to set their password."

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True, help="The owner's email address; also their login.")
        parser.add_argument("--name", required=True, help="The owner's full name.")
        parser.add_argument("--phone", default="", help="Optional phone number.")

    def handle(self, *args, **options):
        try:
            with transaction.atomic():
                user, created = services.find_or_create_user(options["name"], options["email"], options["phone"])
                if not user.is_platform_owner:
                    user.is_platform_owner = True
                    user.save(update_fields=["is_platform_owner", "updated_at"])
                reset = user.has_usable_password() and user.status == User.Status.ACTIVE
                purpose = Invite.Purpose.RESET if reset else Invite.Purpose.INVITE
                _, token = Invite.issue(user, purpose=purpose)
                send = notify.send_password_reset if reset else notify.send_invite
                transaction.on_commit(lambda: send(user, token))
                audit.record(None, "platform.owner_create" if created else "platform.owner_link", "user", user.pk)
        except ValidationError as exc:
            raise CommandError(str(exc.detail)) from exc
        link = notify.reset_url(token) if reset else notify.invite_url(token)
        self.stdout.write(self.style.SUCCESS(f"{'Created' if created else 'Found'} platform owner {user.email or user.phone}."))
        self.stdout.write(f"Open this link once to choose the password (also sent by email if email is set up):\n{link}")
