"""Fee calculations: dues from structures, payments and their allocation,
and what each student has paid and still owes."""

from datetime import date

from django.db import transaction
from django.db.models import BooleanField, Case, F, Q, Sum, Value, When
from django.db.models.functions import Coalesce
from rest_framework.exceptions import ValidationError

from apps.academics.models import AcademicYear
from apps.people.models import Enrollment
from apps.tenancy.context import school_today

from .models import Counter, FeeStructure, Payment, PaymentAllocation, StudentFeeDue
from .money import to_major


def dues_with_balance(qs=None, today=None):
    """Dues annotated with paid, remaining and is_overdue (all in minor units)."""
    today = today or school_today()
    qs = StudentFeeDue.objects.all() if qs is None else qs
    return qs.annotate(
        paid=Coalesce(Sum("allocations__amount"), Value(0)),
    ).annotate(
        remaining=F("amount") - F("discount") - F("paid"),
    ).annotate(
        is_overdue=Case(When(Q(remaining__gt=0) & Q(due_date__lt=today), then=Value(True)), default=Value(False),
                        output_field=BooleanField()),
    )


def totals(dues):
    """Sum of a list of annotated dues."""
    out = {"due": 0, "discount": 0, "paid": 0, "remaining": 0, "overdue": 0}
    next_due = None
    for d in dues:
        out["due"] += d.amount
        out["discount"] += d.discount
        out["paid"] += d.paid
        out["remaining"] += d.remaining
        if d.is_overdue:
            out["overdue"] += d.remaining
        elif d.remaining > 0 and (next_due is None or d.due_date < next_due.due_date):
            next_due = d
    result = {k: to_major(v) for k, v in out.items()}
    result["next_due"] = (
        {"due": str(next_due.pk), "name": next_due.name, "due_date": next_due.due_date,
         "remaining": to_major(next_due.remaining)} if next_due else None
    )
    return result


def current_year():
    year = AcademicYear.objects.filter(is_current=True).first()
    if year is None:
        raise ValidationError({"academic_year": "Set the current academic year first."})
    return year


@transaction.atomic
def generate_dues(year, school_class=None, student=None):
    """Bring every enrolled student's dues in line with the fee structures.

    Missing installments are created. Installments nobody has paid towards
    yet are updated to the structure's amount and date. Anything already
    paid is left as it is.
    """
    structures = FeeStructure.objects.filter(academic_year=year).select_related("fee_head")
    enrollments = Enrollment.objects.filter(academic_year=year, status=Enrollment.Status.ACTIVE).select_related(
        "section")
    if school_class is not None:
        structures = structures.filter(school_class=school_class)
        enrollments = enrollments.filter(section__school_class=school_class)
    if student is not None:
        enrollments = enrollments.filter(student=student)
    by_class = {}
    for s in structures:
        by_class.setdefault(s.school_class_id, []).append(s)
    existing = {
        (d.student_id, d.fee_structure_id, d.installment_no): d
        for d in dues_with_balance(StudentFeeDue.objects.filter(academic_year=year, fee_structure__in=structures))
    }
    created = updated = 0
    for e in enrollments:
        for s in by_class.get(e.section.school_class_id, []):
            for n, inst in enumerate(s.installments, start=1):
                name = f"{s.fee_head.name}, {inst['name']}" if len(s.installments) > 1 else s.fee_head.name
                due_date = date.fromisoformat(inst["due_date"])
                due = existing.get((e.student_id, s.pk, n))
                if due is None:
                    StudentFeeDue.objects.create(student_id=e.student_id, academic_year=year, fee_structure=s,
                                                 fee_head=s.fee_head, installment_no=n, name=name,
                                                 due_date=due_date, amount=inst["amount"])
                    created += 1
                elif due.paid == 0 and (due.amount, due.due_date, due.name) != (inst["amount"], due_date, name):
                    StudentFeeDue.objects.filter(pk=due.pk).update(
                        amount=inst["amount"], due_date=due_date, name=name,
                        discount=min(due.discount, inst["amount"]))
                    updated += 1
    return {"created": created, "updated": updated}


def next_receipt_no():
    return f"R-{Counter.next('receipt'):06d}"


@transaction.atomic
def record_payment(*, student, year, amount, paid_on, mode, reference="", notes="", received_by, allocate=None):
    """Save a payment and split it over the student's dues: the ones given,
    or else the oldest unpaid first. Paying more than is owed is refused."""
    if paid_on > school_today():
        raise ValidationError({"paid_on": "The payment date can't be in the future."})
    # Lock the student's dues so two payments can't both take the same balance.
    mine = StudentFeeDue.objects.filter(student=student, academic_year=year)
    list(mine.select_for_update().values_list("pk", flat=True))
    open_dues = list(dues_with_balance(mine).filter(remaining__gt=0).order_by("due_date", "installment_no"))
    owed = {d.pk: d.remaining for d in open_dues}
    plan = []
    if allocate:
        for item in allocate:
            due = item["due"]
            if due.pk not in owed:
                raise ValidationError({"allocate": f"{due.name} is not an open due of this student for the year."})
            if item["amount"] > owed[due.pk]:
                raise ValidationError({"allocate": f"Only {to_major(owed[due.pk])} is left on {due.name}."})
            owed[due.pk] -= item["amount"]
            plan.append((due.pk, item["amount"]))
        if sum(a for _, a in plan) != amount:
            raise ValidationError({"allocate": "The split must add up to the payment amount."})
    else:
        left = amount
        for d in open_dues:
            if left <= 0:
                break
            part = min(left, d.remaining)
            plan.append((d.pk, part))
            left -= part
        if left > 0:
            raise ValidationError({"amount": f"This is {to_major(left)} more than the student owes for the year."})
    payment = Payment.objects.create(
        student=student, academic_year=year, receipt_no=next_receipt_no(), amount=amount, paid_on=paid_on,
        mode=mode, reference=reference, notes=notes, received_by=received_by)
    PaymentAllocation.objects.bulk_create(
        [PaymentAllocation(payment=payment, due_id=due_id, amount=part, school_id=payment.school_id)
         for due_id, part in plan])
    return payment


@transaction.atomic
def reverse_payment(payment, reason, by):
    """Cancel a payment with a second, negative entry. The original stays."""
    if payment.reversed_payment_id is not None:
        raise ValidationError({"detail": "This entry is itself a reversal."})
    if Payment.objects.filter(reversed_payment=payment).exists():
        raise ValidationError({"detail": "This payment is already reversed."})
    reversal = Payment.objects.create(
        student_id=payment.student_id, academic_year_id=payment.academic_year_id, receipt_no=next_receipt_no(),
        amount=-payment.amount, paid_on=school_today(), mode=payment.mode, reference=payment.reference,
        notes=f"Reverses {payment.receipt_no}: {reason}", received_by=by, reversed_payment=payment)
    PaymentAllocation.objects.bulk_create(
        [PaymentAllocation(payment=reversal, due_id=a.due_id, amount=-a.amount, school_id=reversal.school_id)
         for a in payment.allocations.all()])
    return reversal
