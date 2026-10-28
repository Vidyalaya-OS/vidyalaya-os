import hashlib
import hmac
import json
from datetime import date
from unittest import mock

from django.test import Client, override_settings

from apps.fees import gateways
from apps.fees.models import FeeHead, OnlinePayment, Payment, StudentFeeDue
from apps.fees.services import record_payment
from apps.tenancy.context import school_context

from .helpers import ApiTestCase, World

WEB = "http://localhost:3000/app/fees"
RAZORPAY = dict(RAZORPAY_KEY_ID="rzp_test_abc", RAZORPAY_KEY_SECRET="secret", RAZORPAY_WEBHOOK_SECRET="hook",
                PAYMENT_SIMULATOR=False)
JUSPAY = dict(JUSPAY_MERCHANT_ID="school", JUSPAY_API_KEY="key", JUSPAY_PAYMENT_PAGE_CLIENT_ID="school",
              JUSPAY_WEBHOOK_USERNAME="u", JUSPAY_WEBHOOK_PASSWORD="p", PAYMENT_SIMULATOR=False)


@override_settings(PAYMENT_SIMULATOR=True, PAYMENT_RETURN_URLS=["http://localhost:3000", "vidyalaya://"],
                   RAZORPAY_KEY_ID="", JUSPAY_MERCHANT_ID="")
