from django.conf import settings
from django.db import models
from django.db.models import Q

from apps.tenancy.models import TenantModel

# Amounts are whole minor units (paise, cents), so totals never round.


class FeeHead(TenantModel):
    """A kind of fee: tuition, transport, exam, admission."""

    name = models.CharField(max_length=100)
    description = models.CharField(max_length=200, blank=True)
    is_refundable = models.BooleanField(default=False)

    class Meta:
        db_table = "fee_heads"
        ordering = ["name"]
        constraints = [models.UniqueConstraint(fields=["school", "name"], name="unique_fee_head_name")]

    def __str__(self):
        return self.name


class FeeStructure(TenantModel):
    """What one class pays for one fee head in a year, split into installments."""

    academic_year = models.ForeignKey("academics.AcademicYear", on_delete=models.PROTECT, related_name="+")
    school_class = models.ForeignKey("academics.SchoolClass", on_delete=models.PROTECT, related_name="+")
    fee_head = models.ForeignKey(FeeHead, on_delete=models.PROTECT, related_name="structures")
    amount = models.BigIntegerField()
    # [{"name": "Term 1", "due_date": "2026-04-10", "amount": 500000}, ...]; amounts add up to `amount`.
    installments = models.JSONField(default=list)

    class Meta:
        db_table = "fee_structures"
        ordering = ["school_class__order", "fee_head__name"]
        constraints = [
            models.UniqueConstraint(fields=["academic_year", "school_class", "fee_head"], name="unique_fee_structure"),
            models.CheckConstraint(condition=Q(amount__gt=0), name="fee_structure_amount_positive"),
        ]


class StudentFeeDue(TenantModel):
    """One amount a student owes: an installment of a structure, or a one-off charge.

    Paid = sum of payment allocations; remaining = amount - discount - paid.
    """

    student = models.ForeignKey("people.Student", on_delete=models.PROTECT, related_name="fee_dues")
    academic_year = models.ForeignKey("academics.AcademicYear", on_delete=models.PROTECT, related_name="+")
    fee_structure = models.ForeignKey(FeeStructure, on_delete=models.PROTECT, null=True, blank=True,
                                      related_name="dues")
    fee_head = models.ForeignKey(FeeHead, on_delete=models.PROTECT, related_name="dues")
    installment_no = models.PositiveSmallIntegerField(default=1)
    name = models.CharField(max_length=100, help_text="For example Tuition, Term 1.")
    due_date = models.DateField()
    amount = models.BigIntegerField()
    discount = models.BigIntegerField(default=0)
    discount_reason = models.CharField(max_length=200, blank=True)

    class Meta:
        db_table = "student_fee_dues"
        ordering = ["due_date", "fee_head__name", "installment_no"]
        constraints = [
            models.UniqueConstraint(fields=["student", "fee_structure", "installment_no"],
                                    condition=Q(fee_structure__isnull=False), name="unique_due_installment"),
            models.CheckConstraint(condition=Q(amount__gt=0), name="due_amount_positive"),
            models.CheckConstraint(condition=Q(discount__gte=0) & Q(discount__lte=models.F("amount")),
                                   name="due_discount_within_amount"),
        ]
        indexes = [models.Index(fields=["school", "academic_year", "due_date"])]

    def __str__(self):
        return f"{self.student} {self.name}"


class Payment(TenantModel):
    """Money received, with a numbered receipt. Never edited or deleted: a
    mistake is reversed by a second row with the negative amount."""

    append_only = True

    class Mode(models.TextChoices):
        CASH = "cash", "Cash"
        CHEQUE = "cheque", "Cheque"
        BANK_TRANSFER = "bank_transfer", "Bank transfer"
        ONLINE = "online", "Online"
        OTHER = "other", "Other"

    student = models.ForeignKey("people.Student", on_delete=models.PROTECT, related_name="payments")
    academic_year = models.ForeignKey("academics.AcademicYear", on_delete=models.PROTECT, related_name="+")
    receipt_no = models.CharField(max_length=30)
    amount = models.BigIntegerField()
    paid_on = models.DateField()
    mode = models.CharField(max_length=20, choices=Mode.choices)
    reference = models.CharField(max_length=100, blank=True, help_text="Cheque or transaction number.")
    notes = models.CharField(max_length=300, blank=True)
    received_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    reversed_payment = models.OneToOneField("self", on_delete=models.PROTECT, null=True, blank=True,
                                            related_name="reversal")

    class Meta:
        db_table = "payments"
        ordering = ["-paid_on", "-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["school", "receipt_no"], name="unique_receipt_no"),
            models.CheckConstraint(
                condition=(Q(reversed_payment__isnull=True) & Q(amount__gt=0))
                | (Q(reversed_payment__isnull=False) & Q(amount__lt=0)),
                name="payment_sign_matches_kind"),
        ]
        indexes = [models.Index(fields=["school", "paid_on"])]

    def __str__(self):
        return self.receipt_no


class PaymentAllocation(TenantModel):
    """How much of a payment went to which due."""

    append_only = True

    payment = models.ForeignKey(Payment, on_delete=models.PROTECT, related_name="allocations")
    due = models.ForeignKey(StudentFeeDue, on_delete=models.PROTECT, related_name="allocations")
    amount = models.BigIntegerField()

    class Meta:
        db_table = "payment_allocations"


class Counter(TenantModel):
    """Per-school running numbers, such as the next receipt number."""

    name = models.CharField(max_length=50)
    value = models.PositiveBigIntegerField(default=0)

    class Meta:
        db_table = "counters"
        constraints = [models.UniqueConstraint(fields=["school", "name"], name="unique_counter_name")]

    @classmethod
    def next(cls, name):
        counter, _ = cls.objects.select_for_update().get_or_create(name=name)
        counter.value += 1
        counter.save(update_fields=["value", "updated_at"])
        return counter.value
