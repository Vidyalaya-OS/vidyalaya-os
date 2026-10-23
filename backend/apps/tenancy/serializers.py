from rest_framework import serializers

from . import services
from .models import RESERVED_SUBDOMAINS, School
from .selectors import EMPTY_USAGE


class SchoolSerializer(serializers.ModelSerializer):
    class Meta:
        model = School
        fields = [
            "id", "name", "subdomain", "board", "address", "logo", "timezone",
            "currency", "plan", "status", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "status", "created_at", "updated_at"]

    def to_internal_value(self, data):
        if isinstance(data.get("subdomain"), str):
            data = data.copy()
            data["subdomain"] = data["subdomain"].strip().lower()
        return super().to_internal_value(data)

    def validate_subdomain(self, value):
        if value in RESERVED_SUBDOMAINS:
            raise serializers.ValidationError("This address is reserved. Choose another.")
        return value


class PlatformSchoolSerializer(SchoolSerializer):
    """What the platform owner sees: school details plus usage counts, never student records."""

    usage = serializers.SerializerMethodField()

    class Meta(SchoolSerializer.Meta):
        fields = SchoolSerializer.Meta.fields + ["usage"]

    def get_usage(self, school):
        return self.context.get("usage", {}).get(school.id, EMPTY_USAGE)


class SchoolCreateSerializer(SchoolSerializer):
    """Onboard a school and invite its first admin in one step."""

    admin_name = serializers.CharField(write_only=True, max_length=200)
    admin_email = serializers.EmailField(write_only=True)
    admin_phone = serializers.CharField(write_only=True, required=False, allow_blank=True)
    academic_year_name = serializers.CharField(write_only=True, required=False, max_length=20)
    academic_year_start = serializers.DateField(write_only=True, required=False)
    academic_year_end = serializers.DateField(write_only=True, required=False)

    class Meta(SchoolSerializer.Meta):
        fields = SchoolSerializer.Meta.fields + [
            "admin_name", "admin_email", "admin_phone",
            "academic_year_name", "academic_year_start", "academic_year_end",
        ]

    def validate(self, attrs):
        year = [attrs.get(k) for k in ("academic_year_name", "academic_year_start", "academic_year_end")]
        if any(year) and not all(year):
            raise serializers.ValidationError("Give the academic year's name, start date and end date together.")
        if all(year) and attrs["academic_year_end"] <= attrs["academic_year_start"]:
            raise serializers.ValidationError({"academic_year_end": "The year must end after it starts."})
        return attrs

    def create(self, validated):
        admin = {k: validated.pop(f"admin_{k}", None) for k in ("name", "email", "phone")}
        year = {k: validated.pop(f"academic_year_{k}", None) for k in ("name", "start", "end")}
        return services.onboard_school(
            actor=self.context["request"].user,
            school=validated,
            admin=admin,
            academic_year=year if year["name"] else None,
        )
