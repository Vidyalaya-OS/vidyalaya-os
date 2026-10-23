from django.conf import settings
from django.db import models

from apps.tenancy.models import TenantModel


class AttendanceRecord(TenantModel):
    """One student's attendance for one day. Period-wise attendance can come later."""

    class Status(models.TextChoices):
        PRESENT = "present", "Present"
        ABSENT = "absent", "Absent"
        LATE = "late", "Late"
        LEAVE = "leave", "On leave"

    enrollment = models.ForeignKey("people.Enrollment", on_delete=models.PROTECT, related_name="attendance")
    date = models.DateField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PRESENT)
    remark = models.CharField(max_length=200, blank=True)
    marked_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")

    class Meta:
        db_table = "attendance_records"
        ordering = ["date"]
        constraints = [models.UniqueConstraint(fields=["enrollment", "date"], name="unique_attendance_per_day")]
        indexes = [models.Index(fields=["school", "date"])]

    def __str__(self):
        return f"{self.enrollment} {self.date}: {self.status}"


# Present and late count as attended; absent and leave do not.
ATTENDED = (AttendanceRecord.Status.PRESENT, AttendanceRecord.Status.LATE)


class TeacherAttendance(TenantModel):
    """One teacher's attendance for one day. Only school admins mark it, and
    every working day should be marked (the admin's home screen nags until
    it is)."""

    teacher = models.ForeignKey("people.Teacher", on_delete=models.PROTECT, related_name="attendance")
    date = models.DateField()
    status = models.CharField(max_length=10, choices=AttendanceRecord.Status.choices,
                              default=AttendanceRecord.Status.PRESENT)
    remark = models.CharField(max_length=200, blank=True)
    marked_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")

    class Meta:
        db_table = "teacher_attendance"
        ordering = ["date"]
        constraints = [models.UniqueConstraint(fields=["teacher", "date"], name="unique_teacher_attendance_per_day")]
        indexes = [models.Index(fields=["school", "date"])]

    def __str__(self):
        return f"{self.teacher} {self.date}: {self.status}"


# Teachers marked away for the day cannot take a class's roll call.
AWAY = (AttendanceRecord.Status.ABSENT, AttendanceRecord.Status.LEAVE)
