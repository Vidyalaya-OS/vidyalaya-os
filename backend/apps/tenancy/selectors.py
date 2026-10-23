"""Read-only queries for the platform owner's screens."""

from django.db.models import Count, Q, Sum

from apps.accounts import audit
from apps.accounts.models import Role, SchoolMembership

from .models import School

EMPTY_USAGE = {"students": 0, "teachers": 0, "admins": 0, "fees_collected": "0.00"}


def platform_schools(*, status=None, search=None):
    """Every school, optionally narrowed by status or a name/address search."""
    qs = School.objects.all()
    if status:
        qs = qs.filter(status=status)
    if search:
        qs = qs.filter(Q(name__icontains=search) | Q(subdomain__icontains=search))
    return qs


def usage_by_school(actor):
    """Head counts and this year's fee collection per school id. Reading
    across schools is logged."""
    from apps.fees.models import Payment
    from apps.fees.money import to_major
    from apps.people.models import Student, Teacher

    usage = {}
    with audit.platform_access(actor, "usage counts"):
        for row in Student.objects.filter(status=Student.Status.ACTIVE).values("school").annotate(n=Count("id")):
            usage.setdefault(row["school"], {})["students"] = row["n"]
        for row in Teacher.objects.filter(status=Teacher.Status.ACTIVE).values("school").annotate(n=Count("id")):
            usage.setdefault(row["school"], {})["teachers"] = row["n"]
        admins = SchoolMembership.objects.filter(role=Role.ADMIN, is_active=True)
        for row in admins.values("school").annotate(n=Count("id")):
            usage.setdefault(row["school"], {})["admins"] = row["n"]
        payments = Payment.objects.filter(academic_year__is_current=True)
        for row in payments.values("school").annotate(n=Sum("amount")):
            usage.setdefault(row["school"], {})["fees_collected"] = to_major(row["n"])
    return {school: {**EMPTY_USAGE, **counts} for school, counts in usage.items()}
