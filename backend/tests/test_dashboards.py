"""Student and parent home screens, and quizzes kept inside their school."""

from datetime import timedelta

from django.utils import timezone

from apps.attendance.models import AttendanceRecord
from apps.exams.models import Exam, ExamTerm, Mark, ReportCard
from apps.fees.models import FeeHead, FeeStructure, Payment, PaymentAllocation, StudentFeeDue
from apps.homework.models import Homework
from apps.quizzes.models import Question, Quiz, QuizAttempt, QuizQuestion
from apps.tenancy.context import school_context, school_today
from apps.timetable.models import Period, TimetableEntry

from .helpers import ApiTestCase, World


def fill(w):
    """Give a world a day's worth of everything a dashboard shows."""
    with school_context(w.school):
        today = school_today()
        now = timezone.now()
        period = Period.objects.create(name="P1", start_time="08:00", end_time="08:40", order=1)
        w.slot = TimetableEntry.objects.create(section=w.section_a, day_of_week=today.isoweekday(), period=period,
                                               subject=w.maths, teacher=w.teacher, room="12")
        AttendanceRecord.objects.create(enrollment=w.enrollment, date=today, status="late", marked_by=w.admin)
        w.homework = Homework.objects.create(section=w.section_a, subject=w.maths, teacher=w.teacher,
                                             title=f"{w.school.subdomain} worksheet", assigned_on=today,
                                             due_date=today + timedelta(days=1), created_by=w.teacher_user)
        term = ExamTerm.objects.create(academic_year=w.year, name="Term 1")
        exam = Exam.objects.create(exam_term=term, section=w.section_a, subject=w.maths, max_marks=50,
                                   status=Exam.Status.PUBLISHED, published_at=now)
        Mark.objects.create(exam=exam, enrollment=w.enrollment, marks_obtained=45, entered_by=w.teacher_user)
        ReportCard.objects.create(student=w.student, exam_term=term, section=w.section_a, published_at=now)
        head = FeeHead.objects.create(name="Tuition")
        structure = FeeStructure.objects.create(academic_year=w.year, school_class=w.grade5, fee_head=head,
                                                amount=300000, installments=[])
        w.due1 = StudentFeeDue.objects.create(student=w.student, academic_year=w.year, fee_structure=structure,
                                              fee_head=head, name="Term 1", due_date=today - timedelta(days=5),
                                              amount=200000)
        StudentFeeDue.objects.create(student=w.student, academic_year=w.year, fee_structure=structure,
                                     fee_head=head, name="Term 2", installment_no=2, due_date=today + timedelta(days=30), amount=100000)
        payment = Payment.objects.create(student=w.student, academic_year=w.year, receipt_no="R-1", amount=150000,
                                         paid_on=today, mode="cash", received_by=w.admin)
        PaymentAllocation.objects.create(payment=payment, due=w.due1, amount=150000)
        question = Question.objects.create(subject=w.maths, text="2 + 2?", options=["3", "4"], correct_option=1,
                                           teacher=w.teacher, created_by=w.teacher_user)
        w.open_quiz = Quiz.objects.create(section=w.section_a, subject=w.maths, teacher=w.teacher, title="Open quiz",
                                          taught_on=today, opens_at=now - timedelta(hours=1),
                                          closes_at=now + timedelta(hours=5), created_by=w.teacher_user)
        w.taken_quiz = Quiz.objects.create(section=w.section_a, subject=w.maths, teacher=w.teacher,
                                           title="Taken quiz", taught_on=today, opens_at=now - timedelta(days=2),
                                           closes_at=now - timedelta(days=1), created_by=w.teacher_user)
        for quiz in (w.open_quiz, w.taken_quiz):
            QuizQuestion.objects.create(quiz=quiz, question=question, order=1, marks=2)
        QuizAttempt.objects.create(quiz=w.taken_quiz, student=w.student, started_at=now - timedelta(days=2),
                                   submitted_at=now - timedelta(days=2), score=2, max_score=2)


