"""The lists the web app shows in its forms (plans, boards, time zones,
currencies and so on), kept in one place so the API and the web app agree.

Each list has a default here and can be replaced in settings or through an
environment variable (see config/settings.py), without code changes.
"""

from django.conf import settings

from apps.accounts.models import OneTimeCode, Role
from apps.tenancy.models import RESERVED_SUBDOMAINS, School

DEFAULT_BOARDS = ["CBSE", "ICSE", "State board", "IB", "Cambridge"]
DEFAULT_TIMEZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York", "UTC"]
DEFAULT_CURRENCIES = [
    {"code": "INR", "name": "Indian rupee"},
    {"code": "AED", "name": "UAE dirham"},
    {"code": "SGD", "name": "Singapore dollar"},
    {"code": "GBP", "name": "Pound sterling"},
    {"code": "USD", "name": "US dollar"},
    {"code": "EUR", "name": "Euro"},
]
PLAN_DESCRIPTIONS = {
    School.Plan.TRIAL: "Try every feature free while the school sets up.",
    School.Plan.STANDARD: "Attendance, homework, tests, report cards and fees.",
    School.Plan.PREMIUM: "Everything in Standard, plus priority support.",
}


def _setting(name, default):
    value = getattr(settings, name, None)
    return value if value else default


def app_config():
    """Public settings for the web app. Safe to show anyone: nothing here is
    about a school or a person."""
    from apps.fees.models import Payment

    data = {
        "app_name": getattr(settings, "APP_NAME", "Vidyalaya OS"),
        "plans": [{"key": k, "label": label, "description": PLAN_DESCRIPTIONS.get(k, "")} for k, label in School.Plan.choices],
        "boards": _setting("SCHOOL_BOARDS", DEFAULT_BOARDS),
        "timezones": _setting("SCHOOL_TIMEZONES", DEFAULT_TIMEZONES),
        "currencies": _setting("SCHOOL_CURRENCIES", DEFAULT_CURRENCIES),
        "reserved_subdomains": sorted(RESERVED_SUBDOMAINS),
        "roles": [{"key": k, "label": label} for k, label in Role.choices],
        "payment_modes": [{"key": k, "label": label} for k, label in Payment.Mode.choices],
        "invite_valid_days": settings.INVITE_VALID_DAYS,
        "password_reset_valid_minutes": settings.PASSWORD_RESET_VALID_MINUTES,
        "login_code": {"digits": 6, "valid_minutes": OneTimeCode.VALID_MINUTES, "roles": [Role.PARENT]},
        "demo": None,
    }
    if getattr(settings, "DEMO_LOGINS_VISIBLE", False):
        from .demo import demo_logins

        # In a public demo the parent code is shown on screen instead of sent.
        data["demo"] = {**demo_logins(), "codes_on_screen": getattr(settings, "DEMO_MODE", False)}
    return data
