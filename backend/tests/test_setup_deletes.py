from apps.academics.models import SchoolClass, Section, SectionSubject, Subject
from apps.tenancy.context import school_context

from .helpers import ApiTestCase, World


class SetupDeleteTests(ApiTestCase):
    def setUp(self):
        self.w = World("delly")
        self.admin = self.client_for(self.w.admin, self.w.school)

    def test_a_class_added_by_mistake_goes_with_its_empty_sections(self):
        with school_context(self.w.school):
            extra = SchoolClass.objects.create(name="Grade 9", order=9)
            Section.objects.create(school_class=extra, academic_year=self.w.year, name="A")
        response = self.admin.delete(f"/api/classes/{extra.id}/")
        self.assertEqual(response.status_code, 204)
        with school_context(self.w.school):
            self.assertFalse(SchoolClass.objects.filter(pk=extra.pk).exists())
            self.assertFalse(Section.objects.filter(school_class_id=extra.pk).exists())

    def test_a_class_with_students_is_kept_and_says_why(self):
        response = self.admin.delete(f"/api/classes/{self.w.grade5.id}/")
        self.assertEqual(response.status_code, 409)
        self.assertIn("students", response.data["detail"])
        with school_context(self.w.school):
            self.assertEqual(Section.objects.filter(school_class=self.w.grade5).count(), 2)

    def test_a_section_with_students_cannot_be_deleted(self):
        response = self.admin.delete(f"/api/sections/{self.w.section_a.id}/")
        self.assertEqual(response.status_code, 409)
        self.assertIn("section", response.data["detail"])

    def test_a_subject_comes_off_its_sections_when_deleted(self):
        response = self.admin.delete(f"/api/subjects/{self.w.maths.id}/")
        self.assertEqual(response.status_code, 204)
        with school_context(self.w.school):
            self.assertFalse(Subject.objects.filter(pk=self.w.maths.pk).exists())
            self.assertFalse(SectionSubject.objects.exists())

    def test_the_year_can_be_renamed(self):
        response = self.admin.patch(f"/api/academic-years/{self.w.year.id}/", {"name": "2026-2027"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["name"], "2026-2027")

    def test_teachers_cannot_delete(self):
        teacher = self.client_for(self.w.teacher_user, self.w.school)
        self.assertEqual(teacher.delete(f"/api/subjects/{self.w.maths.id}/").status_code, 403)
