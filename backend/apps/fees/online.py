"""Parents paying fees online.

1. The parent picks dues; `start` creates an OnlinePayment and an order with
   the gateway, and hands back our checkout page's address.
2. The checkout page opens the gateway (Razorpay's checkout, Juspay's payment
   page, or the simulator's buttons).
3. The gateway sends the parent back to a callback here, and also calls a
   webhook. Either one, once checked, runs `complete`, which records an
   ordinary Payment with a receipt. Running it twice does nothing more.
4. The parent lands back in the app, which asks for the result by id.
"""

import json
import logging
import secrets
from urllib.parse import urlsplit

from django.conf import settings
from django.db import transaction
from django.http import HttpResponse, HttpResponseBadRequest, HttpResponseNotFound, HttpResponseRedirect
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.html import escape
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_http_methods, require_POST
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import audit
from apps.accounts.models import Role
from apps.accounts.permissions import SchoolPermission
from apps.people.models import Student
from apps.people.scoping import own_student_ids
from apps.tenancy.context import bypass_rls, school_context, school_today
from apps.tenancy.models import School

from . import gateways
from .models import OnlinePayment, Payment, StudentFeeDue
from .money import to_major
from .services import current_year, dues_with_balance, record_payment

logger = logging.getLogger(__name__)


# ------------------------------------------------------------------ services

def api_base(request):
    return settings.PUBLIC_API_URL or request.build_absolute_uri("/").rstrip("/")


def page_urls(base, school, op):
    path = f"{base}/api/fees/online"
    tail = f"{school.subdomain}/{op.checkout_token}"
    return {
        "checkout": f"{path}/checkout/{tail}",
        "razorpay_callback": f"{path}/razorpay/callback/{tail}",
        "juspay_return": f"{path}/juspay/return/{tail}",
        "simulator": f"{path}/simulator/{tail}",
    }


def return_url_allowed(url):
    return any(url.startswith(prefix) for prefix in settings.PAYMENT_RETURN_URLS)


class AppRedirect(HttpResponseRedirect):
    """A redirect that may also open the mobile app (vidyalaya://, exp://).
    Django allows only http(s) by default; the address was checked against
    PAYMENT_RETURN_URLS when the payment started."""

    @property
    def allowed_schemes(self):
        return ["http", "https", *(urlsplit(u).scheme for u in settings.PAYMENT_RETURN_URLS)]


def back_to_app(op):
    """The app page the parent started from, with the result attached."""
    sep = "&" if "?" in op.return_url else "?"
    return AppRedirect(f"{op.return_url}{sep}online_payment={op.pk}&status={op.status}")


@transaction.atomic
def start(*, request, student, due_ids, gateway, return_url):
    year = current_year()
    open_dues = list(dues_with_balance(StudentFeeDue.objects.filter(student=student, academic_year=year))
                     .filter(remaining__gt=0).order_by("due_date", "installment_no"))
    if due_ids:
        wanted = {str(d) for d in due_ids}
        chosen = [d for d in open_dues if str(d.pk) in wanted]
        if len(chosen) != len(wanted):
            raise ValidationError({"dues": "Some of these fees are already paid or are not this child's."})
    else:
        chosen = open_dues
    if not chosen:
        raise ValidationError({"dues": "Nothing is left to pay."})
    school = request.school
    op = OnlinePayment(
        student=student, academic_year=year, created_by=request.user, provider=gateway.key,
        amount=sum(d.remaining for d in chosen), currency=school.currency,
        dues=[{"due": str(d.pk), "amount": d.remaining} for d in chosen],
        checkout_token=secrets.token_urlsafe(32), return_url=return_url)
    urls = page_urls(api_base(request), school, op)
    try:
        gateway.start(op, school, urls)
    except gateways.GatewayError as e:
        logger.warning("Could not start a %s payment: %s", gateway.key, e)
        raise ValidationError({"detail": "Online payment is not available right now. Please try again shortly."})
    op.save()
    audit.record(request.user, "online_payment.start", "student", student.pk,
                 after={"gateway": gateway.key, "amount": to_major(op.amount), "order_id": op.order_id})
    return op, urls["checkout"]


