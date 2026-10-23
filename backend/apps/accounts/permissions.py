"""Role checks. Every API view uses one of these; hiding a button in the web
app is never the only protection."""

from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import SAFE_METHODS, BasePermission

from .models import Role, SchoolMembership


def roles_in_current_school(request):
    """The set of roles the logged-in user holds in the request's school."""
    if not hasattr(request, "_school_roles"):
        roles = set()
        user = request.user
        if request.school is not None and user and user.is_authenticated:
            roles = set(
                SchoolMembership.objects.filter(
                    user=user, school=request.school, is_active=True
                ).values_list("role", flat=True)
            )
        request._school_roles = roles
    return request._school_roles


class IsPlatformOwner(BasePermission):
    message = "Only platform staff can do this."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_platform_owner)


class SchoolPermission(BasePermission):
    """Requires a school on the request and a membership in it.

    Views declare which roles may read (`read_roles`) and which may write
    (`write_roles`); the default is that any member may read and only school
    admins may write. Suspended schools are read-only for everyone.
    """

    message = "You do not have access to this school."

    def has_permission(self, request, view):
        if request.school is None:
            raise PermissionDenied("Choose a school: use the school's address or send the X-School header.")
        if not (request.user and request.user.is_authenticated):
            return False
        roles = roles_in_current_school(request)
        if not roles:
            return False
        if request.method in SAFE_METHODS:
            allowed = getattr(view, "read_roles", set(Role.values))
            return bool(roles & set(allowed))
        if not request.school.is_writable:
            raise PermissionDenied("This school is suspended and is read-only.")
        allowed = getattr(view, "write_roles", {Role.ADMIN})
        return bool(roles & set(allowed))


class IsSchoolAdmin(SchoolPermission):
    """School admins only, for reads and writes alike."""

    def has_permission(self, request, view):
        return super().has_permission(request, view) and Role.ADMIN in roles_in_current_school(request)
