"""Periods and the weekly timetable, with teacher double-booking warnings."""

from apps.academics.models import SectionSubject, Subject
from apps.tenancy.context import school_context
from apps.timetable.models import Period

from .helpers import ApiTestCase, World


class TimetableTests(ApiTestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a = World("alpha")
        with school_context(cls.a.school):
            cls.p1 = Period.objects.create(name="Period 1", start_time="08:00", end_time="08:40", order=1)
            cls.lunch = Period.objects.create(name="Lunch", start_time="11:00", end_time="11:30", order=4,
                                              is_break=True)
            cls.science = Subject.objects.create(name="Science")
            SectionSubject.objects.create(section=cls.a.section_b, subject=cls.science, teacher=cls.a.teacher)

    def setUp(self):
        self.admin = self.client_for(self.a.admin, self.a.school)

    def slot(self, section, subject, **extra):
        return self.admin.post("/api/timetable/", {"section": str(section.pk), "subject": str(subject.pk),
                                                   "day_of_week": 1, "period": str(self.p1.pk), **extra})

    def test_teacher_defaults_from_subject_assignment(self):
        response = self.slot(self.a.section_a, self.a.maths)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["teacher_name"], self.a.teacher_user.name)
        self.assertEqual(response.data["start_time"], "08:00:00")

    def test_double_booking_warns_then_saves_when_confirmed(self):
        self.assertEqual(self.slot(self.a.section_a, self.a.maths).status_code, 201)
        clash = self.slot(self.a.section_b, self.science)
        self.assertEqual(clash.status_code, 400)
        self.assertIn("already teaching Grade 5-A", str(clash.data["teacher"]))
        self.assertEqual(self.slot(self.a.section_b, self.science, allow_clash=True).status_code, 201)
        self.assertEqual(len(self.admin.get("/api/timetable/clashes").data), 1)

    def test_one_class_per_slot_and_no_class_in_breaks(self):
        self.assertEqual(self.slot(self.a.section_a, self.a.maths).status_code, 201)
        self.assertEqual(self.slot(self.a.section_a, self.science).status_code, 400)
        response = self.admin.post("/api/timetable/", {"section": str(self.a.section_a.pk),
                                                       "subject": str(self.a.maths.pk), "day_of_week": 2,
                                                       "period": str(self.lunch.pk)})
        self.assertEqual(response.status_code, 400)
        self.assertIn("period", response.data)

    def test_who_sees_what(self):
        self.slot(self.a.section_a, self.a.maths)
        self.slot(self.a.section_b, self.science, allow_clash=True, teacher=None)
        student = self.client_for(self.a.student_user, self.a.school).get("/api/timetable/")
        self.assertEqual({r["section_name"] for r in student.data}, {"Grade 5-A"})
        parent = self.client_for(self.a.parent_user, self.a.school).get("/api/timetable/")
        self.assertEqual({r["section_name"] for r in parent.data}, {"Grade 5-A"})
        teacher = self.client_for(self.a.teacher_user, self.a.school)
        self.assertEqual(len(teacher.get("/api/timetable/").data), 2)
        self.assertEqual(len(teacher.get("/api/timetable/?mine=true").data), 1)

    def test_only_admins_build_it(self):
        for user in (self.a.teacher_user, self.a.student_user, self.a.parent_user):
            client = self.client_for(user, self.a.school)
            self.assertEqual(client.post("/api/periods/", {"name": "P9", "start_time": "09:00",
                                                           "end_time": "09:40"}).status_code, 403)
            self.assertEqual(client.post("/api/timetable/", {}).status_code, 403)

    def test_period_times(self):
        response = self.admin.post("/api/periods/", {"name": "P2", "start_time": "09:00", "end_time": "08:00"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("end_time", response.data)
