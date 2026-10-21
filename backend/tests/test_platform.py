import re

from django.core import mail

from apps.academics.models import AcademicYear
from apps.accounts.models import AuditLog, Role, SchoolMembership
from apps.tenancy.context import bypass_rls, school_context
from apps.tenancy.models import School

from .helpers import ApiTestCase, World, make_user

NEW_SCHOOL = {
    "name": "Green Valley Public School",
    "subdomain": "GreenValley",
    "board": "CBSE",
    "address": "12 Hill Road",
    "plan": "standard",
    "admin_name": "Priya Sharma",
    "admin_email": "priya@greenvalley.test",
    "academic_year_name": "2026-27",
    "academic_year_start": "2026-04-01",
    "academic_year_end": "2027-03-31",
}


class PlatformTests(ApiTestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a = World("alpha")
        cls.owner = make_user("Owner", "owner@platform.test", is_platform_owner=True)

    def test_onboard_a_school(self):
        client = self.client_for(self.owner)
        with self.captureOnCommitCallbacks(execute=True):
            response = client.post("/api/platform/schools/", NEW_SCHOOL)
        self.assertEqual(response.status_code, 201, response.data)
        school = School.objects.get(subdomain="greenvalley")
        with school_context(school):
            self.assertEqual(AcademicYear.objects.get().name, "2026-27")
            admin = SchoolMembership.objects.get(role=Role.ADMIN).user
        self.assertEqual(admin.email, "priya@greenvalley.test")
        self.assertIn("/invite/", mail.outbox[0].body)
        self.assertIn("Green Valley Public School", mail.outbox[0].subject)

        # The new admin accepts the invite and lands in their school.
        token = re.search(r"/invite/(\S+)", mail.outbox[0].body).group(1)
        accepted = self.client.post(f"/api/auth/invites/{token}", {"password": "Valley-pass-2026"})
        self.assertEqual(accepted.data["memberships"][0]["school"]["subdomain"], "greenvalley")
        self.assertEqual(accepted.data["memberships"][0]["roles"], ["admin"])

    def test_subdomain_rules(self):
        client = self.client_for(self.owner)
        for bad in ("alpha", "www", "has space", "-dash"):
            response = client.post("/api/platform/schools/", {**NEW_SCHOOL, "subdomain": bad})
            self.assertEqual(response.status_code, 400, bad)
            self.assertIn("subdomain", response.data)

    def test_list_shows_counts_not_records(self):
        response = self.client_for(self.owner).get("/api/platform/schools/")
        self.assertEqual(response.status_code, 200)
        row = response.data["results"][0]
        self.assertEqual(row["usage"], {"students": 2, "teachers": 1, "admins": 1})
        self.assertNotIn("students", {k for k in row if k != "usage"})
        # Reading across schools is logged.
        with bypass_rls():
            self.assertTrue(AuditLog.objects.filter(action="platform.access", actor=self.owner).exists())

    def test_platform_owner_cannot_read_student_records(self):
        client = self.client_for(self.owner, self.a.school)
        self.assertEqual(client.get("/api/students/").status_code, 403)

    def test_school_members_cannot_use_platform_endpoints(self):
        for user in (self.a.admin, self.a.teacher_user, self.a.parent_user):
            client = self.client_for(user)
            self.assertEqual(client.get("/api/platform/schools/").status_code, 403)
            self.assertEqual(client.post("/api/platform/schools/", NEW_SCHOOL).status_code, 403)

    def test_suspended_school_is_read_only(self):
        owner = self.client_for(self.owner)
        self.assertEqual(owner.post(f"/api/platform/schools/{self.a.school.pk}/suspend/").data["status"],
                         "suspended")
        admin = self.client_for(self.a.admin, self.a.school)
        self.assertEqual(admin.get("/api/students/").status_code, 200)
        response = admin.post("/api/classes/", {"name": "Grade 6", "order": 6})
        self.assertEqual(response.status_code, 403)
        self.assertIn("suspended", str(response.data))
        owner.post(f"/api/platform/schools/{self.a.school.pk}/activate/")
        self.assertEqual(admin.post("/api/classes/", {"name": "Grade 6", "order": 6}).status_code, 201)

    def test_archived_school_disappears(self):
        self.client_for(self.owner).post(f"/api/platform/schools/{self.a.school.pk}/archive/")
        admin = self.client_for(self.a.admin, self.a.school)
        self.assertEqual(admin.get("/api/students/").status_code, 404)
        login = self.client.post("/api/auth/login", {"identifier": "admin@alpha.test", "password": "S3cure-pass-123"})
        self.assertEqual(login.status_code, 403)

    def test_status_changes_are_audited(self):
        self.client_for(self.owner).post(f"/api/platform/schools/{self.a.school.pk}/suspend/")
        with school_context(self.a.school):
            log = AuditLog.objects.get(action="school.suspended")
        self.assertEqual(log.before, {"status": "active"})
        self.assertEqual(log.actor, self.owner)
