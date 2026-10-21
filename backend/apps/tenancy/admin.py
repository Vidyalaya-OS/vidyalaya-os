from django.contrib import admin

from .models import School


@admin.register(School)
class SchoolAdmin(admin.ModelAdmin):
    list_display = ("name", "subdomain", "plan", "status", "created_at")
    list_filter = ("status", "plan")
    search_fields = ("name", "subdomain")
