"""Create a demo platform with two schools, for trying the app locally.

    python manage.py seed_demo
    python manage.py seed_demo --file path/to/other_demo.json

What is created comes from config/demo_data.json (see apps/core/demo.py).
Everyone's password is the one printed at the end.
"""

from django.core.management.base import BaseCommand

from apps.core import demo


class Command(BaseCommand):
    help = "Create demo schools and people from the demo config (safe to run more than once)."

    def add_arguments(self, parser):
        parser.add_argument("--file", help="A demo config file to use instead of the default.")

    def handle(self, *args, **options):
        config = demo.load_config(options.get("file"))
        demo.seed(config)
        logins = demo.demo_logins(config)
        self.stdout.write(self.style.SUCCESS(f"Demo data ready. Password for every account: {logins['password']}"))
        for login in logins["logins"]:
            self.stdout.write(f"  {login['label']:<8} {login['email']}")
