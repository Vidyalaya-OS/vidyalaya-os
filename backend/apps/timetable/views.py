from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.academics.views import SchoolScopedViewSet, limit_to_own_sections
from apps.accounts.models import Role
from apps.accounts.permissions import SchoolPermission
from apps.people.scoping import has_role, teacher_for
from apps.tenancy.context import school_today

from .models import Period, TimetableEntry
from .serializers import PeriodSerializer, TimetableEntrySerializer


class PeriodViewSet(SchoolScopedViewSet):
    """The periods of the school day. Admins write, every member reads."""

    queryset = Period.objects.all()
    serializer_class = PeriodSerializer
    pagination_class = None


class TimetableEntryViewSet(viewsets.ModelViewSet):
    """The weekly grid. Admins build it; teachers read it all, students and
    parents read their own (children's) sections.

    Filters: section, teacher, day (1-7 or "today"), mine=true (a teacher's
    own classes; a student's or parent's own sections).
    """

    serializer_class = TimetableEntrySerializer
    permission_classes = [SchoolPermission]
    pagination_class = None

    def get_queryset(self):
        qs = TimetableEntry.objects.select_related("section__school_class", "subject", "teacher__user", "period")
        qs = qs.filter(section__academic_year__is_current=True)
        params = self.request.query_params
        if params.get("section"):
            qs = qs.filter(section_id=params["section"])
        if params.get("teacher"):
            qs = qs.filter(teacher_id=params["teacher"])
        day = params.get("day")
        if day == "today":
            qs = qs.filter(day_of_week=school_today().isoweekday())
        elif day:
            qs = qs.filter(day_of_week=day)
        if params.get("mine") == "true" and has_role(self.request, Role.TEACHER):
            qs = qs.filter(teacher=teacher_for(self.request))
        return limit_to_own_sections(self.request, qs, field="section_id")

    @action(detail=False, methods=["get"])
    def clashes(self, request):
        """Every slot where one teacher is booked in two sections at once."""
        seen, out = {}, []
        for e in self.get_queryset().filter(teacher__isnull=False):
            seen.setdefault((e.teacher_id, e.day_of_week, e.period_id), []).append(e)
        for (_, day, _), entries in seen.items():
            if len(entries) > 1:
                out.append({
                    "teacher": entries[0].teacher.user.name, "day_of_week": day,
                    "day_name": entries[0].get_day_of_week_display(), "period": entries[0].period.name,
                    "sections": [str(e.section) for e in entries],
                })
        return Response(out)

