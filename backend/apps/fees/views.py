from collections import defaultdict

from django.db import transaction
from django.db.models import Count, Prefetch, Q, Sum
from django.shortcuts import get_object_or_404
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academics.models import AcademicYear, SchoolClass
from apps.academics.views import SchoolScopedViewSet
from apps.accounts import audit
from apps.accounts.models import Role
from apps.accounts.permissions import IsSchoolAdmin, SchoolPermission
from apps.people.models import Enrollment, StudentGuardian
from apps.people.scoping import has_role, own_student_ids, visible_students
from apps.tenancy.context import school_today

from .models import FeeHead, FeeStructure, Payment, PaymentAllocation, StudentFeeDue
from .money import to_major
from .serializers import (
    DueSerializer,
    FeeHeadSerializer,
    FeeStructureSerializer,
    GenerateDuesSerializer,
    PaymentSerializer,
    ReverseSerializer,
)
from .services import current_year, dues_with_balance, generate_dues, record_payment, reverse_payment, totals


def year_from(request):
    """?academic_year=<id>, or the current year."""
    year_id = request.query_params.get("academic_year")
    if year_id:
        return get_object_or_404(AcademicYear, pk=year_id)
    return current_year()


class AdminOnly:
    permission_classes = [IsSchoolAdmin]


class FeeHeadViewSet(AdminOnly, SchoolScopedViewSet):
    queryset = FeeHead.objects.all()
    serializer_class = FeeHeadSerializer
    pagination_class = None


class FeeStructureViewSet(AdminOnly, SchoolScopedViewSet):
    """Fees per class per year. Run generate-dues after changes to bill students."""

    serializer_class = FeeStructureSerializer
    pagination_class = None

    def get_queryset(self):
        qs = FeeStructure.objects.select_related("school_class", "fee_head").annotate(
            students_billed=Count("dues__student", distinct=True))
        year = self.request.query_params.get("academic_year")
        qs = qs.filter(academic_year_id=year) if year else qs.filter(academic_year__is_current=True)
        if self.request.query_params.get("school_class"):
            qs = qs.filter(school_class_id=self.request.query_params["school_class"])
        return qs

    def perform_update(self, serializer):
        if serializer.instance.dues.exists() and any(
                k in serializer.validated_data and serializer.validated_data[k] != getattr(serializer.instance, k)
                for k in ("academic_year", "school_class", "fee_head")):
            raise ValidationError({"detail": "Students are billed for this fee. Only amounts and dates can change."})
        obj = serializer.save()
        audit.record(self.request.user, "fee_structure.update", "fee_structure", obj.pk,
                     after={"amount": to_major(obj.amount), "installments": obj.installments})

    @transaction.atomic
    def perform_destroy(self, instance):
        if PaymentAllocation.objects.filter(due__fee_structure=instance).exists():
            raise ValidationError({"detail": "Payments are recorded against this fee, so it can't be removed."})
        instance.dues.all().delete()
        audit.record(self.request.user, "fee_structure.delete", "fee_structure", instance.pk)
        instance.delete()

    @action(detail=False, methods=["post"], url_path="generate-dues")
    def generate(self, request):
        """Bill students from the structures (one class, one student, or everyone)."""
        data = GenerateDuesSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        year = data.validated_data.get("academic_year") or current_year()
        result = generate_dues(year, data.validated_data.get("school_class"), data.validated_data.get("student"))
        audit.record(request.user, "fees.generate_dues", "academic_year", year.pk, after=result)
        return Response(result)


class DueViewSet(AdminOnly, viewsets.ModelViewSet):
    """Dues of students. Admins give discounts or add one-off charges.

    Filters: student, academic_year, overdue=true.
    """

    serializer_class = DueSerializer
    pagination_class = None

    def get_queryset(self):
        qs = dues_with_balance(StudentFeeDue.objects.select_related("fee_head"))
        params = self.request.query_params
        if params.get("student"):
            qs = qs.filter(student_id=params["student"])
        qs = qs.filter(academic_year=year_from(self.request))
        if params.get("overdue") == "true":
            qs = qs.filter(is_overdue=True)
        return qs

    def perform_create(self, serializer):
        year = serializer.validated_data.get("academic_year") or current_year()
        due = serializer.save(academic_year=year)
        audit.record(self.request.user, "fee_due.create", "student", due.student_id,
                     after={"name": due.name, "amount": to_major(due.amount)})

    def perform_update(self, serializer):
        before = {"amount": to_major(serializer.instance.amount), "discount": to_major(serializer.instance.discount)}
        due = serializer.save()
        audit.record(self.request.user, "fee_due.update", "student", due.student_id, before=before,
                     after={"amount": to_major(due.amount), "discount": to_major(due.discount),
                            "reason": due.discount_reason})

    def perform_destroy(self, instance):
        if instance.allocations.exists():
            raise ValidationError({"detail": "Payments are recorded against this due. Give a discount instead."})
        audit.record(self.request.user, "fee_due.delete", "student", instance.student_id,
                     before={"name": instance.name, "amount": to_major(instance.amount)})
        instance.delete()


