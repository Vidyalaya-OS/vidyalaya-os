from django.contrib.auth import password_validation
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken

from apps.tenancy import context
from apps.tenancy.models import School

from .models import SchoolMembership, User


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "name", "email", "phone", "status", "is_platform_owner"]
        read_only_fields = fields


def memberships_for(user):
    """Every school the user can open, with their roles there."""
    context.set_current_user(user)
    rows = (
        SchoolMembership.objects.filter(user=user, is_active=True)
        .exclude(school__status=School.Status.ARCHIVED)
        .select_related("school")
        .order_by("school__name")
    )
    schools = {}
    for m in rows:
        entry = schools.setdefault(
            m.school_id,
            {
                "school": {
                    "id": str(m.school.id),
                    "name": m.school.name,
                    "subdomain": m.school.subdomain,
                    "status": m.school.status,
                },
                "roles": [],
            },
        )
        entry["roles"].append(m.role)
    return list(schools.values())


def session_payload(user):
    refresh = RefreshToken.for_user(user)
    return {
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        "user": UserSerializer(user).data,
        "memberships": memberships_for(user),
    }


class LoginSerializer(serializers.Serializer):
    identifier = serializers.CharField(help_text="Email or phone number.")
    password = serializers.CharField(trim_whitespace=False)


class OtpRequestSerializer(serializers.Serializer):
    identifier = serializers.CharField()


class OtpVerifySerializer(serializers.Serializer):
    identifier = serializers.CharField()
    code = serializers.CharField(max_length=6)


class AcceptInviteSerializer(serializers.Serializer):
    password = serializers.CharField(trim_whitespace=False, write_only=True)

    def validate_password(self, value):
        password_validation.validate_password(value, self.context.get("user"))
        return value


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(trim_whitespace=False)
    new_password = serializers.CharField(trim_whitespace=False)

    def validate(self, attrs):
        user = self.context["request"].user
        if not user.check_password(attrs["current_password"]):
            raise serializers.ValidationError({"current_password": "That is not your current password."})
        password_validation.validate_password(attrs["new_password"], user)
        return attrs
