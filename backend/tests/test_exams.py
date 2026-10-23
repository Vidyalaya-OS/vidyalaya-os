"""Tests, marks, grades and report cards."""

from apps.accounts.models import AuditLog
from apps.exams.models import Exam, ExamTerm, grade_for
from apps.people.models import Enrollment, Student
from apps.tenancy.context import school_context

from .helpers import ApiTestCase, World, make_user


class ExamTests(ApiTestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a = World("alpha")
        with school_context(cls.a.school):
            cls.term = ExamTerm.objects.create(academic_year=cls.a.year, name="Half-yearly")
            user = make_user("Second kid", "kid2@alpha.test")
            cls.kid2 = Student.objects.create(user=user, admission_no="A2")
            cls.kid2_enrollment = Enrollment.objects.create(student=cls.kid2, section=cls.a.section_a,
                                                            academic_year=cls.a.year, roll_no=2)

    def setUp(self):
        self.admin = self.client_for(self.a.admin, self.a.school)
        self.teacher = self.client_for(self.a.teacher_user, self.a.school)

    def make_exam(self):
        response = self.admin.post(f"/api/exam-terms/{self.term.pk}/create-exams",
                                   {"sections": [str(self.a.section_a.pk)], "max_marks": "50"})
        self.assertEqual(response.data, {"created": 1})
        with school_context(self.a.school):
            return Exam.objects.get(exam_term=self.term, section=self.a.section_a)

    def enter(self, exam, rows, client=None):
        return (client or self.teacher).put(f"/api/exams/{exam.pk}/marks", {"rows": rows})

    def test_grades(self):
        self.assertEqual(grade_for(95), "A1")
        self.assertEqual(grade_for(33), "D")
        self.assertEqual(grade_for(10), "E")
        self.assertIsNone(grade_for(None))

    def test_marks_entry_publish_and_lock(self):
        exam = self.make_exam()
        response = self.enter(exam, [
            {"enrollment": str(self.a.enrollment.pk), "marks_obtained": "45"},
            {"enrollment": str(self.kid2_enrollment.pk), "is_absent": True},
        ])
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["class_average"], 45.0)
        # Students see nothing until results are published.
        student = self.client_for(self.a.student_user, self.a.school)
        self.assertEqual(student.get(f"/api/results/students/{self.a.student.pk}").data["terms"][0]["subjects"], [])
        self.assertEqual(self.teacher.post(f"/api/exams/{exam.pk}/publish").status_code, 403)
        self.assertEqual(self.admin.post(f"/api/exams/{exam.pk}/publish").status_code, 200)
        result = student.get(f"/api/results/students/{self.a.student.pk}").data["terms"][0]
        self.assertEqual(result["subjects"][0]["marks_obtained"], 45)
        self.assertEqual(result["subjects"][0]["grade"], "A2")
        self.assertEqual(result["percentage"], 90.0)
        # Published marks are locked.
        locked = self.enter(exam, [{"enrollment": str(self.a.enrollment.pk), "marks_obtained": "10"}])
        self.assertEqual(locked.status_code, 400)
        with school_context(self.a.school):
            self.assertTrue(AuditLog.objects.filter(action="marks.save", entity_id=str(exam.pk)).exists())

    def test_publish_refuses_missing_marks_unless_confirmed(self):
        exam = self.make_exam()
        self.enter(exam, [{"enrollment": str(self.a.enrollment.pk), "marks_obtained": "40"}])
        response = self.admin.post(f"/api/exams/{exam.pk}/publish")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(len(response.data["missing"]), 1)
        self.assertEqual(self.admin.post(f"/api/exams/{exam.pk}/publish", {"allow_missing": True}).status_code, 200)

    def test_marks_validated(self):
        exam = self.make_exam()
        too_high = self.enter(exam, [{"enrollment": str(self.a.enrollment.pk), "marks_obtained": "51"}])
        self.assertEqual(too_high.status_code, 400)
        with school_context(self.a.school):
            other = Enrollment.objects.get(student=self.a.other_student)
        stranger = self.enter(exam, [{"enrollment": str(other.pk), "marks_obtained": "5"}])
        self.assertEqual(stranger.status_code, 400)

    def test_only_the_subject_teacher_enters_marks(self):
        exam = self.make_exam()
        for user in (self.a.student_user, self.a.parent_user):
            client = self.client_for(user, self.a.school)
            self.assertEqual(self.enter(exam, [], client).status_code, 403)
        b_exam = self.admin.post("/api/exams/", {"exam_term": str(self.term.pk), "section": str(self.a.section_b.pk),
                                                 "subject": str(self.a.maths.pk), "max_marks": "100"})
        self.assertEqual(b_exam.status_code, 201, b_exam.data)
        self.assertEqual(self.teacher.get(f"/api/exams/{b_exam.data['id']}/marks").status_code, 404)

    def test_report_card_remarks_publish_and_view(self):
        exam = self.make_exam()
        self.enter(exam, [{"enrollment": str(self.a.enrollment.pk), "marks_obtained": "30"},
                          {"enrollment": str(self.kid2_enrollment.pk), "marks_obtained": "20"}])
        body = {"exam_term": str(self.term.pk), "section": str(self.a.section_a.pk)}
        response = self.teacher.put("/api/report-cards/remarks",
                                    {**body, "rows": [{"student": str(self.a.student.pk), "remarks": "Works hard."}]})
        self.assertEqual(response.status_code, 200, response.data)
        url = f"/api/report-cards/students/{self.a.student.pk}/{self.term.pk}"
        parent = self.client_for(self.a.parent_user, self.a.school)
        self.assertEqual(parent.get(url).status_code, 404)
        self.assertEqual(self.teacher.post("/api/report-cards/publish", body).status_code, 403)
        self.assertEqual(self.admin.post("/api/report-cards/publish", body).data, {"published": 2})
        card = parent.get(url)
        self.assertEqual(card.status_code, 200)
        self.assertEqual(card.data["remarks"], "Works hard.")
        self.assertEqual(card.data["result"]["subjects"][0]["class_average"], 25.0)
        self.assertEqual(card.data["result"]["grade"], "C1")  # 30 of 50 is 60%
        section = self.admin.get(f"/api/report-cards/section?exam_term={self.term.pk}&section={self.a.section_a.pk}")
        self.assertTrue(section.data["published"])
        # Remarks lock once published.
        again = self.teacher.put("/api/report-cards/remarks",
                                 {**body, "rows": [{"student": str(self.a.student.pk), "remarks": "Changed"}]})
        self.assertEqual(again.status_code, 400)
        # Tests behind a published report card can't be unpublished on their own.
        self.assertEqual(self.admin.post(f"/api/exams/{exam.pk}/unpublish").status_code, 400)
        self.assertEqual(self.admin.delete("/api/report-cards/publish", body).status_code, 200)
        self.assertEqual(parent.get(url).status_code, 404)