def complete(op_id, gateway_payment_id, amount=None):
    """Record the receipt for a paid order. Safe to call more than once."""
    with transaction.atomic():
        op = OnlinePayment.objects.select_for_update().select_related("student", "academic_year", "created_by").get(
            pk=op_id)
        if op.status in (OnlinePayment.Status.PAID, OnlinePayment.Status.NEEDS_REVIEW):
            return op
        op.gateway_payment_id = gateway_payment_id[:100]
        op.paid_at = timezone.now()
        if amount is not None and amount != op.amount:
            op.status = OnlinePayment.Status.NEEDS_REVIEW
            op.error = f"The gateway reported {to_major(amount)} instead of {to_major(op.amount)}."
            op.save()
            return op
        payment = _record(op)
        if payment is None:
            op.status = OnlinePayment.Status.NEEDS_REVIEW
            op.error = "The fees changed before this payment arrived. The school office will adjust or refund it."
        else:
            op.status, op.payment, op.error = OnlinePayment.Status.PAID, payment, ""
        op.save()
        audit.record(op.created_by, "online_payment.paid", "student", op.student_id,
                     after={"receipt_no": payment.receipt_no if payment else None, "amount": to_major(op.amount),
                            "gateway": op.provider, "gateway_payment_id": op.gateway_payment_id},
                     school=op.school)
    return op


def _record(op):
    """The receipt: for the dues chosen, or the oldest open ones if those changed meanwhile."""
    dues = {str(d.pk): d for d in StudentFeeDue.objects.filter(pk__in=[x["due"] for x in op.dues])}
    plan = [{"due": dues[x["due"]], "amount": x["amount"]} for x in op.dues if x["due"] in dues]
    kwargs = dict(student=op.student, year=op.academic_year, amount=op.amount, paid_on=school_today(),
                  mode=Payment.Mode.ONLINE, reference=f"{op.get_provider_display()} {op.gateway_payment_id}"[:100],
                  notes=f"Paid online by {op.created_by.name}"[:300], received_by=op.created_by)
    for allocate in (plan or None, None):
        try:
            with transaction.atomic():
                return record_payment(**kwargs, allocate=allocate)
        except ValidationError:
            continue
    return None


def fail(op, reason):
    if op.status == OnlinePayment.Status.CREATED:
        op.status = OnlinePayment.Status.FAILED
        op.error = (reason or "The payment did not go through.")[:300]
        op.save(update_fields=["status", "error", "updated_at"])
    return op


# ----------------------------------------------------------------- API views

class StartSerializer(serializers.Serializer):
    student = serializers.UUIDField()
    dues = serializers.ListField(child=serializers.UUIDField(), required=False)
    gateway = serializers.ChoiceField(choices=OnlinePayment.Provider.choices, required=False)
    return_url = serializers.CharField(max_length=500, required=False)


def online_payment_data(op):
    return {
        "id": str(op.pk), "status": op.status, "status_label": op.get_status_display(), "gateway": op.provider,
        "amount": to_major(op.amount), "currency": op.currency, "error": op.error,
        "payment": str(op.payment_id) if op.payment_id else None,
        "receipt_no": op.payment.receipt_no if op.payment_id else None, "created_at": op.created_at,
    }


class OnlinePaymentsView(APIView):
    """POST: a parent starts paying a child's fees. Returns the checkout page to open."""

    permission_classes = [SchoolPermission]
    read_roles = write_roles = {Role.PARENT}

    def post(self, request):
        data = StartSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        v = data.validated_data
        if v["student"] not in own_student_ids(request):
            raise PermissionDenied("You can only pay for your own children.")
        enabled = gateways.available()
        if not enabled:
            raise ValidationError({"detail": "Online payment is not switched on for this school yet."})
        gateway = gateways.GATEWAYS.get(v.get("gateway")) if v.get("gateway") else enabled[0]
        if gateway not in enabled:
            raise ValidationError({"gateway": "This payment method is not available."})
        return_url = v.get("return_url") or f"{settings.WEB_APP_URL}/app/fees"
        if not return_url_allowed(return_url):
            raise ValidationError({"return_url": "This return address is not allowed."})
        student = get_object_or_404(Student, pk=v["student"])
        op, checkout_url = start(request=request, student=student, due_ids=v.get("dues"), gateway=gateway,
                                 return_url=return_url)
        return Response({**online_payment_data(op), "checkout_url": checkout_url}, status=201)


class OnlinePaymentView(APIView):
    """GET: how a payment went, for the page the parent lands back on."""

    permission_classes = [SchoolPermission]
    read_roles = {Role.PARENT}

    def get(self, request, pk):
        op = get_object_or_404(OnlinePayment.objects.select_related("payment"), pk=pk, created_by=request.user)
        if op.status == OnlinePayment.Status.CREATED and op.provider == OnlinePayment.Provider.JUSPAY:
            op = _check_juspay(op)
        return Response(online_payment_data(op))


# ------------------------------------------------- pages and gateway callbacks

def _school_or_404(slug):
    return School.objects.filter(subdomain=slug).exclude(status=School.Status.ARCHIVED).first()


