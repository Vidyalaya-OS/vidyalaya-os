"""Money is stored as whole minor units (paise, cents) and shown to API
clients as decimal strings with two places, such as "1500.00"."""

from decimal import ROUND_HALF_UP, Decimal

from rest_framework import serializers

CENT = Decimal("0.01")


def to_minor(value):
    return int((Decimal(value) * 100).quantize(Decimal(1), rounding=ROUND_HALF_UP))


def to_major(minor):
    return str((Decimal(minor or 0) / 100).quantize(CENT))


class MoneyField(serializers.DecimalField):
    default_error_messages = {"not_positive": "Enter an amount above zero.", "negative": "Enter zero or more."}

    def __init__(self, allow_zero=False, **kwargs):
        self.allow_zero = allow_zero
        kwargs.setdefault("max_digits", 14)
        kwargs.setdefault("decimal_places", 2)
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        value = to_minor(super().to_internal_value(data))
        if value < 0 or (value == 0 and not self.allow_zero):
            self.fail("negative" if self.allow_zero else "not_positive")
        return value

    def to_representation(self, value):
        return to_major(value)