class DashboardTests(ApiTestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a, cls.b = World("alpha"), World("beta")
        fill(cls.a)
        fill(cls.b)

    def test_student_dashboard(self):
        data = self.client_for(self.a.student_user, self.a.school).get("/api/dashboard/student").data
        self.assertEqual(data["student"]["section_name"], "Grade 5-A")
        self.assertEqual([(t["subject_name"], t["room"]) for t in data["timetable"]], [("Maths", "12")])
        self.assertEqual([h["title"] for h in data["homework"]["items"]], ["alpha worksheet"])
        self.assertEqual([q["title"] for q in data["quizzes"]["pending"]], ["Open quiz"])
        self.assertEqual([(q["title"], q["score"]) for q in data["quizzes"]["recent_scores"]], [("Taken quiz", 2)])
        latest = data["tests"]["latest"][0]
        self.assertEqual((latest["subject_name"], latest["percentage"]), ("Maths", 90.0))
        self.assertEqual(len(data["tests"]["report_cards"]), 1)
        self.assertEqual(data["attendance"]["today"], "late")

    def test_homework_done_drops_off(self):
        student = self.client_for(self.a.student_user, self.a.school)
        student.post(f"/api/homework/{self.a.homework.pk}/done")
        self.assertEqual(student.get("/api/dashboard/student").data["homework"]["items"], [])

    def test_parent_dashboard(self):
        data = self.client_for(self.a.parent_user, self.a.school).get("/api/dashboard/parent").data
        self.assertEqual(len(data["children"]), 1)
        child = data["children"][0]
        self.assertEqual(child["student"]["name"], self.a.student_user.name)
        self.assertEqual(child["fees"]["due"], "3000.00")
        self.assertEqual(child["fees"]["paid"], "1500.00")
        self.assertEqual(child["fees"]["remaining"], "1500.00")
        self.assertEqual(child["fees"]["overdue"], "500.00")
        self.assertEqual(child["fees"]["next_due"]["name"], "Term 2")
        self.assertEqual(child["attendance"]["today"], "late")
        self.assertEqual(child["attendance"]["month_summary"]["late"], 1)
        self.assertEqual([h["title"] for h in child["homework"]["items"]], ["alpha worksheet"])
        self.assertEqual(child["tests"]["report_cards"][0]["exam_term_name"], "Term 1")
        self.assertEqual(child["quizzes"]["recent_scores"][0]["score"], 2)

    def test_roles(self):
        self.assertEqual(self.client_for(self.a.parent_user, self.a.school).get("/api/dashboard/student")
                         .status_code, 403)
        self.assertEqual(self.client_for(self.a.student_user, self.a.school).get("/api/dashboard/parent")
                         .status_code, 403)
        self.assertEqual(self.client_for(self.a.teacher_user, self.a.school).get("/api/dashboard/parent")
                         .status_code, 403)

    def test_dashboards_stay_inside_the_school(self):
        # A user of school A gets nothing from school B, and B's rows never show in A.
        self.assertEqual(self.client_for(self.a.parent_user, self.b.school).get("/api/dashboard/parent")
                         .status_code, 403)
        self.assertEqual(self.client_for(self.a.student_user, self.b.school).get("/api/dashboard/student")
                         .status_code, 403)
        data = self.client_for(self.a.student_user, self.a.school).get("/api/dashboard/student").data
        text = str(data)
        self.assertNotIn("beta", text)
        self.assertNotIn(str(self.b.open_quiz.pk), text)

    def test_quizzes_stay_inside_the_school(self):
        teacher = self.client_for(self.a.teacher_user, self.a.school)
        admin = self.client_for(self.a.admin, self.a.school)
        b_quiz = self.b.open_quiz.pk
        self.assertEqual(self.ids(admin.get("/api/quizzes/")), {str(self.a.open_quiz.pk), str(self.a.taken_quiz.pk)})
        for path in [f"/api/quizzes/{b_quiz}/", f"/api/quizzes/{b_quiz}/paper", f"/api/quizzes/{b_quiz}/results"]:
            self.assertEqual(admin.get(path).status_code, 404, path)
        student = self.client_for(self.a.student_user, self.a.school)
        self.assertEqual(student.post(f"/api/quizzes/{b_quiz}/submit", {"answers": {}}).status_code, 404)
        self.assertEqual(teacher.get("/api/question-bank/").data["count"], 1)
        # Setting a quiz for school B's section, or reusing B's question, is refused.
        now = timezone.now()
        body = {"section": str(self.b.section_a.pk), "subject": str(self.a.maths.pk), "title": "X",
                "closes_at": (now + timedelta(hours=1)).isoformat(),
                "questions": [{"text": "Q", "options": ["a", "b"], "correct_option": 0}]}
        self.assertEqual(teacher.post("/api/quizzes/", body).status_code, 400)
        b_question = self.b.taken_quiz.quiz_questions.values_list("question_id", flat=True)
        with school_context(self.b.school):
            b_question = str(list(b_question)[0])
        body.update(section=str(self.a.section_a.pk), questions=[{"question": b_question}])
        self.assertEqual(teacher.post("/api/quizzes/", body).status_code, 400)
        # The parent of a child in school B cannot point at that child from school A.
        parent = self.client_for(self.a.parent_user, self.a.school)
        self.assertEqual(parent.get(f"/api/quizzes/?student={self.b.student.pk}").status_code, 403)
