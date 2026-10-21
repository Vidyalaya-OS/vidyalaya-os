from django.contrib.auth import authenticate
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from . import audit, notify
from .models import Invite, OneTimeCode, Role, SchoolMembership, User
from .permissions import roles_in_current_school
from .serializers import (
    AcceptInviteSerializer,
    ChangePasswordSerializer,
    LoginSerializer,
    OtpRequestSerializer,
    OtpVerifySerializer,
    UserSerializer,
    memberships_for,
    session_payload,
)


class LoginView(APIView):
    """Email or phone plus password. Returns tokens and the schools the user can open."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        data = LoginSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = authenticate(
            request, identifier=data.validated_data["identifier"], password=data.validated_data["password"]
        )
        if user is None:
            return Response({"detail": "Wrong email, phone or password."}, status=status.HTTP_401_UNAUTHORIZED)
        payload = session_payload(user)
        if not payload["memberships"] and not user.is_platform_owner:
            return Response({"detail": "Your account is not linked to any school."}, status=status.HTTP_403_FORBIDDEN)
        return Response(payload)


class LogoutView(APIView):
    def post(self, request):
        try:
            RefreshToken(request.data.get("refresh", "")).blacklist()
        except TokenError:
            pass
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    """The logged-in user, their schools, and their roles in the current school."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        current = None
        if request.school is not None:
            current = {
                "id": str(request.school.id),
                "name": request.school.name,
                "subdomain": request.school.subdomain,
                "status": request.school.status,
                "roles": sorted(roles_in_current_school(request)),
            }
        return Response(
            {
                "user": UserSerializer(request.user).data,
                "memberships": memberships_for(request.user),
                "current_school": current,
            }
        )


class ChangePasswordView(APIView):
    def post(self, request):
        data = ChangePasswordSerializer(data=request.data, context={"request": request})
        data.is_valid(raise_exception=True)
        request.user.set_password(data.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class InviteView(APIView):
    """Open an invite link (GET), then set a password to activate the login (POST)."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "invite"

    def get(self, request, token):
        invite = Invite.find_open(token)
        if invite is None:
            return Response({"detail": "This invite link is invalid or has expired."}, status=404)
        return Response(
            {
                "name": invite.user.name,
                "email": invite.user.email,
                "phone": invite.user.phone,
                "school": invite.school.name if invite.school else None,
            }
        )

    @transaction.atomic
    def post(self, request, token):
        invite = Invite.find_open(token)
        if invite is None:
            return Response({"detail": "This invite link is invalid or has expired."}, status=404)
        user = invite.user
        data = AcceptInviteSerializer(data=request.data, context={"user": user})
        data.is_valid(raise_exception=True)
        user.set_password(data.validated_data["password"])
        if user.status == User.Status.INVITED:
            user.status = User.Status.ACTIVE
        user.save(update_fields=["password", "status", "updated_at"])
        invite.used_at = timezone.now()
        invite.save(update_fields=["used_at"])
        audit.record(user, "user.accept_invite", "user", user.pk, school=invite.school)
        return Response(session_payload(user))


def _has_parent_role(user):
    from apps.tenancy import context

    context.set_current_user(user)
    return SchoolMembership.objects.filter(user=user, role=Role.PARENT, is_active=True).exists()


class OtpRequestView(APIView):
    """Optional login for parents: a 6-digit code by SMS or email."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        data = OtpRequestSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = User.objects.find_by_identifier(data.validated_data["identifier"])
        if user is not None and user.is_active and _has_parent_role(user):
            code = OneTimeCode.issue(user)
            transaction.on_commit(lambda: notify.send_login_code(user, code))
        # Same answer either way, so the form does not reveal who is registered.
        return Response({"detail": "If this account can use a code, one has been sent."})


class OtpVerifyView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        data = OtpVerifySerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = User.objects.find_by_identifier(data.validated_data["identifier"])
        if (
            user is None
            or not user.is_active
            or not _has_parent_role(user)
            or not OneTimeCode.verify(user, data.validated_data["code"])
        ):
            return Response({"detail": "That code is wrong or has expired."}, status=status.HTTP_401_UNAUTHORIZED)
        if user.status == User.Status.INVITED:
            user.status = User.Status.ACTIVE
            user.save(update_fields=["status", "updated_at"])
        return Response(session_payload(user))
