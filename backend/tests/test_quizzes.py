"""After-class quizzes: teachers set them, students take them, parents see scores."""

from datetime import timedelta

from django.utils import timezone

from apps.academics.models import Subject
from apps.quizzes.models import Quiz
from apps.tenancy.context import school_context

from .helpers import ApiTestCase, World


def questions():
    return [
        {"type": "mcq", "text": "1/2 + 1/4 = ?", "options": ["3/4", "2/6", "1/8"], "correct_option": 0, "marks": 2},
        {"type": "true_false", "text": "1/3 is more than 1/2.", "correct_option": 1},
        {"type": "mcq", "text": "Which is a proper fraction?", "options": ["5/4", "3/7"], "correct_option": 1},
    ]


class QuizTests(ApiTestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a = World("alpha")

    def setUp(self):
        self.teacher = self.client_for(self.a.teacher_user, self.a.school)
        self.student = self.client_for(self.a.student_user, self.a.school)
        self.parent = self.client_for(self.a.parent_user, self.a.school)

    def create(self, section=None, opens=None, closes=None, **extra):
        now = timezone.now()
        body = {
            "section": str((section or self.a.section_a).pk), "subject": str(self.a.maths.pk),
            "title": "Fractions check", "topic": "Adding fractions", "questions": questions(),
            "opens_at": (opens or now - timedelta(minutes=1)).isoformat(),
            "closes_at": (closes or now + timedelta(days=1)).isoformat(), **extra,
        }
        return self.teacher.post("/api/quizzes/", body)

    def close(self, quiz_id):
        with school_context(self.a.school):
            Quiz.objects.filter(pk=quiz_id).update(closes_at=timezone.now() - timedelta(seconds=1))

    def answers(self, paper, picks):
        return {q["id"]: pick for q, pick in zip(paper["questions"], picks)}

    def test_teacher_sets_and_student_takes(self):
        response = self.create()
        self.assertEqual(response.status_code, 201, response.data)
        quiz = response.data
        self.assertEqual((quiz["question_count"], quiz["max_score"], quiz["state"]), (3, 4, "open"))
        self.assertEqual(quiz["topic_name"], "Adding fractions")

        pending = self.student.get("/api/quizzes/?state=pending").data["results"]
        self.assertEqual([q["id"] for q in pending], [quiz["id"]])
        paper = self.student.get(f"/api/quizzes/{quiz['id']}/paper").data
        self.assertEqual(paper["questions"][1]["options"], ["True", "False"])
        self.assertNotIn("correct_option", paper["questions"][0], "answers are hidden while the quiz is open")

        # Right, right, wrong: 2 + 1 of 4.
        result = self.student.post(f"/api/quizzes/{quiz['id']}/submit",
                                   {"answers": self.answers(paper, [0, 1, 0])})
        self.assertEqual(result.status_code, 201, result.data)
        self.assertEqual((result.data["score"], result.data["max_score"]), (3, 4))
        again = self.student.post(f"/api/quizzes/{quiz['id']}/submit", {"answers": {}})
        self.assertEqual(again.status_code, 400)
        self.assertEqual(self.student.get("/api/quizzes/?state=pending").data["results"], [])
        listing = self.student.get("/api/quizzes/").data["results"]
        self.assertEqual(listing[0]["my_attempt"]["score"], 3)

        # Still open: no answers shown to the student; the parent sees only the score.
        paper = self.student.get(f"/api/quizzes/{quiz['id']}/paper").data
        self.assertNotIn("is_correct", paper["questions"][0])
        rows = self.parent.get(f"/api/quizzes/?student={self.a.student.pk}").data["results"]
        self.assertEqual(rows[0]["my_attempt"]["score"], 3)
        self.assertEqual(self.parent.get(f"/api/quizzes/{quiz['id']}/paper?student={self.a.student.pk}")
                         .status_code, 403)

        # Closed: the right answers are shown.
        self.close(quiz["id"])
        paper = self.student.get(f"/api/quizzes/{quiz['id']}/paper").data
        self.assertEqual([q["is_correct"] for q in paper["questions"]], [True, True, False])
        self.assertEqual(paper["questions"][2]["correct_option"], 1)
        child = self.parent.get(f"/api/quizzes/{quiz['id']}/paper?student={self.a.student.pk}").data
        self.assertEqual(child["attempt"]["score"], 3)

    def test_teacher_sees_scores_and_most_missed(self):
        quiz = self.create().data
        paper = self.student.get(f"/api/quizzes/{quiz['id']}/paper").data
        self.student.post(f"/api/quizzes/{quiz['id']}/submit", {"answers": self.answers(paper, [0, 0])})
        results = self.teacher.get(f"/api/quizzes/{quiz['id']}/results").data
        self.assertEqual((results["attempted"], results["students"]), (1, 1))
        self.assertEqual(results["scores"][0]["score"], 2)
        # Question 2 answered wrong, question 3 left blank.
        self.assertEqual(results["most_missed"], [paper["questions"][1]["id"], paper["questions"][2]["id"]])
        self.assertEqual(results["questions"][1]["choices"], [1, 0])
        self.assertEqual(self.student.get(f"/api/quizzes/{quiz['id']}/results").status_code, 403)
        listing = self.teacher.get("/api/quizzes/?mine=true").data["results"]
        self.assertEqual((listing[0]["attempt_count"], listing[0]["student_count"]), (1, 1))

    def test_only_for_sections_and_subjects_taught(self):
        self.assertEqual(self.create(section=self.a.section_b).status_code, 403)
        admin = self.client_for(self.a.admin, self.a.school)
        self.assertEqual(admin.post("/api/quizzes/", {}).status_code, 403)
        self.assertEqual(self.student.post("/api/quizzes/", {}).status_code, 403)
        with school_context(self.a.school):
            science = Subject.objects.create(name="Science")
        response = self.create(subject=str(science.pk))
        self.assertEqual(response.status_code, 403)

    def test_other_section_cannot_see_or_take_it(self):
        quiz = self.create().data
        other = self.client_for(self.a.other_student_user, self.a.school)
        self.assertEqual(other.get("/api/quizzes/").data["results"], [])
        self.assertEqual(other.get(f"/api/quizzes/{quiz['id']}/paper").status_code, 404)
        self.assertEqual(other.post(f"/api/quizzes/{quiz['id']}/submit", {"answers": {}}).status_code, 404)
        self.assertEqual(self.parent.get(f"/api/quizzes/?student={self.a.other_student.pk}").status_code, 403)

    def test_not_before_it_opens_or_after_it_closes(self):
        now = timezone.now()
        later = self.create(opens=now + timedelta(hours=2), closes=now + timedelta(hours=4)).data
        self.assertEqual(later["state"], "upcoming")
        self.assertEqual(self.student.get(f"/api/quizzes/{later['id']}/paper").status_code, 403)
        self.assertEqual(self.student.post(f"/api/quizzes/{later['id']}/submit", {"answers": {}}).status_code, 400)
        quiz = self.create().data
        self.close(quiz["id"])
        self.assertEqual(self.student.post(f"/api/quizzes/{quiz['id']}/submit", {"answers": {}}).status_code, 400)

    def test_checks_questions(self):
        bad = [{"type": "mcq", "text": "Pick", "options": ["a"], "correct_option": 0}]
        self.assertEqual(self.create(questions=bad).status_code, 400)
        bad = [{"type": "mcq", "text": "Pick", "options": ["a", "b"], "correct_option": 2}]
        self.assertEqual(self.create(questions=bad).status_code, 400)
        self.assertEqual(self.create(questions=[]).status_code, 400)
        now = timezone.now()
        self.assertEqual(self.create(opens=now, closes=now - timedelta(hours=1)).status_code, 400)

    def test_answers_must_belong_to_the_quiz(self):
        quiz = self.create().data
        paper = self.student.get(f"/api/quizzes/{quiz['id']}/paper").data
        first = paper["questions"][0]["id"]
        self.assertEqual(self.student.post(f"/api/quizzes/{quiz['id']}/submit",
                                           {"answers": {first: 7}}).status_code, 400)
        self.assertEqual(self.student.post(f"/api/quizzes/{quiz['id']}/submit",
                                           {"answers": {quiz["id"]: 0}}).status_code, 400)

    def test_reuse_from_question_bank(self):
        self.create()
        bank = self.teacher.get(f"/api/question-bank/?subject={self.a.maths.pk}").data["results"]
        self.assertEqual(len(bank), 3)
        response = self.create(title="Revision", questions=[{"question": bank[0]["id"], "marks": 3}])
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["max_score"], 3)
        topics = self.teacher.get(f"/api/quiz-topics/?subject={self.a.maths.pk}").data
        self.assertEqual([t["name"] for t in topics], ["Adding fractions"])
        self.assertEqual(self.student.get("/api/question-bank/").status_code, 403)

    def test_questions_fixed_once_taken(self):
        quiz = self.create().data
        changed = self.teacher.patch(f"/api/quizzes/{quiz['id']}/", {"questions": questions()[:1], "title": "New"})
        self.assertEqual(changed.status_code, 200, changed.data)
        self.assertEqual((changed.data["question_count"], changed.data["title"]), (1, "New"))
        self.student.post(f"/api/quizzes/{quiz['id']}/submit", {"answers": {}})
        self.assertEqual(self.teacher.patch(f"/api/quizzes/{quiz['id']}/",
                                            {"questions": questions()}).status_code, 400)
        self.assertEqual(self.teacher.delete(f"/api/quizzes/{quiz['id']}/").status_code, 400)
        closed = self.teacher.post(f"/api/quizzes/{quiz['id']}/close")
        self.assertEqual(closed.data["state"], "closed")
        unused = self.create().data
        self.assertEqual(self.teacher.delete(f"/api/quizzes/{unused['id']}/").status_code, 204)