def _page(title, body, script=""):
    return HttpResponse(f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>{escape(title)}</title>
<style>
body{{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#f4f6fb;color:#0f172a;
display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}}
main{{background:#fff;border-radius:20px;padding:28px;max-width:400px;width:100%;box-shadow:0 10px 30px #0f172a14;text-align:center}}
h1{{font-size:20px;margin:0 0 6px}} p{{color:#64748b;margin:0 0 18px;font-size:14px}}
.amt{{font-size:32px;font-weight:800;margin:6px 0 18px;color:#0f172a}}
button,a.btn{{display:block;width:100%;box-sizing:border-box;border:0;border-radius:12px;padding:14px;font-size:16px;
font-weight:600;cursor:pointer;background:#3355ee;color:#fff;text-decoration:none;margin-top:10px}}
.ghost{{background:#eef2f8!important;color:#0f172a!important}} .tag{{display:inline-block;font-size:12px;
font-weight:700;color:#92400e;background:#fef3c7;border-radius:99px;padding:3px 10px;margin-bottom:12px}}
@media (prefers-color-scheme:dark){{body{{background:#0b1222;color:#e2e8f0}} main{{background:#141c2e}}
.amt{{color:#fff}} .ghost{{background:#1c2533!important;color:#e2e8f0!important}}}}
</style></head><body><main>{body}</main>{script}</body></html>""")


def display_amount(minor, currency):
    """₹12,34,567.00 for rupees (Indian grouping), else "AED 1,234.00"."""
    whole, paise = divmod(abs(minor), 100)
    digits = str(whole)
    if currency == "INR" and len(digits) > 3:
        head, tail = digits[:-3], digits[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        digits = ",".join([head, *groups, tail]) if head else ",".join([*groups, tail])
    else:
        digits = f"{whole:,}"
    return f"{'₹' if currency == 'INR' else currency + ' '}{digits}.{paise:02d}"


def _js(value):
    return json.dumps(value).replace("<", "\\u003c")


@require_GET
def checkout_page(request, slug, token):
    school = _school_or_404(slug)
    if school is None:
        return HttpResponseNotFound("Not found")
    with school_context(school):
        op = OnlinePayment.objects.select_related("created_by", "student__user").filter(checkout_token=token).first()
        if op is None:
            return HttpResponseNotFound("This payment link is not valid.")
        if op.status != OnlinePayment.Status.CREATED:
            return back_to_app(op)
        if op.provider == OnlinePayment.Provider.JUSPAY:
            return HttpResponseRedirect(op.checkout_url)
        urls = page_urls(api_base(request), school, op)
        amount = display_amount(op.amount, op.currency)
        cancel = urls["simulator"]
        head = (f'<h1>{escape(school.name)}</h1><p>Fees for {escape(op.student.user.name)}</p>'
                f'<div class="amt">{escape(amount)}</div>')
        if op.provider == OnlinePayment.Provider.SIMULATOR:
            form = f'<form method="post" action="{escape(urls["simulator"])}">'
            return _page("Test payment", f"""<span class="tag">TEST GATEWAY, NO REAL MONEY</span>{head}
{form}<input type="hidden" name="outcome" value="paid"><button>Pay {escape(amount)}</button></form>
{form}<input type="hidden" name="outcome" value="failed"><button class="ghost">Make it fail</button></form>
<a class="btn ghost" href="{escape(cancel)}">Cancel</a>""")
        user = op.created_by
        options = {
            "key": settings.RAZORPAY_KEY_ID, "order_id": op.order_id, "amount": op.amount, "currency": op.currency,
            "name": school.name, "description": f"Fees for {op.student.user.name}",
            "prefill": {"name": user.name, "email": user.email or "", "contact": user.phone or ""},
            "notes": {"school": school.subdomain}, "callback_url": urls["razorpay_callback"], "redirect": True,
            "theme": {"color": "#3355ee"},
        }
        tag = '<span class="tag">RAZORPAY TEST MODE</span>' if gateways.Razorpay.test_mode() else ""
        cancel_url = f"{urls['razorpay_callback']}?cancelled=1"
        return _page("Pay fees", f"""{tag}{head}<button id="pay">Pay {escape(amount)}</button>
<a class="btn ghost" href="{escape(cancel_url)}">Cancel</a>""", f"""
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script>
var o = {_js(options)};
o.modal = {{ ondismiss: function () {{}} }};
var rzp = new Razorpay(o);
document.getElementById("pay").onclick = function () {{ rzp.open(); }};
rzp.open();
</script>""")


@csrf_exempt
@require_http_methods(["GET", "POST"])
def razorpay_callback(request, slug, token):
    """Razorpay posts here after the parent pays (or fails) in its checkout."""
    school = _school_or_404(slug)
    if school is None:
        return HttpResponseNotFound("Not found")
    with school_context(school):
        op = get_object_or_404(OnlinePayment, checkout_token=token, provider=OnlinePayment.Provider.RAZORPAY)
        if request.method == "GET":
            return back_to_app(fail(op, "You cancelled the payment.") if request.GET.get("cancelled") else op)
        payment_id = request.POST.get("razorpay_payment_id", "")
        signature = request.POST.get("razorpay_signature", "")
        if payment_id and signature:
            if gateways.Razorpay.signature_ok(op.order_id, payment_id, signature):
                op = complete(op.pk, payment_id)
            else:
                logger.warning("Razorpay callback with a bad signature for %s", op.order_id)
        else:
            op = fail(op, request.POST.get("error[description]", ""))
        return back_to_app(op)


@csrf_exempt
@require_POST
def razorpay_webhook(request):
    """Razorpay's server-to-server message, in case the parent closed the browser."""
    if not gateways.Razorpay.webhook_ok(request.body, request.headers.get("X-Razorpay-Signature")):
        return HttpResponseBadRequest("Bad signature")
    try:
        event = json.loads(request.body)
        entity = event["payload"]["payment"]["entity"]
    except (ValueError, KeyError, TypeError):
        return HttpResponse("ignored")
    if event.get("event") not in ("payment.captured", "order.paid"):
        return HttpResponse("ignored")
    op, school = _find_order(OnlinePayment.Provider.RAZORPAY, entity.get("order_id"))
    if op is None:
        return HttpResponse("unknown order")
    with school_context(school):
        complete(op, entity["id"], amount=entity.get("amount"))
    return HttpResponse("ok")


@csrf_exempt
@require_http_methods(["GET", "POST"])
def juspay_return(request, slug, token):
    """Juspay sends the parent here. Its query string is not trusted: the
    order's status is asked from Juspay directly."""
    school = _school_or_404(slug)
    if school is None:
        return HttpResponseNotFound("Not found")
    with school_context(school):
        op = get_object_or_404(OnlinePayment, checkout_token=token, provider=OnlinePayment.Provider.JUSPAY)
        return back_to_app(_check_juspay(op))


def _check_juspay(op):
    if op.status != OnlinePayment.Status.CREATED:
        return op
    try:
        status, txn, amount = gateways.Juspay.order_status(op.order_id)
    except gateways.GatewayError as e:
        logger.warning("Could not check Juspay order %s: %s", op.order_id, e)
        return op
    if status == "paid":
        return complete(op.pk, txn, amount=amount)
    if status == "failed":
        return fail(op, "The payment did not go through.")
    return op


@csrf_exempt
@require_POST
def juspay_webhook(request):
    if not gateways.Juspay.webhook_ok(request.headers.get("Authorization")):
        return HttpResponse("Unauthorized", status=401)
    try:
        order_id = json.loads(request.body)["content"]["order"]["order_id"]
    except (ValueError, KeyError, TypeError):
        return HttpResponse("ignored")
    op, school = _find_order(OnlinePayment.Provider.JUSPAY, order_id)
    if op is None:
        return HttpResponse("unknown order")
    with school_context(school):
        _check_juspay(OnlinePayment.objects.get(pk=op))
    return HttpResponse("ok")


def _find_order(provider, order_id):
    """Which school an order belongs to. Webhooks arrive without a school, so
    this one lookup by the gateway's order id looks across schools."""
    if not order_id:
        return None, None
    with bypass_rls():
        row = OnlinePayment.objects.filter(provider=provider, order_id=order_id).values_list("pk", "school_id").first()
    if row is None:
        return None, None
    return row[0], School.objects.get(pk=row[1])


@csrf_exempt
@require_http_methods(["GET", "POST"])
def simulator(request, slug, token):
    """The test gateway's buttons. Only exists in development."""
    if not gateways.Simulator.enabled():
        return HttpResponseNotFound("Not found")
    school = _school_or_404(slug)
    if school is None:
        return HttpResponseNotFound("Not found")
    with school_context(school):
        op = get_object_or_404(OnlinePayment, checkout_token=token, provider=OnlinePayment.Provider.SIMULATOR)
        outcome = request.POST.get("outcome") if request.method == "POST" else "cancelled"
        if outcome == "paid":
            op = complete(op.pk, f"SIM{secrets.token_hex(6).upper()}")
        elif outcome == "failed":
            op = fail(op, "The test gateway was told to fail.")
        elif outcome == "cancelled":
            op = fail(op, "You cancelled the payment.")
        return back_to_app(op)
