from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts import audit
from apps.accounts.permissions import IsPlatformOwner, SchoolPermission

from . import selectors, services
from .models import School
from .serializers import PlatformSchoolSerializer, SchoolCreateSerializer, SchoolSerializer


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
            ctx["usage"] = selectors.usage_by_school(self.request.user)
        return ctx

    def get_queryset(self):
        params = self.request.query_params
        return selectors.platform_schools(status=params.get("status"), search=params.get("search"))

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
        school = services.set_status(self.get_object(), new_status, actor=request.user)
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
        sent = services.resend_admin_invite(self.get_object())
        return Response({"sent": sent, "detail": None if sent else "The admin has already set a password."})


class CurrentSchoolViewSet(viewsets.ViewSet):
    """Any member: the school they are in."""

    permission_classes = [SchoolPermission]

    def list(self, request):
        return Response(SchoolSerializer(request.school).data)