def payments_queryset():
    return Payment.objects.select_related("student__user", "received_by", "reversed_payment",
                                          "academic_year").prefetch_related(
        Prefetch("allocations", queryset=PaymentAllocation.objects.select_related("due__fee_head")), "reversal")


class PaymentViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
                     viewsets.GenericViewSet):
    """Payments are recorded by admins and never edited or deleted; a mistake
    is undone with `reverse`. Students and parents can read their own receipts.

    Filters: student, academic_year, from, to, mode.
    """

    serializer_class = PaymentSerializer
    permission_classes = [SchoolPermission]
    read_roles = {Role.ADMIN, Role.STUDENT, Role.PARENT}

    def get_queryset(self):
        qs = payments_queryset()
        request, params = self.request, self.request.query_params
        if not has_role(request, Role.ADMIN):
            qs = qs.filter(student_id__in=own_student_ids(request))
        if params.get("student"):
            qs = qs.filter(student_id=params["student"])
        if params.get("academic_year"):
            qs = qs.filter(academic_year_id=params["academic_year"])
        if params.get("from"):
            qs = qs.filter(paid_on__gte=params["from"])
        if params.get("to"):
            qs = qs.filter(paid_on__lte=params["to"])
        if params.get("mode"):
            qs = qs.filter(mode=params["mode"])
        return qs

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        v = serializer.validated_data
        payment = record_payment(
            student=v["student"], year=v.get("academic_year") or current_year(), amount=v["amount"],
            paid_on=v["paid_on"], mode=v["mode"], reference=v.get("reference", ""), notes=v.get("notes", ""),
            received_by=request.user, allocate=v.get("allocate"))
        audit.record(request.user, "payment.create", "payment", payment.pk,
                     after={"receipt_no": payment.receipt_no, "amount": to_major(payment.amount)})
        return Response(self.get_serializer(self.get_queryset().get(pk=payment.pk)).data, status=201)

    @action(detail=True, methods=["post"], permission_classes=[IsSchoolAdmin])
    def reverse(self, request, pk=None):
        payment = self.get_object()
        data = ReverseSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        reversal = reverse_payment(payment, data.validated_data["reason"], request.user)
        audit.record(request.user, "payment.reverse", "payment", payment.pk,
                     after={"reversal": reversal.receipt_no, "reason": data.validated_data["reason"]})
        return Response(self.get_serializer(self.get_queryset().get(pk=reversal.pk)).data, status=201)

    @action(detail=True, methods=["get"])
    def receipt(self, request, pk=None):
        """Everything a printed receipt needs."""
        payment = self.get_object()
        school = request.school
        enrollment = (Enrollment.objects.filter(student_id=payment.student_id, academic_year_id=payment.academic_year_id)
                      .select_related("section__school_class").order_by("-status", "-created_at").first())
        return Response({
            "school": {"name": school.name, "address": school.address, "currency": school.currency,
                       "logo": request.build_absolute_uri(school.logo.url) if school.logo else None},
            "section_name": str(enrollment.section) if enrollment else None,
            "academic_year": payment.academic_year.name,
            "payment": self.get_serializer(payment).data,
        })


class StudentFeesView(APIView):
    """A student's fee statement: each due with paid and remaining, totals,
    and receipts. Admins, the student and their parents can read it."""

    permission_classes = [SchoolPermission]
    read_roles = {Role.ADMIN, Role.STUDENT, Role.PARENT}

    def get(self, request, student_id):
        qs = visible_students(request)
        if not has_role(request, Role.ADMIN):
            qs = qs.filter(pk__in=own_student_ids(request))
        student = get_object_or_404(qs.select_related("user"), pk=student_id)
        year = year_from(request)
        dues = list(dues_with_balance(StudentFeeDue.objects.filter(student=student, academic_year=year)
                                      .select_related("fee_head")).order_by("due_date", "installment_no"))
        rows = payments_queryset().filter(student=student, academic_year=year)
        return Response({
            "student": str(student.pk), "name": student.user.name, "admission_no": student.admission_no,
            "academic_year": str(year.pk), "academic_year_name": year.name, "currency": request.school.currency,
            "totals": totals(dues),
            "dues": DueSerializer(dues, many=True).data,
            "payments": PaymentSerializer(rows, many=True).data,
        })


