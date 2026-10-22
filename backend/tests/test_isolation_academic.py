"""Timetable, attendance, homework, exams and fees never cross schools."""

from apps.attendance.models import AttendanceRecord
from apps.exams.models import Exam, ExamTerm, GradeScale
from apps.fees.models import FeeHead, FeeStructure, Payment, StudentFeeDue
from apps.homework.models import Homework
from apps.tenancy.context import school_context, school_today
from apps.timetable.models import Period, TimetableEntry

from .helpers import ApiTestCase, World


def fill(w):
    """Give a world one of everything."""
    with school_context(w.school):
        today = school_today()
        w.period = Period.objects.create(name="P1", start_time="08:00", end_time="08:40", order=1)
        w.slot = TimetableEntry.objects.create(section=w.section_a, day_of_week=1, period=w.period,
                                               subject=w.maths, teacher=w.teacher)
        AttendanceRecord.objects.create(enrollment=w.enrollment, date=today, status="absent", marked_by=w.admin)
        w.homework = Homework.objects.create(section=w.section_a, subject=w.maths, teacher=w.teacher, title="HW",
                                             assigned_on=today, due_date=today, created_by=w.teacher_user)
        w.scale = GradeScale.objects.create(name="Scale", bands=[{"min": 0, "grade": "E"}])
        w.term = ExamTerm.objects.create(academic_year=w.year, name="Final")
        w.exam = Exam.objects.create(exam_term=w.term, section=w.section_a, subject=w.maths, max_marks=100,
                                     status=Exam.Status.PUBLISHED)
        w.head = FeeHead.objects.create(name="Tuition")
        w.structure = FeeStructure.objects.create(academic_year=w.year, school_class=w.grade5, fee_head=w.head,
                                                  amount=1000, installments=[
                                                      {"name": "All", "due_date": today.isoformat(), "amount": 1000}])
        w.due = StudentFeeDue.objects.create(student=w.student, academic_year=w.year, fee_structure=w.structure,
                                             fee_head=w.head, name="Tuition", due_date=today, amount=1000)
        w.payment = Payment.objects.create(student=w.student, academic_year=w.year, receipt_no="R-000001",
                                           amount=100, paid_on=today, mode="cash", received_by=w.admin)


class AcademicIsolationTests(ApiTestCase):
    LISTS = ["periods", "timetable", "homework", "grade-scales", "exam-terms", "exams", "fee-heads",
             "fee-structures", "fee-dues", "payments"]

    @classmethod
    def setUpTestData(cls):
        cls.a, cls.b = World("alpha"), World("beta")
        fill(cls.a)
        fill(cls.b)

    def b_ids(self):
        b = self.b
        return {str(x.pk) for x in [b.period, b.slot, b.homework, b.scale, b.term, b.exam, b.head, b.structure,
                                    b.due, b.payment]}

    def test_lists_never_include_school_b(self):
        client = self.client_for(self.a.admin, self.a.school)
        for endpoint in self.LISTS:
            response = client.get(f"/api/{endpoint}/")
            self.assertEqual(response.status_code, 200, endpoint)
            self.assertTrue(self.ids(response), f"{endpoint} should list school A's own rows")
            self.assertEqual(self.ids(response) & self.b_ids(), set(), endpoint)

    def test_school_b_objects_are_not_found(self):
        client = self.client_for(self.a.admin, self.a.school)
        b = self.b
        for endpoint, pk in [("periods", b.period.pk), ("timetable", b.slot.pk), ("homework", b.homework.pk),
                             ("grade-scales", b.scale.pk), ("exam-terms", b.term.pk), ("exams", b.exam.pk),
                             ("fee-heads", b.head.pk), ("fee-structures", b.structure.pk), ("fee-dues", b.due.pk),
                             ("payments", b.payment.pk)]:
            self.assertEqual(client.get(f"/api/{endpoint}/{pk}/").status_code, 404, endpoint)
        for path in [f"exams/{b.exam.pk}/marks", f"payments/{b.payment.pk}/receipt",
                     f"attendance/students/{b.student.pk}", f"results/students/{b.student.pk}",
                     f"fees/students/{b.student.pk}", f"report-cards/students/{b.student.pk}/{b.term.pk}",
                     f"homework/{b.homework.pk}/statuses"]:
            self.assertEqual(client.get(f"/api/{path}").status_code, 404, path)
        self.assertEqual(client.post(f"/api/payments/{b.payment.pk}/reverse", {"reason": "x"}).status_code, 404)
        self.assertEqual(client.post(f"/api/exams/{b.exam.pk}/unpublish").status_code, 404)

    def test_cannot_link_school_b_rows(self):
        a, b = self.a, self.b
        client = self.client_for(a.admin, a.school)
        response = client.post("/api/timetable/", {"section": str(a.section_b.pk), "subject": str(a.maths.pk),
                                                   "day_of_week": 2, "period": str(b.period.pk)})
        self.assertEqual(response.status_code, 400)
        self.assertIn("period", response.data)
        response = client.post("/api/payments/", {"student": str(b.student.pk), "amount": "1", "mode": "cash"})
        self.assertEqual(response.status_code, 400)
        response = client.post("/api/attendance/sheet", {"section": str(b.section_a.pk),
                                                         "date": school_today().isoformat()})
        self.assertEqual(response.status_code, 400)
        response = client.post("/api/fee-structures/", {"academic_year": str(a.year.pk),
                                                        "school_class": str(b.grade5.pk),
                                                        "fee_head": str(a.head.pk), "amount": "10"})
        self.assertEqual(response.status_code, 400)
        teacher = self.client_for(a.teacher_user, a.school)
        response = teacher.put(f"/api/exams/{a.exam.pk}/marks",
                               {"rows": [{"enrollment": str(b.enrollment.pk), "marks_obtained": "1"}]})
        self.assertEqual(response.status_code, 400)

    def test_members_of_a_get_nothing_in_school_b(self):
        paths = [f"/api/{e}/" for e in self.LISTS] + [
            "/api/attendance/reports/daily", "/api/fees/summary", "/api/fees/balances",
            f"/api/attendance/students/{self.b.student.pk}", f"/api/fees/students/{self.b.student.pk}"]
        for user in (self.a.admin, self.a.teacher_user, self.a.student_user, self.a.parent_user):
            client = self.client_for(user, self.b.school)
            for path in paths:
                self.assertEqual(client.get(path).status_code, 403, f"{user} reading {path} in school B")
