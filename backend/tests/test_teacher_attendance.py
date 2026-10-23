"""Who marks whom: teachers mark students, school admins mark teachers."""

from datetime import timedelta

from apps.accounts import services
from apps.accounts.models import AuditLog, Role
from apps.attendance.models import AttendanceRecord, TeacherAttendance
from apps.people.models import Teacher
from apps.tenancy.context import school_context, school_today

from .helpers import ApiTestCase, World, make_user


class StudentAttendanceRulesTests(ApiTestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a = World("alpha")

    def setUp(self):
        self.today = school_today()
        self.admin = self.client_for(self.a.admin, self.a.school)
        self.teacher = self.client_for(self.a.teacher_user, self.a.school)

    def mark(self, client, day=None):
        return client.post("/api/attendance/sheet", {"section": str(self.a.section_a.pk),
                                                     "date": (day or self.today).isoformat()})

    def test_admin_reads_but_never_marks_students(self):
        sheet = self.admin.get(f"/api/attendance/sheet?section={self.a.section_a.pk}")
        self.assertEqual(sheet.status_code, 200)
        self.assertFalse(sheet.data["can_mark"])
        self.assertIn("School admins mark teacher attendance", sheet.data["cannot_mark_reason"])
        self.assertEqual(self.mark(self.admin).status_code, 403)
        with school_context(self.a.school):
            self.assertFalse(AttendanceRecord.objects.exists())
        # Reports stay open to admins.
        self.assertEqual(self.admin.get("/api/attendance/reports/daily").status_code, 200)

    def test_teacher_marks_own_section(self):
        sheet = self.teacher.get(f"/api/attendance/sheet?section={self.a.section_a.pk}")
        self.assertTrue(sheet.data["can_mark"])
        self.assertEqual(self.mark(self.teacher).status_code, 200)

    def test_admin_who_also_teaches_marks_only_their_sections(self):
        with school_context(self.a.school):
            services.grant_role(self.a.admin, Role.TEACHER)
            teacher = Teacher.objects.create(user=self.a.admin, employee_no="T9")
            self.a.section_b.class_teacher = teacher
            self.a.section_b.save()
        client = self.client_for(self.a.admin, self.a.school)
        self.assertEqual(client.post("/api/attendance/sheet", {"section": str(self.a.section_b.pk),
                                                               "date": self.today.isoformat()}).status_code, 200)
        self.assertEqual(self.mark(client).status_code, 403)

    def test_teacher_marked_away_cannot_take_the_roll_that_day(self):
        with school_context(self.a.school):
            TeacherAttendance.objects.create(teacher=self.a.teacher, date=self.today, status="leave",
                                             marked_by=self.a.admin)
        sheet = self.teacher.get(f"/api/attendance/sheet?section={self.a.section_a.pk}")
        self.assertFalse(sheet.data["can_mark"])
        self.assertIn("on leave", sheet.data["cannot_mark_reason"])
        self.assertEqual(self.mark(self.teacher).status_code, 403)
        self.assertEqual(self.mark(self.teacher, self.today - timedelta(days=1)).status_code, 200)


class TeacherAttendanceTests(ApiTestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a, cls.b = World("alpha"), World("beta")
        with school_context(cls.a.school):
            user = make_user("Second teacher", "teacher2@alpha.test")
            cls.teacher2 = Teacher.objects.create(user=user, employee_no="T2")
            services.grant_role(user, Role.TEACHER)
            gone = make_user("Former teacher", "gone@alpha.test")
            cls.gone = Teacher.objects.create(user=gone, employee_no="T3", status=Teacher.Status.LEFT)

    def setUp(self):
        self.today = school_today()
        self.admin = self.client_for(self.a.admin, self.a.school)

    def save(self, client=None, day=None, records=()):
        return (client or self.admin).post("/api/attendance/teachers/sheet", {
            "date": (day or self.today).isoformat(), "records": list(records)})

    def test_sheet_lists_active_teachers_and_who_is_unmarked(self):
        sheet = self.admin.get("/api/attendance/teachers/sheet")
        self.assertEqual(sheet.status_code, 200)
        self.assertFalse(sheet.data["marked"])
        self.assertEqual(sorted(sheet.data["unmarked"]), ["Second teacher", "alpha teacher"])
        names = [t["name"] for t in sheet.data["teachers"]]
        self.assertNotIn("Former teacher", names)
        self.assertNotIn("beta teacher", names)

    def test_admin_marks_teachers(self):
        response = self.save(records=[{"teacher": str(self.teacher2.pk), "status": "absent", "remark": "Fever"}])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["marked"])
        self.assertEqual(response.data["unmarked"], [])
        self.assertEqual((response.data["summary"]["present"], response.data["summary"]["absent"]), (1, 1))
        with school_context(self.a.school):
            row = TeacherAttendance.objects.get(teacher=self.teacher2, date=self.today)
            self.assertEqual((row.status, row.remark, row.marked_by), ("absent", "Fever", self.a.admin))

    def test_only_admins_mark_or_see_teacher_attendance(self):
        for user in (self.a.teacher_user, self.a.student_user, self.a.parent_user):
            client = self.client_for(user, self.a.school)
            self.assertEqual(self.save(client).status_code, 403)
            self.assertEqual(client.get("/api/attendance/teachers/sheet").status_code, 403)
            self.assertEqual(client.get("/api/attendance/teachers/monthly").status_code, 403)
        with school_context(self.a.school):
            self.assertFalse(TeacherAttendance.objects.exists())

    def test_no_future_dates_and_only_this_schools_active_teachers(self):
        self.assertEqual(self.save(day=self.today + timedelta(days=1)).status_code, 400)
        self.assertEqual(self.save(records=[{"teacher": str(self.gone.pk), "status": "absent"}]).status_code, 400)
        self.assertEqual(self.save(records=[{"teacher": str(self.b.teacher.pk), "status": "absent"}]).status_code, 400)

    def test_changes_after_the_day_are_logged(self):
        yesterday = self.today - timedelta(days=1)
        self.save(day=yesterday)
        self.save(day=yesterday, records=[{"teacher": str(self.teacher2.pk), "status": "late"}])
        with school_context(self.a.school):
            self.assertTrue(AuditLog.objects.filter(action="teacher_attendance.change_after_day").exists())

    def test_teacher_sees_own_attendance_and_admin_sees_the_month(self):
        self.save(records=[{"teacher": str(self.a.teacher.pk), "status": "late"}])
        mine = self.client_for(self.a.teacher_user, self.a.school).get("/api/attendance/teachers/me")
        self.assertEqual(mine.status_code, 200)
        self.assertEqual(mine.data["today"], "late")
        self.assertEqual(mine.data["month_summary"]["late"], 1)
        # An admin without a teacher profile has no "my attendance".
        self.assertEqual(self.admin.get("/api/attendance/teachers/me").status_code, 403)
        month = self.admin.get("/api/attendance/teachers/monthly").data
        row = next(t for t in month["teachers"] if t["teacher"] == str(self.a.teacher.pk))
        self.assertEqual((row["marked_days"], row["attended"]), (1, 1))
