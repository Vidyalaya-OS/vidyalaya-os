"""Warn when the database role would skip row-level security.

    python manage.py check_db_role

School separation relies on PostgreSQL policies, which a superuser or a role
with BYPASSRLS never sees. Run at start-up on a host (bin/start.sh), so a
wrongly set up database shows in the logs instead of passing silently.
"""

from django.core.management.base import BaseCommand
from django.db import connection


class Command(BaseCommand):
    help = "Check that the app's database role is subject to row-level security."

    def handle(self, *args, **options):
        with connection.cursor() as cursor:
            cursor.execute("SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user")
            name, is_super, bypasses = cursor.fetchone()
        if is_super or bypasses:
            self.stderr.write(self.style.WARNING(
                f"WARNING: database role {name} is a superuser or has BYPASSRLS, so schools are NOT kept apart. "
                "Connect as a normal role (see db/init.sql)."))
        else:
            self.stdout.write(f"Database role {name} is subject to row-level security.")
