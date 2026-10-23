from types import SimpleNamespace

from django.test import override_settings
from rest_framework.exceptions import ValidationError

from apps.accounts.models import AuditLog, User
from apps.core import demo
from apps.people.models import Student
from apps.quizzes.services import grade
from apps.tenancy import services as school_services
from apps.tenancy.context import bypass_rls, school_context
from apps.tenancy.models import School

from .helpers import ApiTestCase, World, make_user


class AppConfigTests(ApiTestCase):
    def test_anyone_can_read_the_app_config(self):
        response = self.client.get("/api/config")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([p["key"] for p in response.data["plans"]], ["trial", "standard", "premium"])
        self.assertIn("www", response.data["reserved_subdomains"])
        self.assertIn("cash", [m["key"] for m in response.data["payment_modes"]])
        self.assertEqual(response.data["login_code"]["roles"], ["parent"])

    @override_settings(DEMO_LOGINS_VISIBLE=False)
    def test_demo_logins_are_hidden_unless_switched_on(self):
        self.assertIsNone(self.client.get("/api/config").data["demo"])

    @override_settings(DEMO_LOGINS_VISIBLE=True)
    def test_demo_logins_come_from_the_demo_config(self):
        data = self.client.get("/api/config").data["demo"]
        self.assertEqual(data["password"], demo.load_config()["password"])
        self.assertEqual(data["logins"][0]["email"], demo.load_config()["owner"]["email"])

    @override_settings(SCHOOL_BOARDS=["Kerala State"])
    def test_lists_can_be_replaced_in_settings(self):
        self.assertEqual(self.client.get("/api/config").data["boards"], ["Kerala State"])


class DemoDataTests(ApiTestCase):
    def test_seed_builds_the_demo_from_config_and_can_run_twice(self):
        config = demo.load_config()
        demo.seed(config)
        demo.seed(config)
        self.assertEqual(School.objects.count(), len(config["schools"]))
        owner = User.objects.get(email=config["owner"]["email"])
        self.assertTrue(owner.is_platform_owner)
        self.assertTrue(owner.check_password(config["password"]))
        school = School.objects.get(subdomain=config["schools"][0]["subdomain"])
        per_school = config["students_per_section"] * sum(len(c["sections"]) for c in config["classes"])
        with school_context(school):
            self.assertEqual(Student.objects.count(), per_school)

    @override_settings(DEMO_AUTOLOAD=True)
    def test_autoload_fills_only_an_empty_database(self):
        School.objects.create(name="Real School", subdomain="real")
        demo.autoload()
        self.assertEqual(School.objects.count(), 1)

    @override_settings(DEMO_AUTOLOAD=False)
    def test_autoload_is_off_by_default(self):
        demo.autoload()
        self.assertEqual(School.objects.count(), 0)


class SchoolServiceTests(ApiTestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a = World("alpha")
        cls.owner = make_user("Owner", "owner@platform.test", is_platform_owner=True)

    def test_status_changes_are_audited(self):
        school_services.set_status(self.a.school, School.Status.SUSPENDED, actor=self.owner)
        self.a.school.refresh_from_db()
        self.assertEqual(self.a.school.status, School.Status.SUSPENDED)
        with bypass_rls():
            log = AuditLog.objects.filter(action="school.suspended").get()
        self.assertEqual(log.before, {"status": "active"})

    def test_no_admin_means_no_invite(self):
        empty = School.objects.create(name="Empty", subdomain="empty")
        with self.assertRaises(ValidationError):
            school_services.resend_admin_invite(empty)


def _item(qid, options, right, marks=1):
    return SimpleNamespace(question_id=qid, marks=marks, question=SimpleNamespace(options=options, correct_option=right))


class GradingTests(ApiTestCase):
    def test_grading_adds_marks_for_right_answers_only(self):
        items = [_item("q1", ["a", "b"], 0, marks=2), _item("q2", ["a", "b", "c"], 2), _item("q3", ["x", "y"], 1)]
        score, max_score, rows = grade(items, {"q1": 0, "q2": 1})
        self.assertEqual((score, max_score), (2, 4))
        self.assertEqual([r[2] for r in rows], [True, False, False])

    def test_grading_refuses_unknown_questions_and_choices(self):
        items = [_item("q1", ["a", "b"], 0)]
        with self.assertRaises(ValidationError):
            grade(items, {"zz": 0})
        with self.assertRaises(ValidationError):
            grade(items, {"q1": 5})
