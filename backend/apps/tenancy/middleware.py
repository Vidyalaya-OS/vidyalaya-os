from django.conf import settings
from django.http import JsonResponse

from . import context
from .models import School

SCHOOL_HEADER = "HTTP_X_SCHOOL"


def school_slug_from_request(request):
    """The school a request is for: its subdomain, or the X-School header.

    greenvalley.<PLATFORM_DOMAIN> -> "greenvalley". The header lets the web
    app and API clients pick a school when they run on a single domain.
    """
    header = request.META.get(SCHOOL_HEADER, "").strip().lower()
    if header:
        return header
    host = request.get_host().split(":")[0].lower()
    suffix = "." + settings.PLATFORM_DOMAIN.lower()
    if host.endswith(suffix):
        sub = host[: -len(suffix)]
        if sub and "." not in sub:
            return sub
    return None


class TenantMiddleware:
    """Ties each request to at most one school before any data is touched."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.school = None
        try:
            context.clear()
            slug = school_slug_from_request(request)
            if slug:
                school = School.objects.filter(subdomain=slug).first()
                if school is None or school.status == School.Status.ARCHIVED:
                    return JsonResponse({"detail": "School not found."}, status=404)
                request.school = school
                context.set_current_school(school)
            return self.get_response(request)
        finally:
            context.clear()