def student_balances(year, enrollments):
    """Per-student totals for the given enrollments, in minor units."""
    per = defaultdict(lambda: {"due": 0, "discount": 0, "paid": 0, "remaining": 0, "overdue": 0})
    student_ids = [e.student_id for e in enrollments]
    for d in dues_with_balance(StudentFeeDue.objects.filter(academic_year=year, student_id__in=student_ids)):
        row = per[d.student_id]
        row["due"] += d.amount
        row["discount"] += d.discount
        row["paid"] += d.paid
        row["remaining"] += d.remaining
        if d.is_overdue:
            row["overdue"] += d.remaining
    return per


def enrollments_for(request, year):
    qs = Enrollment.objects.filter(academic_year=year, status=Enrollment.Status.ACTIVE).select_related(
        "student__user", "section__school_class").order_by("section__school_class__order", "section__name",
                                                          "roll_no", "student__user__name")
    params = request.query_params
    if params.get("school_class"):
        qs = qs.filter(section__school_class_id=params["school_class"])
    if params.get("section"):
        qs = qs.filter(section_id=params["section"])
    if params.get("search"):
        term = params["search"]
        qs = qs.filter(Q(student__user__name__icontains=term) | Q(student__admission_no__icontains=term))
    return qs


def money_row(e, row):
    return {"student": str(e.student_id), "name": e.student.user.name, "admission_no": e.student.admission_no,
            "section_name": str(e.section), "roll_no": e.roll_no, **{k: to_major(v) for k, v in row.items()}}


class BalancesView(APIView):
    """Paid vs remaining for every student (filter by school_class, section, search)."""

    permission_classes = [IsSchoolAdmin]

    def get(self, request):
        year = year_from(request)
        enrollments = list(enrollments_for(request, year))
        per = student_balances(year, enrollments)
        rows = [money_row(e, per[e.student_id]) for e in enrollments]
        if request.query_params.get("status") == "owing":
            rows = [r for r in rows if r["remaining"] != "0.00"]
        return Response({"academic_year": year.name, "students": rows})


class DefaultersView(APIView):
    """Students with overdue fees, largest first, with parents' contacts."""

    permission_classes = [IsSchoolAdmin]

    def get(self, request):
        year = year_from(request)
        enrollments = list(enrollments_for(request, year))
        per = student_balances(year, enrollments)
        owing = [e for e in enrollments if per[e.student_id]["overdue"] > 0]
        parents = defaultdict(list)
        for link in StudentGuardian.objects.filter(student_id__in=[e.student_id for e in owing]).select_related(
                "guardian__user"):
            u = link.guardian.user
            parents[link.student_id].append({"name": u.name, "email": u.email, "phone": u.phone})
        owing.sort(key=lambda e: -per[e.student_id]["overdue"])
        return Response({"academic_year": year.name, "as_of": school_today(), "students": [
            {**money_row(e, per[e.student_id]), "parents": parents[e.student_id]} for e in owing
        ]})


class FeeSummaryView(APIView):
    """Collected today, this month and this year; outstanding by class."""

    permission_classes = [IsSchoolAdmin]

    def get(self, request):
        year = year_from(request)
        today = school_today()
        payments = Payment.objects.filter(academic_year=year)

        def collected(**filters):
            return to_major(payments.filter(**filters).aggregate(n=Sum("amount"))["n"] or 0)

        by_class = defaultdict(lambda: {"due": 0, "discount": 0, "paid": 0, "remaining": 0, "overdue": 0})
        class_of = dict(Enrollment.objects.filter(academic_year=year, status=Enrollment.Status.ACTIVE).values_list(
            "student_id", "section__school_class_id"))
        for d in dues_with_balance(StudentFeeDue.objects.filter(academic_year=year)):
            row = by_class[class_of.get(d.student_id)]
            row["due"] += d.amount
            row["discount"] += d.discount
            row["paid"] += d.paid
            row["remaining"] += d.remaining
            if d.is_overdue:
                row["overdue"] += d.remaining
        names = {c.pk: c for c in SchoolClass.objects.filter(pk__in=[k for k in by_class if k])}
        ordered = sorted(by_class, key=lambda k: (names[k].order, names[k].name) if k in names else (9999, ""))
        classes = [
            {"school_class": str(k) if k else None,
             "class_name": names[k].name if k in names else "Not in a class now",
             **{f: to_major(v) for f, v in by_class[k].items()}}
            for k in ordered
        ]
        grand = defaultdict(int)
        for row in by_class.values():
            for k, v in row.items():
                grand[k] += v
        return Response({
            "academic_year": year.name, "currency": request.school.currency, "date": today,
            "collected_today": collected(paid_on=today),
            "collected_this_month": collected(paid_on__gte=today.replace(day=1), paid_on__lte=today),
            "collected_this_year": collected(),
            "totals": {k: to_major(grand[k]) for k in ("due", "discount", "paid", "remaining", "overdue")},
            "by_class": classes,
            "by_mode": [{"mode": r["mode"], "amount": to_major(r["n"])}
                        for r in payments.values("mode").annotate(n=Sum("amount")).order_by("mode")],
        })

