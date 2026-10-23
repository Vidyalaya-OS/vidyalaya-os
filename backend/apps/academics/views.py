from django.db.models import Count, Q
from rest_framework import viewsets

from apps.accounts.models import Role
from apps.accounts.permissions import SchoolPermission
from apps.people.models import Enrollment
from apps.people.scoping import has_role, own_section_ids

from .models import AcademicYear, SchoolClass, Section, SectionSubject, Subject
from .serializers import (
    AcademicYearSerializer,
    SchoolClassSerializer,
    SectionSerializer,
    SectionSubjectSerializer,
    SubjectSerializer,
)


class SchoolScopedViewSet(viewsets.ModelViewSet):
    """Any member reads, school admins write (see SchoolPermission)."""

    permission_classes = [SchoolPermission]


class AcademicYearViewSet(SchoolScopedViewSet):
    queryset = AcademicYear.objects.all()
    serializer_class = AcademicYearSerializer


class SchoolClassViewSet(SchoolScopedViewSet):
    queryset = SchoolClass.objects.all()
    serializer_class = SchoolClassSerializer


class SubjectViewSet(SchoolScopedViewSet):
    queryset = Subject.objects.all()
    serializer_class = SubjectSerializer


def limit_to_own_sections(request, qs, field="pk"):
    """Students and parents only see their own (or their children's) sections."""
    if has_role(request, Role.ADMIN, Role.TEACHER):
        return qs
    return qs.filter(**{f"{field}__in": own_section_ids(request)})


class SectionViewSet(SchoolScopedViewSet):
    serializer_class = SectionSerializer

    def get_queryset(self):
        qs = Section.objects.select_related("school_class", "academic_year", "class_teacher__user").annotate(
            student_count=Count("enrollments", filter=Q(enrollments__status=Enrollment.Status.ACTIVE))
        ).order_by("academic_year__start_date", "school_class__order", "school_class__name", "name")
        params = self.request.query_params
        if params.get("academic_year"):
            qs = qs.filter(academic_year_id=params["academic_year"])
        elif params.get("current", "true") != "false":
            qs = qs.filter(academic_year__is_current=True)
        if params.get("school_class"):
            qs = qs.filter(school_class_id=params["school_class"])
        return limit_to_own_sections(self.request, qs)


class SectionSubjectViewSet(SchoolScopedViewSet):
    serializer_class = SectionSubjectSerializer

    def get_queryset(self):
        qs = SectionSubject.objects.select_related("subject", "teacher__user")
        if self.request.query_params.get("section"):
            qs = qs.filter(section_id=self.request.query_params["section"])
        return limit_to_own_sections(self.request, qs, field="section_id")
