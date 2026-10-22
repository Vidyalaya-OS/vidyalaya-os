"""Homework: teachers post, students and parents read, students mark done."""

import shutil
import tempfile
from datetime import timedelta

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings

from apps.tenancy.context import school_today

from .helpers import ApiTestCase, World

MEDIA = tempfile.mkdtemp()


@override_settings(MEDIA_ROOT=MEDIA)
class HomeworkTests(ApiTestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a = World("alpha")

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(MEDIA, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.teacher = self.client_for(self.a.teacher_user, self.a.school)
        self.due = (school_today() + timedelta(days=2)).isoformat()

    def post(self, section=None, **extra):
        return self.teacher.post("/api/homework/", {
            "section": str((section or self.a.section_a).pk), "subject": str(self.a.maths.pk),
            "title": "Fractions worksheet", "instructions": "Questions 1 to 10", "due_date": self.due, **extra})

    def test_teacher_posts_and_student_marks_done(self):
        response = self.post()
        self.assertEqual(response.status_code, 201, response.data)
        hw = response.data["id"]
        student = self.client_for(self.a.student_user, self.a.school)
        listing = student.get("/api/homework/?upcoming=true").data["results"]
        self.assertEqual([(h["title"], h["done"]) for h in listing], [("Fractions worksheet", False)])
        self.assertEqual(student.post(f"/api/homework/{hw}/done").data, {"done": True})
        self.assertTrue(student.get("/api/homework/").data["results"][0]["done"])
        parent = self.client_for(self.a.parent_user, self.a.school)
        rows = parent.get(f"/api/homework/?student={self.a.student.pk}").data["results"]
        self.assertTrue(rows[0]["done"])
        statuses = self.teacher.get(f"/api/homework/{hw}/statuses").data
        self.assertEqual([(s["name"], s["done"]) for s in statuses], [(self.a.student_user.name, True)])

    def test_only_for_sections_and_subjects_taught(self):
        self.assertEqual(self.post(section=self.a.section_b).status_code, 403)
        admin = self.client_for(self.a.admin, self.a.school)
        self.assertEqual(admin.post("/api/homework/", {}).status_code, 403)
        student = self.client_for(self.a.student_user, self.a.school)
        self.assertEqual(student.post("/api/homework/", {}).status_code, 403)

    def test_other_section_cannot_see_it(self):
        self.post()
        other = self.client_for(self.a.other_student_user, self.a.school)
        self.assertEqual(other.get("/api/homework/").data["results"], [])
        parent = self.client_for(self.a.parent_user, self.a.school)
        self.assertEqual(parent.get(f"/api/homework/?student={self.a.other_student.pk}").status_code, 403)

    def test_due_date_not_before_today(self):
        response = self.post(due_date=(school_today() - timedelta(days=1)).isoformat())
        self.assertEqual(response.status_code, 400)

    def test_attachments_are_served_only_to_members(self):
        upload = SimpleUploadedFile("sheet.txt", b"1/2 + 1/4 = ?", content_type="text/plain")
        response = self.teacher.post("/api/homework/", {
            "section": str(self.a.section_a.pk), "subject": str(self.a.maths.pk), "title": "With file",
            "due_date": self.due, "files": [upload]}, format="multipart")
        self.assertEqual(response.status_code, 201, response.data)
        url = response.data["attachments"][0]["url"]
        student = self.client_for(self.a.student_user, self.a.school)
        download = student.get(url)
        self.assertEqual(download.status_code, 200)
        self.assertEqual(b"".join(download.streaming_content), b"1/2 + 1/4 = ?")
        other = self.client_for(self.a.other_student_user, self.a.school)
        self.assertEqual(other.get(url).status_code, 404)
