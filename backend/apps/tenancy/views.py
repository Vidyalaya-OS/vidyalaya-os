from django.db.models import Count, Q
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts import audit, services
from apps.accounts.models import Role, SchoolMembership
from apps.accounts.permissions import IsPlatformOwner, SchoolPermission

from .models import School
from .serializers import PlatformSchoolSerializer, SchoolCreateSerializer, SchoolSerializer, first_admin


def usage_by_school(actor):
    """Head counts per school. Reading across schools is logged."""
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
    for counts in usage.values():
        for key in ("students", "teachers", "admins"):
            counts.setdefault(key, 0)
    return usage


class PlatformSchoolViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Platform owner: onboard, edit, suspend, reactivate and archive schools.

    Schools are never deleted; archiving hides a school from everyone.
    """

    permission_classes = [IsPlatformOwner]
    queryset = School.objects.all()

    def get_serializer_class(self):
        if self.action == "create":
            return SchoolCreateSerializer
        return PlatformSchoolSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        if self.action in ("list", "retrieve"):
            ctx["usage"] = usage_by_school(self.request.user)
        return ctx

    def get_queryset(self):
        qs = super().get_queryset()
        status_param = self.request.query_params.get("status")
        if status_param:
            qs = qs.filter(status=status_param)
        search = self.request.query_params.get("search")
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(subdomain__icontains=search))
        return qs

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        school = serializer.save()
        return Response(PlatformSchoolSerializer(school).data, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        before = SchoolSerializer(serializer.instance).data
        school = serializer.save()
        audit.record(self.request.user, "school.update", "school", school.pk,
                     before=dict(before), after=dict(SchoolSerializer(school).data), school=school)

    def _set_status(self, request, new_status):
        school = self.get_object()
        old = school.status
        school.status = new_status
        school.save(update_fields=["status", "updated_at"])
        audit.record(request.user, f"school.{new_status}", "school", school.pk,
                     before={"status": old}, after={"status": new_status}, school=school)
        return Response(PlatformSchoolSerializer(school, context=self.get_serializer_context()).data)

    @action(detail=True, methods=["post"])
    def suspend(self, request, pk=None):
        """Read-only: members can still log in and look, but nothing can change."""
        return self._set_status(request, School.Status.SUSPENDED)

    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        return self._set_status(request, School.Status.ACTIVE)

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        return self._set_status(request, School.Status.ARCHIVED)

    @action(detail=True, methods=["post"], url_path="resend-admin-invite")
    def resend_admin_invite(self, request, pk=None):
        school = self.get_object()
        membership = first_admin(school)
        if membership is None:
            return Response({"detail": "This school has no admin."}, status=status.HTTP_400_BAD_REQUEST)
        from . import context

        with context.school_context(school):
            sent = services.send_invite(membership.user, school)
        return Response({"sent": sent, "detail": None if sent else "The admin has already set a password."})


class CurrentSchoolViewSet(viewsets.ViewSet):
    """Any member: the school they are in."""

    permission_classes = [SchoolPermission]

    def list(self, request):
        return Response(SchoolSerializer(request.school).data)
