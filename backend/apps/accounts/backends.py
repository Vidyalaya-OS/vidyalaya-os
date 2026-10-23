from django.contrib.auth.backends import ModelBackend

from .models import User


class EmailOrPhoneBackend(ModelBackend):
    """Log in with an email address or a phone number, plus password."""

    def authenticate(self, request, username=None, password=None, identifier=None, **kwargs):
        identifier = identifier or username or kwargs.get("email")
        user = User.objects.find_by_identifier(identifier)
        if user is None:
            # Run the hasher anyway so response time does not reveal unknown users.
            User().set_password(password)
            return None
        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None
