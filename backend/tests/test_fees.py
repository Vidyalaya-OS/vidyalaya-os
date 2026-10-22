"""Fees: structures, dues, payments, receipts, reversals and balances."""

from datetime import timedelta

from django.db import DatabaseError, transaction

from apps.academics.models import SchoolClass, Section
from apps.fees.models import FeeHead, Payment
from apps.tenancy.context import school_context, school_today

from .helpers import ApiTestCase, World


class FeeTests(ApiTestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a = World("alpha")
        with school_context(cls.a.school):
            cls.tuition = FeeHead.objects.create(name="Tuition")
            cls.transport = FeeHead.objects.create(name="Transport")

    def setUp(self):
        self.admin = self.client_for(self.a.admin, self.a.school)
        today = school_today()
        self.past, self.future = today - timedelta(days=10), today + timedelta(days=30)

    def structure(self):
        response = self.admin.post("/api/fee-structures/", {
            "academic_year": str(self.a.year.pk), "school_class": str(self.a.grade5.pk),
            "fee_head": str(self.tuition.pk), "amount": "12000.00",
            "installments": [{"name": "Term 1", "due_date": self.past.isoformat(), "amount": "6000"},
                             {"name": "Term 2", "due_date": self.future.isoformat(), "amount": "6000"}]})
        self.assertEqual(response.status_code, 201, response.data)
        result = self.admin.post("/api/fee-structures/generate-dues", {})
        self.assertEqual(result.data, {"created": 4, "updated": 0})
        return response.data

    def statement(self, client=None, student=None):
        student = student or self.a.student
        return (client or self.admin).get(f"/api/fees/students/{student.pk}")

    def pay(self, amount, **extra):
        return self.admin.post("/api/payments/", {"student": str(self.a.student.pk), "amount": amount,
                                                  "mode": "cash", **extra})

    def test_installments_must_add_up(self):
        response = self.admin.post("/api/fee-structures/", {
            "academic_year": str(self.a.year.pk), "school_class": str(self.a.grade5.pk),
            "fee_head": str(self.tuition.pk), "amount": "1000",
            "installments": [{"name": "Only", "due_date": self.past.isoformat(), "amount": "900"}]})
        self.assertEqual(response.status_code, 400)
        self.assertIn("installments", response.data)

    def test_generate_is_idempotent_and_follows_changes(self):
        s = self.structure()
        self.assertEqual(self.admin.post("/api/fee-structures/generate-dues", {}).data, {"created": 0, "updated": 0})
        self.pay("1000")
        self.admin.patch(f"/api/fee-structures/{s['id']}/", {
            "amount": "13000", "installments": [
                {"name": "Term 1", "due_date": self.past.isoformat(), "amount": "6000"},
                {"name": "Term 2", "due_date": self.future.isoformat(), "amount": "7000"}]})
        # Term 2 for both students changes; the part-paid Term 1 is left alone.
        self.assertEqual(self.admin.post("/api/fee-structures/generate-dues", {}).data, {"created": 0, "updated": 2})

    def test_paid_and_remaining(self):
        self.structure()
        totals = self.statement().data["totals"]
        self.assertEqual((totals["due"], totals["paid"], totals["remaining"], totals["overdue"]),
                         ("12000.00", "0.00", "12000.00", "6000.00"))
        response = self.pay("7000.50", reference="Counter 1")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["receipt_no"], "R-000001")
        # Oldest due first: Term 1 is cleared, the rest goes to Term 2.
        self.assertEqual([a["amount"] for a in response.data["allocations"]], ["6000.00", "1000.50"])
        data = self.statement().data
        self.assertEqual((data["totals"]["paid"], data["totals"]["remaining"], data["totals"]["overdue"]),
                         ("7000.50", "4999.50", "0.00"))
        self.assertEqual(data["totals"]["next_due"]["remaining"], "4999.50")
        self.assertEqual(len(data["payments"]), 1)

    def test_discount(self):
        self.structure()
        due = self.statement().data["dues"][0]
        response = self.admin.patch(f"/api/fee-dues/{due['id']}/", {"discount": "1000", "discount_reason": "Sibling"})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.statement().data["totals"]["remaining"], "11000.00")
        too_much = self.admin.patch(f"/api/fee-dues/{due['id']}/", {"discount": "7000"})
        self.assertEqual(too_much.status_code, 400)

    def test_overpayment_refused(self):
        self.structure()
        response = self.pay("12000.01")
        self.assertEqual(response.status_code, 400)
        self.assertIn("more than the student owes", str(response.data))

    def test_reversal_keeps_both_rows(self):
        self.structure()
        payment = self.pay("6000").data
        response = self.admin.post(f"/api/payments/{payment['id']}/reverse", {"reason": "Cheque bounced"})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["amount"], "-6000.00")
        self.assertEqual(response.data["receipt_no"], "R-000002")
        self.assertEqual(self.statement().data["totals"]["paid"], "0.00")
        again = self.admin.post(f"/api/payments/{payment['id']}/reverse", {"reason": "twice"})
        self.assertEqual(again.status_code, 400)
        self.assertEqual(self.admin.patch(f"/api/payments/{payment['id']}/", {"amount": "1"}).status_code, 405)
        self.assertEqual(self.admin.delete(f"/api/payments/{payment['id']}/").status_code, 405)

    def test_database_refuses_editing_payments(self):
        self.structure()
        payment_id = self.pay("100").data["id"]
        with school_context(self.a.school):
            with self.assertRaises(DatabaseError), transaction.atomic():
                Payment.objects.filter(pk=payment_id).update(amount=1)
            with self.assertRaises(DatabaseError), transaction.atomic():
                Payment.objects.filter(pk=payment_id).delete()

    def test_who_sees_fees(self):
        self.structure()
        payment = self.pay("500").data
        parent = self.client_for(self.a.parent_user, self.a.school)
        self.assertEqual(self.statement(parent).status_code, 200)
        self.assertEqual(self.statement(parent, self.a.other_student).status_code, 404)
        self.assertEqual(parent.get(f"/api/payments/{payment['id']}/receipt").status_code, 200)
        student = self.client_for(self.a.student_user, self.a.school)
        self.assertEqual(self.statement(student).status_code, 200)
        other = self.client_for(self.a.other_student_user, self.a.school)
        self.assertEqual(other.get(f"/api/payments/{payment['id']}/").status_code, 404)
        teacher = self.client_for(self.a.teacher_user, self.a.school)
        self.assertEqual(self.statement(teacher).status_code, 403)
        for client in (parent, student, teacher):
            self.assertEqual(client.post("/api/payments/", {}).status_code, 403)
            self.assertEqual(client.get("/api/fees/balances").status_code, 403)
            self.assertEqual(client.get("/api/fee-structures/").status_code, 403)

    def test_reports(self):
        self.structure()
        self.pay("6000")
        summary = self.admin.get("/api/fees/summary").data
        self.assertEqual(summary["collected_today"], "6000.00")
        self.assertEqual(summary["totals"]["remaining"], "18000.00")
        self.assertEqual(summary["by_class"][0]["class_name"], "Grade 5")
        defaulters = self.admin.get("/api/fees/defaulters").data["students"]
        self.assertEqual([(d["admission_no"], d["overdue"]) for d in defaulters], [("B1", "6000.00")])
        balances = self.admin.get(f"/api/fees/balances?section={self.a.section_a.pk}").data["students"]
        self.assertEqual([(b["admission_no"], b["paid"], b["remaining"]) for b in balances],
                         [("A1", "6000.00", "6000.00")])

    def test_dues_follow_the_class_not_the_section(self):
        self.structure()
        with school_context(self.a.school):
            grade6 = SchoolClass.objects.create(name="Grade 6", order=6)
            Section.objects.create(school_class=grade6, academic_year=self.a.year, name="A")
        # Moving within Grade 5 keeps the same dues.
        self.admin.post(f"/api/students/{self.a.student.pk}/move", {"section": str(self.a.section_b.pk)})
        self.assertEqual(self.admin.post("/api/fee-structures/generate-dues", {}).data, {"created": 0, "updated": 0})
        self.assertEqual(self.statement().data["totals"]["due"], "12000.00")
