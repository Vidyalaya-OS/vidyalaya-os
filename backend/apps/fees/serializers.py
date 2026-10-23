from rest_framework import serializers

from apps.academics.models import AcademicYear, SchoolClass
from apps.people.models import Student
from apps.tenancy.context import school_today

from .models import FeeHead, FeeStructure, Payment, StudentFeeDue
from .money import MoneyField, to_major


class FeeHeadSerializer(serializers.ModelSerializer):
    class Meta:
        model = FeeHead
        fields = ["id", "name", "description", "is_refundable"]

    def validate_name(self, value):
        clash = FeeHead.objects.filter(name__iexact=value.strip())
        if self.instance:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError("A fee head with this name already exists.")
        return value.strip()


class InstallmentSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=60)
    due_date = serializers.DateField()
    amount = MoneyField(allow_zero=True)


class FeeStructureSerializer(serializers.ModelSerializer):
    academic_year = serializers.PrimaryKeyRelatedField(queryset=AcademicYear.objects.all())
    school_class = serializers.PrimaryKeyRelatedField(queryset=SchoolClass.objects.all())
    fee_head = serializers.PrimaryKeyRelatedField(queryset=FeeHead.objects.all())
    class_name = serializers.CharField(source="school_class.name", read_only=True)
    fee_head_name = serializers.CharField(source="fee_head.name", read_only=True)
    amount = MoneyField()
    installments = InstallmentSerializer(many=True, required=False)
    students_billed = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = FeeStructure
        fields = ["id", "academic_year", "school_class", "class_name", "fee_head", "fee_head_name", "amount",
                  "installments", "students_billed"]

    def validate(self, attrs):
        get = lambda k: attrs.get(k, getattr(self.instance, k, None))  # noqa: E731
        year, amount = get("academic_year"), get("amount")
        installments = attrs.get("installments")
        if installments is None and self.instance is None:
            installments = []
        if installments is not None:
            if not installments:
                # One installment, due on the first day of the year.
                installments = [{"name": "Full year", "due_date": year.start_date, "amount": amount}]
            if sum(i["amount"] for i in installments) != amount:
                raise serializers.ValidationError(
                    {"installments": f"Installments add up to {to_major(sum(i['amount'] for i in installments))}, "
                                     f"not {to_major(amount)}."})
            if any(i["amount"] <= 0 for i in installments):
                raise serializers.ValidationError({"installments": "Every installment needs an amount."})
            attrs["installments"] = [
                {"name": i["name"], "due_date": i["due_date"].isoformat(), "amount": i["amount"]} for i in installments
            ]
        elif "amount" in attrs and self.instance and attrs["amount"] != self.instance.amount:
            raise serializers.ValidationError({"installments": "Give the installments again when the amount changes."})
        clash = FeeStructure.objects.filter(academic_year=year, school_class=get("school_class"),
                                            fee_head=get("fee_head"))
        if self.instance:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError({"fee_head": "This class already has this fee for the year."})
        return attrs


class DueSerializer(serializers.ModelSerializer):
    """A due with what has been paid against it."""

    student = serializers.PrimaryKeyRelatedField(queryset=Student.objects.all())
    academic_year = serializers.PrimaryKeyRelatedField(queryset=AcademicYear.objects.all(), required=False)
    fee_head = serializers.PrimaryKeyRelatedField(queryset=FeeHead.objects.all())
    fee_head_name = serializers.CharField(source="fee_head.name", read_only=True)
    amount = MoneyField()
    discount = MoneyField(allow_zero=True, required=False)
    paid = MoneyField(read_only=True)
    remaining = MoneyField(read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    from_structure = serializers.SerializerMethodField()

    class Meta:
        model = StudentFeeDue
        fields = ["id", "student", "academic_year", "fee_head", "fee_head_name", "installment_no", "name",
                  "due_date", "amount", "discount", "discount_reason", "paid", "remaining", "is_overdue",
                  "from_structure"]
        read_only_fields = ["installment_no"]

    def get_from_structure(self, obj):
        return obj.fee_structure_id is not None

    def validate(self, attrs):
        if self.instance is not None:
            for key in ("student", "academic_year", "fee_head"):
                if key in attrs and attrs[key] != getattr(self.instance, key):
                    raise serializers.ValidationError({key: "This can't change once the due exists."})
            if self.instance.fee_structure_id and any(k in attrs for k in ("amount", "due_date", "name")):
                raise serializers.ValidationError(
                    "This due comes from the fee structure. Change the structure, or give a discount.")
        amount = attrs.get("amount", getattr(self.instance, "amount", 0))
        discount = attrs.get("discount", getattr(self.instance, "discount", 0))
        if discount > amount:
            raise serializers.ValidationError({"discount": "The discount can't be more than the amount."})
        paid = getattr(self.instance, "paid", 0) if self.instance else 0
        if amount - discount < paid:
            raise serializers.ValidationError({"discount": f"{to_major(paid)} is already paid against this due."})
        return attrs


class AllocationInput(serializers.Serializer):
    due = serializers.PrimaryKeyRelatedField(queryset=StudentFeeDue.objects.all())
    amount = MoneyField()


class PaymentSerializer(serializers.ModelSerializer):
    student = serializers.PrimaryKeyRelatedField(queryset=Student.objects.all())
    academic_year = serializers.PrimaryKeyRelatedField(queryset=AcademicYear.objects.all(), required=False)
    student_name = serializers.CharField(source="student.user.name", read_only=True)
    admission_no = serializers.CharField(source="student.admission_no", read_only=True)
    amount = MoneyField()
    paid_on = serializers.DateField(default=school_today)
    received_by_name = serializers.CharField(source="received_by.name", read_only=True)
    allocations = serializers.SerializerMethodField()
    allocate = AllocationInput(many=True, write_only=True, required=False)
    is_reversal = serializers.SerializerMethodField()
    is_reversed = serializers.SerializerMethodField()
    reverses_receipt_no = serializers.CharField(source="reversed_payment.receipt_no", read_only=True, default=None)

    class Meta:
        model = Payment
        fields = ["id", "receipt_no", "student", "student_name", "admission_no", "academic_year", "amount",
                  "paid_on", "mode", "reference", "notes", "received_by_name", "allocations", "allocate",
                  "is_reversal", "is_reversed", "reverses_receipt_no", "created_at"]
        read_only_fields = ["receipt_no", "created_at"]

    def get_allocations(self, obj):
        return [{"due": str(a.due_id), "name": a.due.name, "fee_head": a.due.fee_head.name,
                 "amount": to_major(a.amount)} for a in obj.allocations.all()]

    def get_is_reversal(self, obj):
        return obj.reversed_payment_id is not None

    def get_is_reversed(self, obj):
        return hasattr(obj, "reversal")


class ReverseSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=300)


class GenerateDuesSerializer(serializers.Serializer):
    academic_year = serializers.PrimaryKeyRelatedField(queryset=AcademicYear.objects.all(), required=False)
    school_class = serializers.PrimaryKeyRelatedField(queryset=SchoolClass.objects.all(), required=False)
    student = serializers.PrimaryKeyRelatedField(queryset=Student.objects.all(), required=False)
