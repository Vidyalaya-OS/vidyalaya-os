from django.db import models
from django.db.models import Q

from apps.tenancy.models import TenantModel


class Period(TenantModel):
    """One slot of the school day, such as Period 1, 08:00 to 08:40."""

    name = models.CharField(max_length=50)
    start_time = models.TimeField()
    end_time = models.TimeField()
    order = models.PositiveSmallIntegerField(default=0)
    is_break = models.BooleanField(default=False, help_text="Breaks show in the grid but take no subject.")

    class Meta:
        db_table = "periods"
        ordering = ["order", "start_time"]
        constraints = [
            models.UniqueConstraint(fields=["school", "name"], name="unique_period_name"),
            models.CheckConstraint(condition=Q(end_time__gt=models.F("start_time")), name="period_ends_after_start"),
        ]

    def __str__(self):
        return self.name


class TimetableEntry(TenantModel):
    """What a section has in one period of one weekday."""

    class Day(models.IntegerChoices):
        MONDAY = 1, "Monday"
        TUESDAY = 2, "Tuesday"
        WEDNESDAY = 3, "Wednesday"
        THURSDAY = 4, "Thursday"
        FRIDAY = 5, "Friday"
        SATURDAY = 6, "Saturday"
        SUNDAY = 7, "Sunday"

    section = models.ForeignKey("academics.Section", on_delete=models.CASCADE, related_name="timetable_entries")
    day_of_week = models.PositiveSmallIntegerField(choices=Day.choices)
    period = models.ForeignKey(Period, on_delete=models.PROTECT, related_name="entries")
    subject = models.ForeignKey("academics.Subject", on_delete=models.PROTECT, related_name="timetable_entries")
    teacher = models.ForeignKey(
        "people.Teacher", on_delete=models.SET_NULL, null=True, blank=True, related_name="timetable_entries"
    )
    room = models.CharField(max_length=50, blank=True)

    class Meta:
        db_table = "timetable_entries"
        ordering = ["day_of_week", "period__order", "period__start_time"]
        constraints = [
            models.UniqueConstraint(fields=["section", "day_of_week", "period"], name="unique_timetable_slot")
        ]

    def __str__(self):
        return f"{self.section} {self.get_day_of_week_display()} {self.period}: {self.subject}"
