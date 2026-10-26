from django.db import transaction
from django.db.models import Count, ProtectedError, Q
from rest_framework import status, viewsets
from rest_framework.exceptions import APIException

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


class InUse(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "in_use"


class SchoolScopedViewSet(viewsets.ModelViewSet):
    """Any member reads, school admins write (see SchoolPermission)."""

    permission_classes = [SchoolPermission]
    in_use_message = "This is still in use, so it cannot be deleted."

    def perform_destroy(self, instance):
        try:
            with transaction.atomic():
                self.delete_instance(instance)
        except ProtectedError:
            raise InUse(self.in_use_message)

    def delete_instance(self, instance):
        instance.delete()


class AcademicYearViewSet(SchoolScopedViewSet):
    queryset = AcademicYear.objects.all()
    serializer_class = AcademicYearSerializer


class SchoolClassViewSet(SchoolScopedViewSet):
    queryset = SchoolClass.objects.all()
    serializer_class = SchoolClassSerializer
    in_use_message = ("This class has students, fees, exams or quizzes, so it cannot be deleted. "
                      "Move or remove those first.")

    def delete_instance(self, instance):
        # A class added by mistake usually has empty sections; take them with it.
        for section in instance.sections.all():
            section.delete()
        instance.delete()


class SubjectViewSet(SchoolScopedViewSet):
    queryset = Subject.objects.all()
    serializer_class = SubjectSerializer
    in_use_message = ("This subject has homework, exams, quizzes or timetable periods, so it cannot be deleted. "
                      "Remove those first.")

    def delete_instance(self, instance):
        # Taking it off the sections that study it is part of deleting it.
        instance.section_subjects.all().delete()
        instance.delete()


def limit_to_own_sections(request, qs, field="pk"):
    """Students and parents only see their own (or their children's) sections."""
    if has_role(request, Role.ADMIN, Role.TEACHER):
        return qs
    return qs.filter(**{f"{field}__in": own_section_ids(request)})


class SectionViewSet(SchoolScopedViewSet):
    serializer_class = SectionSerializer
    in_use_message = ("This section has students, exams or report cards, so it cannot be deleted. "
                      "Move or remove those first.")

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
    in_use_message = "This subject has work set in this section, so it cannot be removed."

    def get_queryset(self):
        qs = SectionSubject.objects.select_related("subject", "teacher__user")
        if self.request.query_params.get("section"):
            qs = qs.filter(section_id=self.request.query_params["section"])
        return limit_to_own_sections(self.request, qs, field="section_id")
