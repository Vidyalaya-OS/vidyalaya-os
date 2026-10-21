"""Each role sees only what the permission matrix allows."""

from .helpers import ApiTestCase, World


class RoleScopeTests(ApiTestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a = World("alpha")

    def get_ids(self, user, endpoint):
        response = self.client_for(user, self.a.school).get(f"/api/{endpoint}/")
        return response.status_code, (self.ids(response) if response.status_code == 200 else None)

    def test_students_visibility(self):
        a = self.a
        both = {str(a.student.pk), str(a.other_student.pk)}
        self.assertEqual(self.get_ids(a.admin, "students"), (200, both))
        # The teacher teaches section A only.
        self.assertEqual(self.get_ids(a.teacher_user, "students"), (200, {str(a.student.pk)}))
        self.assertEqual(self.get_ids(a.student_user, "students"), (200, {str(a.student.pk)}))
        self.assertEqual(self.get_ids(a.other_student_user, "students"), (200, {str(a.other_student.pk)}))
        self.assertEqual(self.get_ids(a.parent_user, "students"), (200, {str(a.student.pk)}))

    def test_student_cannot_open_a_classmate(self):
        client = self.client_for(self.a.student_user, self.a.school)
        self.assertEqual(client.get(f"/api/students/{self.a.other_student.pk}/").status_code, 404)

    def test_teachers_visibility(self):
        a = self.a
        self.assertEqual(self.get_ids(a.admin, "teachers"), (200, {str(a.teacher.pk)}))
        self.assertEqual(self.get_ids(a.teacher_user, "teachers"), (200, {str(a.teacher.pk)}))
        self.assertEqual(self.get_ids(a.student_user, "teachers")[0], 403)
        self.assertEqual(self.get_ids(a.parent_user, "teachers")[0], 403)

    def test_guardians_visibility(self):
        a = self.a
        self.assertEqual(self.get_ids(a.admin, "guardians"), (200, {str(a.guardian.pk)}))
        self.assertEqual(self.get_ids(a.teacher_user, "guardians"), (200, {str(a.guardian.pk)}))
        self.assertEqual(self.get_ids(a.parent_user, "guardians"), (200, {str(a.guardian.pk)}))
        self.assertEqual(self.get_ids(a.student_user, "guardians")[0], 403)

    def test_sections_visibility(self):
        a = self.a
        both = {str(a.section_a.pk), str(a.section_b.pk)}
        self.assertEqual(self.get_ids(a.admin, "sections"), (200, both))
        self.assertEqual(self.get_ids(a.teacher_user, "sections"), (200, both))
        self.assertEqual(self.get_ids(a.student_user, "sections"), (200, {str(a.section_a.pk)}))
        self.assertEqual(self.get_ids(a.parent_user, "sections"), (200, {str(a.section_a.pk)}))

    def test_only_admins_write(self):
        a = self.a
        payloads = {
            "students": {"name": "Kid", "admission_no": "Z9"},
            "teachers": {"name": "T", "email": "t2@alpha.test"},
            "guardians": {"name": "P", "email": "p2@alpha.test"},
            "classes": {"name": "Grade 9", "order": 9},
            "subjects": {"name": "Art"},
        }
        for user in (a.teacher_user, a.student_user, a.parent_user):
            client = self.client_for(user, a.school)
            for endpoint, body in payloads.items():
                self.assertEqual(client.post(f"/api/{endpoint}/", body).status_code, 403, f"{user} -> {endpoint}")
            self.assertEqual(client.patch(f"/api/students/{a.student.pk}/", {"name": "x"}).status_code, 403)
            self.assertEqual(self.client_for(user, a.school).get("/api/setup-status").status_code, 403)
            self.assertEqual(self.client_for(user, a.school).get("/api/imports/students").status_code, 403)

    def test_my_children(self):
        response = self.client_for(self.a.parent_user, self.a.school).get("/api/my-children")
        self.assertEqual([c["admission_no"] for c in response.data], ["A1"])
        self.assertEqual(self.client_for(self.a.student_user, self.a.school).get("/api/my-children").status_code,
                         403)

    def test_people_are_never_deleted(self):
        client = self.client_for(self.a.admin, self.a.school)
        self.assertEqual(client.delete(f"/api/students/{self.a.student.pk}/").status_code, 405)
        self.assertEqual(client.delete(f"/api/teachers/{self.a.teacher.pk}/").status_code, 405)
