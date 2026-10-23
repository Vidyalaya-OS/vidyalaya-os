from contextlib import contextmanager

from apps.tenancy import context

from .models import AuditLog


def record(actor, action, entity="", entity_id="", before=None, after=None, school=None):
    if school is None:
        school = context.get_current_school()
    return AuditLog.objects.create(
        school=school,
        actor=actor if actor is not None and actor.is_authenticated else None,
        action=action,
        entity=entity,
        entity_id=str(entity_id or ""),
        before=before,
        after=after,
    )


@contextmanager
def platform_access(actor, reason, school=None):
    """Let platform staff read across schools, and log that they did."""
    record(actor, "platform.access", entity="school" if school else "", entity_id=getattr(school, "pk", ""),
           after={"reason": reason}, school=school)
    with context.bypass_rls():
        yield
