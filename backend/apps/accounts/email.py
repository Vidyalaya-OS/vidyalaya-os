"""Send email through Brevo's HTTPS API (https://www.brevo.com).

Hosts such as Render's free plan block outgoing SMTP, so invites and password
reset links go out over HTTPS instead. Set BREVO_API_KEY and a DEFAULT_FROM_EMAIL
whose address is a verified sender in Brevo.
"""

import json
import logging
import urllib.request
from email.utils import parseaddr

from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend

logger = logging.getLogger("apps.notify")

API_URL = "https://api.brevo.com/v3/smtp/email"


def _contact(value):
    name, address = parseaddr(value)
    return {"email": address, **({"name": name} if name else {})}


class BrevoBackend(BaseEmailBackend):
    def send_messages(self, email_messages):
        sent = 0
        for message in email_messages:
            payload = {
                "sender": _contact(message.from_email or settings.DEFAULT_FROM_EMAIL),
                "to": [_contact(address) for address in message.to],
                "subject": message.subject,
                "textContent": message.body,
            }
            request = urllib.request.Request(
                API_URL,
                data=json.dumps(payload).encode(),
                headers={"api-key": settings.BREVO_API_KEY, "content-type": "application/json",
                         "accept": "application/json"},
                method="POST",
            )
            try:
                with urllib.request.urlopen(request, timeout=20):
                    sent += 1
            except Exception:
                logger.exception("Email to %s failed", ", ".join(message.to))
                if not self.fail_silently:
                    raise
        return sent
