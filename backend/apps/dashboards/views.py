from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Role
from apps.accounts.permissions import SchoolPermission
from apps.people.models import Student
from apps.people.scoping import guardian_for, student_for

from .services import child_summary, student_dashboard


class StudentDashboardView(APIView):
    """A student's home screen: today's classes, homework due, quizzes to
    take, latest test results and attendance."""

    permission_classes = [SchoolPermission]
    read_roles = {Role.STUDENT}

    def get(self, request):
        student = student_for(request)
        if student is None:
            raise PermissionDenied("There is no student record for you in this school.")
        return Response(student_dashboard(student))


class ParentDashboardView(APIView):
    """A parent's home screen: for each child, attendance, homework, test
    results and report cards, quiz scores and fees paid and remaining."""

    permission_classes = [SchoolPermission]
    read_roles = {Role.PARENT}

    def get(self, request):
        guardian = guardian_for(request)
        children = (Student.objects.filter(guardian_links__guardian=guardian).select_related("user")
                    .order_by("user__name") if guardian else Student.objects.none())
        return Response({"children": [child_summary(s, request.school.currency) for s in children]})
