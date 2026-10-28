"""Payment gateways for online fee payments: Razorpay, Juspay and, in
development, a built-in simulator.

Each gateway does three things: start an order for an OnlinePayment, show or
point to its payment page, and tell us for certain whether the order was paid.
Nothing a browser sends back is trusted on its own: Razorpay's answer is
checked by its signature and Juspay's by asking Juspay for the order status.
"""

import base64
import hashlib
import hmac
import json
import urllib.error
import urllib.request

from django.conf import settings

from .models import OnlinePayment
from .money import to_major


class GatewayError(Exception):
    """The gateway refused a request or could not be reached."""


def _call(method, url, *, auth, body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": "Basic " + base64.b64encode(auth.encode()).decode(),
        "Content-Type": "application/json", "Accept": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=settings.PAYMENT_TIMEOUT) as res:
            return json.loads(res.read() or b"{}")
    except urllib.error.HTTPError as e:
        detail = e.read()[:300].decode(errors="replace")
        raise GatewayError(f"The payment gateway said no ({e.code}): {detail}") from e
    except (urllib.error.URLError, TimeoutError) as e:
        raise GatewayError("The payment gateway could not be reached. Try again in a minute.") from e


def short_order_id(op):
    """An order id both gateways accept: letters and digits, under 21 characters."""
    return "VS" + op.pk.hex[:18].upper()


class Razorpay:
    key = OnlinePayment.Provider.RAZORPAY
    label = "Razorpay"

    @staticmethod
    def enabled():
        return bool(settings.RAZORPAY_KEY_ID and settings.RAZORPAY_KEY_SECRET)

    @staticmethod
    def test_mode():
        return settings.RAZORPAY_KEY_ID.startswith("rzp_test_")

    @staticmethod
    def start(op, school, urls):
        order = _call("POST", "https://api.razorpay.com/v1/orders",
                      auth=f"{settings.RAZORPAY_KEY_ID}:{settings.RAZORPAY_KEY_SECRET}",
                      body={"amount": op.amount, "currency": op.currency, "receipt": short_order_id(op),
                            "notes": {"school": school.subdomain, "online_payment": str(op.pk)}})
        op.order_id = order["id"]

    @staticmethod
    def signature_ok(order_id, payment_id, signature):
        expected = hmac.new(settings.RAZORPAY_KEY_SECRET.encode(), f"{order_id}|{payment_id}".encode(),
                            hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, signature or "")

    @staticmethod
    def webhook_ok(body, signature):
        if not settings.RAZORPAY_WEBHOOK_SECRET:
            return False
        expected = hmac.new(settings.RAZORPAY_WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, signature or "")


class Juspay:
    key = OnlinePayment.Provider.JUSPAY
    label = "Juspay"

    @staticmethod
    def enabled():
        return bool(settings.JUSPAY_MERCHANT_ID and settings.JUSPAY_API_KEY)

    @staticmethod
    def test_mode():
        return settings.JUSPAY_ENV != "production"

    @staticmethod
    def base():
        return "https://api.juspay.in" if settings.JUSPAY_ENV == "production" else "https://sandbox.juspay.in"

    @classmethod
    def _call(cls, method, path, body=None):
        return _call(method, cls.base() + path, auth=f"{settings.JUSPAY_API_KEY}:", body=body,
                     headers={"x-merchantid": settings.JUSPAY_MERCHANT_ID})

    @classmethod
    def start(cls, op, school, urls):
        user = op.created_by
        op.order_id = short_order_id(op)
        session = cls._call("POST", "/session", {
            "order_id": op.order_id,
            "amount": to_major(op.amount),
            "currency": op.currency,
            "customer_id": "U" + str(user.pk).replace("-", "")[:20],
            "customer_email": user.email or "",
            "customer_phone": (user.phone or "").lstrip("+")[-10:],
            "first_name": user.name[:50],
            "payment_page_client_id": settings.JUSPAY_PAYMENT_PAGE_CLIENT_ID,
            "action": "paymentPage",
            "return_url": urls["juspay_return"],
            "description": f"School fees, {school.name}"[:100],
            "udf1": school.subdomain,
        })
        link = (session.get("payment_links") or {}).get("web")
        if not link:
            raise GatewayError("Juspay did not return a payment page.")
        op.checkout_url = link

    @classmethod
    def order_status(cls, order_id):
        """("paid" | "failed" | "pending", gateway payment id, amount in minor units)."""
        order = cls._call("GET", f"/orders/{order_id}")
        status = order.get("status", "")
        amount = round(float(order.get("amount", 0)) * 100)
        txn = order.get("txn_id") or order.get("id") or ""
        if status == "CHARGED":
            return "paid", txn, amount
        if status in ("AUTHENTICATION_FAILED", "AUTHORIZATION_FAILED", "JUSPAY_DECLINED", "VOIDED"):
            return "failed", txn, amount
        return "pending", txn, amount

    @staticmethod
    def webhook_ok(authorization):
        user, password = settings.JUSPAY_WEBHOOK_USERNAME, settings.JUSPAY_WEBHOOK_PASSWORD
        if not (user and password):
            return False
        expected = "Basic " + base64.b64encode(f"{user}:{password}".encode()).decode()
        return hmac.compare_digest(expected, authorization or "")


class Simulator:
    key = OnlinePayment.Provider.SIMULATOR
    label = "Test gateway"

    @staticmethod
    def enabled():
        return settings.PAYMENT_SIMULATOR

    @staticmethod
    def test_mode():
        return True

    @staticmethod
    def start(op, school, urls):
        op.order_id = short_order_id(op)


GATEWAYS = {g.key: g for g in (Razorpay, Juspay, Simulator)}


def available():
    return [g for g in GATEWAYS.values() if g.enabled()]
