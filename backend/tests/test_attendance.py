"""Daily attendance: marking, the parent's calendar, and reports."""

from datetime import timedelta

from apps.accounts.models import AuditLog
from apps.attendance.models import AttendanceRecord
from apps.people.models import Enrollment, Student
from apps.tenancy.context import school_context, school_today

from .helpers import ApiTestCase, World, make_user


class AttendanceTests(ApiTestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a = World("alpha")
        with school_context(cls.a.school):
            user = make_user("Second kid", "kid2@alpha.test")
            cls.kid2 = Student.objects.create(user=user, admission_no="A2")
            cls.kid2_enrollment = Enrollment.objects.create(student=cls.kid2, section=cls.a.section_a,
                                                            academic_year=cls.a.year, roll_no=2)

    def setUp(self):
        self.teacher = self.client_for(self.a.teacher_user, self.a.school)
        self.today = school_today()

    def mark(self, client=None, day=None, records=()):
        return (client or self.teacher).post("/api/attendance/sheet", {
            "section": str(self.a.section_a.pk), "date": (day or self.today).isoformat(), "records": list(records)})

    def test_everyone_present_by_default(self):
        sheet = self.teacher.get(f"/api/attendance/sheet?section={self.a.section_a.pk}")
        self.assertEqual(sheet.status_code, 200)
        self.assertFalse(sheet.data["marked"])
        self.assertEqual([s["status"] for s in sheet.data["students"]], ["present", "present"])
        response = self.mark(records=[{"enrollment": str(self.kid2_enrollment.pk), "status": "absent"}])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["marked"])
        self.assertEqual(response.data["summary"]["absent"], 1)
        self.assertEqual(response.data["summary"]["present"], 1)

    def test_teacher_only_marks_own_sections(self):
        response = self.teacher.post("/api/attendance/sheet", {"section": str(self.a.section_b.pk),
                                                               "date": self.today.isoformat()})
        self.assertEqual(response.status_code, 403)
        for user in (self.a.student_user, self.a.parent_user):
            self.assertEqual(self.mark(self.client_for(user, self.a.school)).status_code, 403)

    def test_no_future_dates_and_students_must_be_in_the_section(self):
        self.assertEqual(self.mark(day=self.today + timedelta(days=1)).status_code, 400)
        with school_context(self.a.school):
            other = Enrollment.objects.get(student=self.a.other_student)
        response = self.mark(records=[{"enrollment": str(other.pk), "status": "absent"}])
        self.assertEqual(response.status_code, 400)

    def test_changes_after_the_day_are_logged(self):
        yesterday = self.today - timedelta(days=1)
        self.mark(day=yesterday)
        self.mark(day=yesterday, records=[{"enrollment": str(self.a.enrollment.pk), "status": "late"}])
        with school_context(self.a.school):
            self.assertTrue(AuditLog.objects.filter(action="attendance.change_after_day").exists())
            self.assertEqual(AttendanceRecord.objects.get(enrollment=self.a.enrollment, date=yesterday).status, "late")

    def test_parent_sees_calendar_and_percentage(self):
        start = self.today - timedelta(days=3)
        for i, status in enumerate(["present", "absent", "late", "present"]):
            self.mark(day=start + timedelta(days=i),
                      records=[{"enrollment": str(self.a.enrollment.pk), "status": status}])
        parent = self.client_for(self.a.parent_user, self.a.school)
        response = parent.get(f"/api/attendance/students/{self.a.student.pk}")
        self.assertEqual(response.status_code, 200)
        year = response.data["year_summary"]
        self.assertEqual((year["marked_days"], year["attended"], year["percentage"]), (4, 3, 75.0))
        # A parent can't see a child who isn't theirs.
        self.assertEqual(parent.get(f"/api/attendance/students/{self.kid2.pk}").status_code, 404)

    def test_reports(self):
        self.mark(records=[{"enrollment": str(self.kid2_enrollment.pk), "status": "absent"}])
        admin = self.client_for(self.a.admin, self.a.school)
        daily = admin.get("/api/attendance/reports/daily").data
        self.assertEqual(daily["total"]["absent"], 1)
        self.assertEqual(daily["unmarked_sections"], 1)
        low = admin.get("/api/attendance/reports/low?threshold=75").data
        self.assertEqual([s["name"] for s in low["students"]], ["Second kid"])
        monthly = admin.get(f"/api/attendance/reports/monthly?section={self.a.section_a.pk}").data
        self.assertEqual(len(monthly["students"]), 2)
        pending = self.teacher.get("/api/attendance/pending").data
        self.assertEqual([(s["section_name"], s["marked"]) for s in pending["sections"]], [("Grade 5-A", True)])
        self.assertEqual(self.client_for(self.a.parent_user, self.a.school).get(
            "/api/attendance/reports/daily").status_code, 403)
