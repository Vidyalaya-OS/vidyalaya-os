from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .catalog import app_config


class AppConfigView(APIView):
    """Public settings the web app needs before anyone signs in: plans,
    boards, time zones, currencies, payment modes and, in development, the
    demo logins."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        return Response(app_config())
