"""School data must never leak between schools, at the database or the API."""

from django.db import connection, transaction
from django.db.utils import DatabaseError, ProgrammingError

from apps.accounts.models import AuditLog
from apps.people.models import Student
from apps.tenancy import context
from apps.tenancy.context import bypass_rls, school_context
from apps.tenancy.rls import POLICY_NAME, tenant_models

from .helpers import ApiTestCase, World


class RowLevelSecurityTests(ApiTestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a = World("alpha")
        cls.b = World("beta")

    def test_app_role_cannot_bypass_rls(self):
        with connection.cursor() as c:
            c.execute("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user")
            self.assertEqual(c.fetchone(), (False, False), "The app must not connect as a superuser.")

    def test_every_tenant_table_has_a_forced_policy(self):
        tables = [m._meta.db_table for m in tenant_models()]
        self.assertGreater(len(tables), 10)
        with connection.cursor() as c:
            for table in tables:
                c.execute("SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = %s", [table])
                self.assertEqual(c.fetchone(), (True, True), table)
                c.execute("SELECT 1 FROM pg_policies WHERE tablename = %s AND policyname = %s", [table, POLICY_NAME])
                self.assertIsNotNone(c.fetchone(), f"{table} has no {POLICY_NAME} policy")

    def test_no_school_means_no_rows(self):
        context.clear()
        self.assertEqual(Student.objects.count(), 0)

    def test_queries_only_see_the_current_school(self):
        # Deliberately no .filter(school=...): the database does the filtering.
        with school_context(self.a.school):
            self.assertEqual(set(Student.objects.values_list("admission_no", "school_id")),
                             {("A1", self.a.school.id), ("B1", self.a.school.id)})
            self.assertFalse(Student.objects.filter(pk=self.b.student.pk).exists())
        with bypass_rls():
            self.assertEqual(Student.objects.count(), 4)

    def test_cannot_write_into_another_school(self):
        with school_context(self.a.school):
            with self.assertRaises(DatabaseError), transaction.atomic():
                Student.objects.create(school=self.b.school, user=self.a.admin, admission_no="X")
            # Updates to another school's rows touch nothing.
            self.assertEqual(Student.objects.filter(pk=self.b.student.pk).update(admission_no="hacked"), 0)

    def test_audit_log_is_append_only(self):
        with school_context(self.a.school):
            log = AuditLog.objects.create(school=self.a.school, action="test")
            self.assertEqual(AuditLog.objects.filter(pk=log.pk).update(action="changed"), 0)
            self.assertEqual(AuditLog.objects.filter(pk=log.pk).delete()[0], 0)
            self.assertEqual(AuditLog.objects.get(pk=log.pk).action, "test")


class CrossSchoolApiTests(ApiTestCase):
    """Logged into school A, every endpoint must refuse or hide school B's data."""

    LIST_ENDPOINTS = ["academic-years", "classes", "subjects", "sections", "section-subjects", "students",
                      "teachers", "guardians"]

    @classmethod
    def setUpTestData(cls):
        cls.a = World("alpha")
        cls.b = World("beta")

    def b_ids(self):
        b = self.b
        return {str(x) for x in [b.year.pk, b.grade5.pk, b.maths.pk, b.section_a.pk, b.section_b.pk, b.student.pk,
                                 b.other_student.pk, b.teacher.pk, b.guardian.pk]}

    def test_member_of_a_cannot_open_school_b(self):
        for user in (self.a.admin, self.a.teacher_user, self.a.student_user, self.a.parent_user):
            client = self.client_for(user, self.b.school)
            for endpoint in self.LIST_ENDPOINTS + ["school", "setup-status", "admins"]:
                response = client.get(f"/api/{endpoint}/" if endpoint != "setup-status" else "/api/setup-status")
                self.assertEqual(response.status_code, 403, f"{user} reading {endpoint} in school B")

    def test_school_a_lists_never_include_school_b_rows(self):
        client = self.client_for(self.a.admin, self.a.school)
        leaked = set()
        for endpoint in self.LIST_ENDPOINTS:
            response = client.get(f"/api/{endpoint}/")
            self.assertEqual(response.status_code, 200, endpoint)
            leaked |= self.ids(response) & self.b_ids()
        self.assertEqual(leaked, set())

    def test_school_b_objects_are_not_found_from_school_a(self):
        client = self.client_for(self.a.admin, self.a.school)
        b = self.b
        for endpoint, pk in [("students", b.student.pk), ("teachers", b.teacher.pk), ("guardians", b.guardian.pk),
                             ("sections", b.section_a.pk), ("classes", b.grade5.pk), ("subjects", b.maths.pk),
                             ("academic-years", b.year.pk)]:
            self.assertEqual(client.get(f"/api/{endpoint}/{pk}/").status_code, 404, endpoint)
            self.assertEqual(client.patch(f"/api/{endpoint}/{pk}/", {"name": "x"}).status_code, 404, endpoint)

    def test_cannot_link_school_b_rows_from_school_a(self):
        client = self.client_for(self.a.admin, self.a.school)
        response = client.post("/api/students/", {"name": "New kid", "admission_no": "N1",
                                                  "section": str(self.b.section_a.pk)})
        self.assertEqual(response.status_code, 400)
        self.assertIn("section", response.data)
        response = client.post("/api/section-subjects/", {"section": str(self.a.section_b.pk),
                                                          "subject": str(self.a.maths.pk),
                                                          "teacher": str(self.b.teacher.pk)})
        self.assertEqual(response.status_code, 400)
        self.assertIn("teacher", response.data)
        response = client.post(f"/api/students/{self.a.student.pk}/guardians/",
                               {"guardian_id": str(self.b.guardian.pk)})
        self.assertEqual(response.status_code, 400)

    def test_unknown_school_is_404(self):
        client = self.client_for(self.a.admin)
        client.credentials(HTTP_X_SCHOOL="nowhere")
        self.assertEqual(client.get("/api/students/").status_code, 404)

    def test_school_from_subdomain(self):
        client = self.client_for(self.a.admin)
        response = client.get("/api/school/", HTTP_HOST="alpha.localhost")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["subdomain"], "alpha")
        self.assertEqual(client.get("/api/school/", HTTP_HOST="beta.localhost").status_code, 403)

    def test_paths_work_without_trailing_slash(self):
        client = self.client_for(self.a.admin, self.a.school)
        self.assertEqual(client.get("/api/students").status_code, 200)
        self.assertEqual(client.get(f"/api/students/{self.a.student.pk}/history").status_code, 200)

    def test_no_school_chosen(self):
        client = self.client_for(self.a.admin)
        response = client.get("/api/students/")
        self.assertEqual(response.status_code, 403)
        self.assertIn("Choose a school", str(response.data))
