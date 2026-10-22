"""The current school (tenant) for this request or task.

The school is held in a context variable for application code, and also set
on the database connection (app.current_school) so PostgreSQL row-level
security policies can enforce it. Always change it through these helpers.
"""

import contextvars
from contextlib import contextmanager

from django.db import connection

_current_school = contextvars.ContextVar("current_school", default=None)
_bypass = contextvars.ContextVar("rls_bypass", default=False)


def _set_db(name, value):
    with connection.cursor() as cursor:
        cursor.execute("SELECT set_config(%s, %s, false)", [name, value])


def get_current_school():
    return _current_school.get()


def get_current_school_id():
    school = _current_school.get()
    return school.id if school is not None else None


def is_bypassing():
    return _bypass.get()


def set_current_school(school):
    _current_school.set(school)
    _set_db("app.current_school", str(school.id) if school is not None else "")


def set_current_user(user):
    """Lets a user see their own memberships in every school (used at login)."""
    _set_db("app.current_user", str(user.pk) if user is not None else "")


def clear():
    _current_school.set(None)
    _bypass.set(False)
    _set_db("app.current_school", "")
    _set_db("app.current_user", "")
    _set_db("app.bypass_rls", "off")


@contextmanager
def school_context(school):
    """Run a block as if inside the given school."""
    previous = _current_school.get()
    set_current_school(school)
    try:
        yield school
    finally:
        set_current_school(previous)


@contextmanager
def bypass_rls():
    """Run a block that may see every school's rows.

    Only for platform tooling, migrations and tests. Platform-facing callers
    should use apps.accounts.audit.platform_access, which also logs the access.
    """
    previous = _bypass.get()
    _bypass.set(True)
    _set_db("app.bypass_rls", "on")
    try:
        yield
    finally:
        _bypass.set(previous)
        _set_db("app.bypass_rls", "on" if previous else "off")


def school_today():
    """Today's date in the current school's time zone."""
    from zoneinfo import ZoneInfo

    from django.utils import timezone

    school = _current_school.get()
    try:
        tz = ZoneInfo(school.timezone) if school is not None and school.timezone else None
    except (KeyError, ValueError):
        tz = None
    return timezone.localdate(timezone=tz) if tz else timezone.localdate()
