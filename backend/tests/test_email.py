import json
from unittest import mock

from django.core import mail
from django.test import SimpleTestCase, override_settings


@override_settings(EMAIL_BACKEND="apps.accounts.email.BrevoBackend", BREVO_API_KEY="key-123",
                   DEFAULT_FROM_EMAIL="Vidyalaya OS <hello@school.test>")
class BrevoBackendTests(SimpleTestCase):
    def test_sends_over_https(self):
        with mock.patch("urllib.request.urlopen") as urlopen:
            sent = mail.send_mail("Hi", "Body", None, ["Asha <asha@school.test>"])
        self.assertEqual(sent, 1)
        request = urlopen.call_args.args[0]
        self.assertEqual(request.full_url, "https://api.brevo.com/v3/smtp/email")
        self.assertEqual(request.get_header("Api-key"), "key-123")
        body = json.loads(request.data)
        self.assertEqual(body["sender"], {"email": "hello@school.test", "name": "Vidyalaya OS"})
        self.assertEqual(body["to"], [{"email": "asha@school.test", "name": "Asha"}])
        self.assertEqual(body["textContent"], "Body")
