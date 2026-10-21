from django.db.models import ProtectedError
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler


def api_exception_handler(exc, context):
    """DRF's handler, plus a clear answer when a row is still in use."""
    if isinstance(exc, ProtectedError):
        return Response(
            {"detail": "This is still in use (for example by sections or students), so it cannot be deleted."},
            status=status.HTTP_409_CONFLICT,
        )
    return exception_handler(exc, context)