class OnlinePaymentTests(ApiTestCase):
    def setUp(self):
        self.w = World("paynow")
        with school_context(self.w.school):
            head = FeeHead.objects.create(name="Tuition")
            kw = dict(student=self.w.student, academic_year=self.w.year, fee_head=head)
            self.term1 = StudentFeeDue.objects.create(name="Term 1", due_date=date(2026, 4, 10), amount=500000, **kw)
            self.term2 = StudentFeeDue.objects.create(name="Term 2", due_date=date(2026, 10, 10), amount=300000, **kw)
        self.parent = self.client_for(self.w.parent_user, self.w.school)
        self.browser = Client()

    def start(self, **body):
        return self.parent.post("/api/fees/online/payments",
                                {"student": str(self.w.student.pk), "return_url": WEB, **body}, format="json")

    def op(self):
        with school_context(self.w.school):
            return OnlinePayment.objects.get()

    def payments(self):
        with school_context(self.w.school):
            return list(Payment.objects.all())

    def test_config_lists_the_gateways_that_are_on(self):
        self.assertEqual([g["key"] for g in self.client.get("/api/config").data["online_payments"]], ["simulator"])

    def test_a_parent_pays_with_the_test_gateway_and_gets_a_receipt(self):
        response = self.start(dues=[str(self.term1.pk)])
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["amount"], "5000.00")
        page = self.browser.get(response.data["checkout_url"])
        self.assertContains(page, "TEST GATEWAY")
        token = self.op().checkout_token
        done = self.browser.post(f"/api/fees/online/simulator/paynow/{token}", {"outcome": "paid"})
        self.assertEqual(done.status_code, 302)
        self.assertTrue(done["Location"].startswith(f"{WEB}?online_payment="))
        self.assertIn("status=paid", done["Location"])
        [payment] = self.payments()
        self.assertEqual((payment.amount, payment.mode, payment.received_by), (500000, "online", self.w.parent_user))
        status = self.parent.get(f"/api/fees/online/payments/{self.op().pk}").data
        self.assertEqual((status["status"], status["receipt_no"]), ("paid", payment.receipt_no))
        # A second confirmation records nothing more.
        self.browser.post(f"/api/fees/online/simulator/paynow/{token}", {"outcome": "paid"})
        self.assertEqual(len(self.payments()), 1)

    def test_the_mobile_app_gets_sent_back_to_itself(self):
        app = "vidyalaya://app/my/fees"
        self.start(return_url=app)
        done = self.browser.post(f"/api/fees/online/simulator/paynow/{self.op().checkout_token}", {"outcome": "paid"})
        self.assertEqual(done.status_code, 302)
        self.assertTrue(done["Location"].startswith(f"{app}?online_payment="))

    def test_without_dues_it_pays_everything_left(self):
        self.assertEqual(self.start().data["amount"], "8000.00")

    def test_a_failed_payment_records_nothing(self):
        self.start()
        token = self.op().checkout_token
        done = self.browser.post(f"/api/fees/online/simulator/paynow/{token}", {"outcome": "failed"})
        self.assertIn("status=failed", done["Location"])
        self.assertEqual(self.payments(), [])

    def test_a_parent_cannot_pay_for_someone_elses_child(self):
        response = self.parent.post("/api/fees/online/payments", {"student": str(self.w.other_student.pk)},
                                    format="json")
        self.assertEqual(response.status_code, 403)

    def test_only_parents_start_online_payments(self):
        admin = self.client_for(self.w.admin, self.w.school)
        self.assertEqual(admin.post("/api/fees/online/payments", {"student": str(self.w.student.pk)},
                                    format="json").status_code, 403)

    def test_return_address_must_be_the_app(self):
        self.assertEqual(self.start(return_url="https://evil.example/steal").status_code, 400)

    def test_paid_dues_cannot_be_chosen(self):
        with school_context(self.w.school):
            record_payment(student=self.w.student, year=self.w.year, amount=500000, paid_on=date(2026, 4, 1),
                           mode="cash", received_by=self.w.admin)
        self.assertEqual(self.start(dues=[str(self.term1.pk)]).status_code, 400)

    def test_when_the_office_was_paid_meanwhile_it_needs_review(self):
        self.start()
        with school_context(self.w.school):
            record_payment(student=self.w.student, year=self.w.year, amount=800000, paid_on=date(2026, 4, 1),
                           mode="cash", received_by=self.w.admin)
        self.browser.post(f"/api/fees/online/simulator/paynow/{self.op().checkout_token}", {"outcome": "paid"})
        self.assertEqual(self.op().status, "needs_review")
        self.assertEqual(len(self.payments()), 1)

    def test_a_token_only_works_in_its_own_school(self):
        World("elsewhere")
        self.start()
        page = self.browser.get(f"/api/fees/online/checkout/elsewhere/{self.op().checkout_token}")
        self.assertEqual(page.status_code, 404)

    @override_settings(PAYMENT_SIMULATOR=False)
    def test_off_when_no_gateway_is_set_up(self):
        self.assertEqual(self.start().status_code, 400)
        self.assertEqual(self.browser.post("/api/fees/online/simulator/paynow/x", {"outcome": "paid"}).status_code,
                         404)

    # --------------------------------------------------------------- Razorpay

    @override_settings(**RAZORPAY)
    def test_razorpay_signed_callback_records_the_payment(self):
        with mock.patch.object(gateways, "_call", return_value={"id": "order_123"}) as call:
            response = self.start()
        self.assertEqual(call.call_args.kwargs["body"]["amount"], 800000)
        page = self.browser.get(response.data["checkout_url"])
        self.assertContains(page, "checkout.razorpay.com")
        self.assertContains(page, "order_123")
        token = self.op().checkout_token
        url = f"/api/fees/online/razorpay/callback/paynow/{token}"
        self.browser.post(url, {"razorpay_payment_id": "pay_1", "razorpay_order_id": "order_123",
                                "razorpay_signature": "forged"})
        self.assertEqual(self.op().status, "created")
        good = hmac.new(b"secret", b"order_123|pay_1", hashlib.sha256).hexdigest()
        done = self.browser.post(url, {"razorpay_payment_id": "pay_1", "razorpay_order_id": "order_123",
                                       "razorpay_signature": good})
        self.assertIn("status=paid", done["Location"])
        self.assertEqual(self.payments()[0].reference, "Razorpay pay_1")

    @override_settings(**RAZORPAY)
    def test_razorpay_webhook_records_the_payment(self):
        with mock.patch.object(gateways, "_call", return_value={"id": "order_9"}):
            self.start()
        body = json.dumps({"event": "payment.captured", "payload": {"payment": {"entity": {
            "id": "pay_9", "order_id": "order_9", "amount": 800000}}}}).encode()
        bad = self.browser.post("/api/fees/online/razorpay/webhook", body, content_type="application/json",
                                headers={"X-Razorpay-Signature": "nope"})
        self.assertEqual(bad.status_code, 400)
        sig = hmac.new(b"hook", body, hashlib.sha256).hexdigest()
        ok = self.browser.post("/api/fees/online/razorpay/webhook", body, content_type="application/json",
                               headers={"X-Razorpay-Signature": sig})
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(self.op().status, "paid")

    # ----------------------------------------------------------------- Juspay

    @override_settings(**JUSPAY)
    def test_juspay_return_checks_the_status_with_juspay(self):
        session = {"payment_links": {"web": "https://sandbox.juspay.in/pay/abc"}}
        with mock.patch.object(gateways, "_call", return_value=session):
            response = self.start(gateway="juspay")
        page = self.browser.get(response.data["checkout_url"])
        self.assertEqual(page["Location"], "https://sandbox.juspay.in/pay/abc")
        token = self.op().checkout_token
        with mock.patch.object(gateways, "_call", return_value={"status": "PENDING_VBV", "amount": 8000}):
            self.browser.get(f"/api/fees/online/juspay/return/paynow/{token}?status=CHARGED")
        self.assertEqual(self.op().status, "created")
        with mock.patch.object(gateways, "_call", return_value={"status": "CHARGED", "amount": 8000, "txn_id": "t1"}):
            done = self.browser.get(f"/api/fees/online/juspay/return/paynow/{token}")
        self.assertIn("status=paid", done["Location"])

    @override_settings(**JUSPAY)
    def test_juspay_amount_mismatch_needs_review(self):
        with mock.patch.object(gateways, "_call", return_value={"payment_links": {"web": "https://x"}}):
            self.start(gateway="juspay")
        with mock.patch.object(gateways, "_call", return_value={"status": "CHARGED", "amount": 1}):
            self.browser.get(f"/api/fees/online/juspay/return/paynow/{self.op().checkout_token}")
        self.assertEqual(self.op().status, "needs_review")
        self.assertEqual(self.payments(), [])

    @override_settings(**JUSPAY)
    def test_juspay_webhook_needs_its_password(self):
        with mock.patch.object(gateways, "_call", return_value={"payment_links": {"web": "https://x"}}):
            self.start(gateway="juspay")
        body = json.dumps({"event_name": "ORDER_SUCCEEDED", "content": {"order": {"order_id": self.op().order_id}}})
        self.assertEqual(self.browser.post("/api/fees/online/juspay/webhook", body,
                                           content_type="application/json").status_code, 401)
        with mock.patch.object(gateways, "_call", return_value={"status": "CHARGED", "amount": 8000}):
            ok = self.browser.post("/api/fees/online/juspay/webhook", body, content_type="application/json",
                                   headers={"Authorization": "Basic dTpw"})
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(self.op().status, "paid")
