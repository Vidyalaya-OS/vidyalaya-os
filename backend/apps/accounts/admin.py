from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import AuditLog, User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    """Platform staff only. School data (students, marks, fees) is not in the
    Django admin; it is behind row-level security and the API."""

    ordering = ["name"]
    list_display = ["name", "email", "phone", "status", "is_platform_owner"]
    list_filter = ["status", "is_platform_owner", "is_staff"]
    search_fields = ["name", "email", "phone"]
    fieldsets = [
        (None, {"fields": ["name", "email", "phone", "password"]}),
        ("Access", {"fields": ["status", "is_platform_owner", "is_staff", "is_superuser"]}),
        ("Dates", {"fields": ["last_login"]}),
    ]
    add_fieldsets = [(None, {"classes": ["wide"], "fields": ["name", "email", "phone", "password1", "password2"]})]
    readonly_fields = ["last_login"]
    filter_horizontal = []


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    """Read-only; the database refuses edits and deletes anyway."""

    list_display = ["created_at", "action", "entity", "entity_id", "actor"]
    list_filter = ["action"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
