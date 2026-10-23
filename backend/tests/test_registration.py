from datetime import date

from django.core import mail

from apps.academics.models import AcademicYear, Section
from apps.accounts.models import Role, SchoolMembership, User
from apps.people.models import Enrollment, Guardian, Student
from apps.tenancy.context import school_context

from .helpers import ApiTestCase, World


class StudentRegistrationTests(ApiTestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a = World("alpha")

    def setUp(self):
        self.client = self.client_for(self.a.admin, self.a.school)

    def test_register_student_with_new_parent(self):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post("/api/students/", {
                "name": "Aarav Kumar", "admission_no": "2026-001", "dob": "2016-05-04", "gender": "male",
                "section": str(self.a.section_a.pk), "roll_no": 2,
                "guardian_list": [{"name": "Meera Kumar", "phone": "+91 90000 00001", "relation": "Mother",
                                   "is_primary": True}],
            })
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["current_enrollment"]["section_name"], "Grade 5-A")
        self.assertEqual(response.data["current_enrollment"]["roll_no"], 2)
        self.assertEqual(response.data["guardians"][0]["name"], "Meera Kumar")
        self.assertIsNone(response.data["email"])
        parent = User.objects.get(phone="+919000000001")
        with school_context(self.a.school):
            self.assertTrue(SchoolMembership.objects.filter(user=parent, role=Role.PARENT).exists())
        # The parent was invited (by SMS, logged); the student has no contact so no invite.
        self.assertEqual(len(mail.outbox), 0)

    def test_existing_parent_gets_a_second_child(self):
        response = self.client.post("/api/students/", {
            "name": "Sibling", "admission_no": "S2", "section": str(self.a.section_b.pk),
            "guardian_list": [{"guardian_id": str(self.a.guardian.pk)}],
        })
        self.assertEqual(response.status_code, 201, response.data)
        parent = self.client_for(self.a.parent_user, self.a.school)
        self.assertEqual({c["admission_no"] for c in parent.get("/api/my-children").data}, {"A1", "S2"})

    def test_parent_already_known_by_email_is_reused(self):
        response = self.client.post("/api/students/", {
            "name": "Kid", "admission_no": "K1",
            "guardian_list": [{"name": "Different spelling", "email": "PARENT@alpha.test"}],
        })
        self.assertEqual(response.status_code, 201, response.data)
        with school_context(self.a.school):
            self.assertEqual(Guardian.objects.count(), 1)

    def test_validation(self):
        dup = self.client.post("/api/students/", {"name": "X", "admission_no": "a1"})
        self.assertEqual(dup.status_code, 400)
        self.assertIn("admission_no", dup.data)
        roll = self.client.post("/api/students/", {"name": "X", "admission_no": "X1",
                                                   "section": str(self.a.section_a.pk), "roll_no": 1})
        self.assertEqual(roll.status_code, 400)
        self.assertIn("roll_no", roll.data)
        parent = self.client.post("/api/students/", {"name": "X", "admission_no": "X2",
                                                     "guardian_list": [{"name": "No contact"}]})
        self.assertEqual(parent.status_code, 400)
        teacher_as_student = self.client.post("/api/students/", {"name": "X", "admission_no": "X3",
                                                                 "email": "student@alpha.test"})
        self.assertEqual(teacher_as_student.status_code, 400)

    def test_teacher_who_is_also_a_parent(self):
        response = self.client.post("/api/students/", {
            "name": "Teacher's kid", "admission_no": "TK1",
            "guardian_list": [{"name": "Same teacher", "email": "teacher@alpha.test"}],
        })
        self.assertEqual(response.status_code, 201, response.data)
        with school_context(self.a.school):
            roles = set(SchoolMembership.objects.filter(user=self.a.teacher_user).values_list("role", flat=True))
        self.assertEqual(roles, {"teacher", "parent"})

    def test_update_student_and_add_email_sends_invite(self):
        no_contact = self.client.post("/api/students/", {"name": "Quiet", "admission_no": "Q1"}).data
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.patch(f"/api/students/{no_contact['id']}/", {"email": "quiet@alpha.test",
                                                                               "name": "Quiet Kid"})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["name"], "Quiet Kid")
        self.assertEqual(len(mail.outbox), 1)
        taken = self.client.patch(f"/api/students/{no_contact['id']}/", {"email": "parent@alpha.test"})
        self.assertEqual(taken.status_code, 400)

    def test_move_between_sections_keeps_history(self):
        response = self.client.post(f"/api/students/{self.a.student.pk}/move/",
                                    {"section": str(self.a.section_b.pk), "roll_no": 7})
        self.assertEqual(response.status_code, 201, response.data)
        history = self.client.get(f"/api/students/{self.a.student.pk}/history/").data
        self.assertEqual([(h["section_name"], h["status"]) for h in history],
                         [("Grade 5-B", "active"), ("Grade 5-A", "transferred")])
        # The teacher of 5-A no longer sees the student.
        teacher = self.client_for(self.a.teacher_user, self.a.school)
        self.assertEqual(self.ids(teacher.get("/api/students/")), set())

    def test_leave_and_rejoin(self):
        response = self.client.post(f"/api/students/{self.a.student.pk}/leave/", {"left_on": "2026-10-01"})
        self.assertEqual(response.data["status"], "left")
        with school_context(self.a.school):
            self.assertFalse(SchoolMembership.objects.get(user=self.a.student_user, role="student").is_active)
            self.assertEqual(Enrollment.objects.get(pk=self.a.enrollment.pk).status, "left")
        self.assertEqual(self.client.post(f"/api/students/{self.a.student.pk}/rejoin/").data["status"], "active")

    def test_year_end_promotion(self):
        with school_context(self.a.school):
            next_year = AcademicYear.objects.create(name="2027-28", start_date=date(2027, 4, 1),
                                                    end_date=date(2028, 3, 31))
            grade6 = self.a.grade5.__class__.objects.create(name="Grade 6", order=6)
            six_a = Section.objects.create(school_class=grade6, academic_year=next_year, name="A")
        same_year = self.client.post("/api/students/promote/", {"from_section": str(self.a.section_a.pk),
                                                                "to_section": str(self.a.section_b.pk)})
        self.assertEqual(same_year.status_code, 400)
        response = self.client.post("/api/students/promote/", {"from_section": str(self.a.section_a.pk),
                                                               "to_section": str(six_a.pk),
                                                               "keep_roll_numbers": True})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["promoted"], [str(self.a.student.pk)])
        with school_context(self.a.school):
            new = Enrollment.objects.get(student=self.a.student, academic_year=next_year)
            self.assertEqual((new.section_id, new.roll_no, new.status), (six_a.pk, 1, "active"))
            self.assertEqual(Enrollment.objects.get(pk=self.a.enrollment.pk).status, "promoted")
        again = self.client.post("/api/students/promote/", {"from_section": str(self.a.section_a.pk),
                                                            "to_section": str(six_a.pk)})
        self.assertEqual(again.data["promoted"], [])

    def test_link_and_unlink_parent(self):
        response = self.client.post(f"/api/students/{self.a.other_student.pk}/guardians/",
                                    {"guardian_id": str(self.a.guardian.pk)})
        self.assertEqual(response.status_code, 201)
        response = self.client.delete(f"/api/students/{self.a.other_student.pk}/guardians/{self.a.guardian.pk}/")
        self.assertEqual(response.status_code, 204)

    def test_search_and_filter(self):
        self.assertEqual(self.ids(self.client.get("/api/students/?search=other")), {str(self.a.other_student.pk)})
        self.assertEqual(self.ids(self.client.get(f"/api/students/?section={self.a.section_a.pk}")),
                         {str(self.a.student.pk)})


class TeacherAndParentRegistrationTests(ApiTestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a = World("alpha")

    def setUp(self):
        self.client = self.client_for(self.a.admin, self.a.school)

    def test_register_teacher_with_assignments(self):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post("/api/teachers/", {
                "name": "Ravi Iyer", "email": "ravi@alpha.test", "employee_no": "T2",
                "assignments": [{"section": str(self.a.section_b.pk), "subject": str(self.a.maths.pk)}],
            })
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["teaches"][0]["section_name"], "Grade 5-B")
        self.assertEqual(response.data["login_status"], "invited")
        self.assertEqual(len(mail.outbox), 1)
        ravi = User.objects.get(email="ravi@alpha.test")
        teacher = self.client_for(ravi, self.a.school)
        self.assertEqual(self.ids(teacher.get("/api/students/")), {str(self.a.other_student.pk)})

    def test_teacher_needs_contact_and_unique_employee_no(self):
        self.assertEqual(self.client.post("/api/teachers/", {"name": "No contact"}).status_code, 400)
        response = self.client.post("/api/teachers/", {"name": "Dup", "email": "dup@alpha.test",
                                                       "employee_no": "t1"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("employee_no", response.data)

    def test_teacher_leaves(self):
        response = self.client.post(f"/api/teachers/{self.a.teacher.pk}/leave/")
        self.assertEqual(response.data["status"], "left")
        self.assertEqual(response.data["teaches"], [])
        teacher = self.client_for(self.a.teacher_user, self.a.school)
        self.assertEqual(teacher.get("/api/students/").status_code, 403)

    def test_register_parent_with_children(self):
        response = self.client.post("/api/guardians/", {
            "name": "Father", "phone": "9000000002", "relation": "Father",
            "child_ids": [str(self.a.student.pk), str(self.a.other_student.pk)],
        })
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual({c["admission_no"] for c in response.data["children"]}, {"A1", "B1"})

    def test_class_teacher_and_subject_assignment(self):
        response = self.client.patch(f"/api/sections/{self.a.section_b.pk}/",
                                     {"class_teacher": str(self.a.teacher.pk)})
        self.assertEqual(response.data["class_teacher_name"], "alpha teacher")
        teacher = self.client_for(self.a.teacher_user, self.a.school)
        self.assertEqual(len(self.ids(teacher.get("/api/students/"))), 2)

    def test_school_admins(self):
        response = self.client.post("/api/admins/", {"name": "Second admin", "email": "admin2@alpha.test"})
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(len(self.client.get("/api/admins/").data), 2)
        self.assertEqual(self.client.delete(f"/api/admins/{response.data['id']}/").status_code, 204)
        self.assertEqual(self.client.delete(f"/api/admins/{self.a.admin.pk}/").status_code, 400)

    def test_resend_invite(self):
        with self.captureOnCommitCallbacks(execute=True):
            created = self.client.post("/api/teachers/", {"name": "New", "email": "new@alpha.test"}).data
            response = self.client.post(f"/api/teachers/{created['id']}/resend-invite/")
        self.assertTrue(response.data["sent"])
        self.assertEqual(len(mail.outbox), 2)
        already = self.client.post(f"/api/teachers/{self.a.teacher.pk}/resend-invite/")
        self.assertFalse(already.data["sent"])


class AcademicSetupTests(ApiTestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a = World("alpha")

    def setUp(self):
        self.client = self.client_for(self.a.admin, self.a.school)

    def test_one_current_year(self):
        response = self.client.post("/api/academic-years/", {"name": "2027-28", "start_date": "2027-04-01",
                                                             "end_date": "2028-03-31", "is_current": True})
        self.assertEqual(response.status_code, 201)
        with school_context(self.a.school):
            self.assertEqual(list(AcademicYear.objects.filter(is_current=True).values_list("name", flat=True)),
                             ["2027-28"])
        bad = self.client.post("/api/academic-years/", {"name": "x", "start_date": "2027-04-01",
                                                        "end_date": "2027-01-01"})
        self.assertEqual(bad.status_code, 400)

    def test_duplicate_section_is_a_clear_error(self):
        response = self.client.post("/api/sections/", {"school_class": str(self.a.grade5.pk),
                                                       "academic_year": str(self.a.year.pk), "name": "A"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("name", response.data)

    def test_class_in_use_cannot_be_deleted(self):
        self.assertEqual(self.client.delete(f"/api/classes/{self.a.grade5.pk}/").status_code, 409)

    def test_setup_status_follows_the_path(self):
        response = self.client.get("/api/setup-status")
        steps = {s["key"]: s for s in response.data["steps"]}
        self.assertEqual([k for k in steps][:5], ["academic_year", "classes", "sections", "subjects", "class_subjects"])
        for key in ["academic_year", "classes", "sections", "subjects", "teachers", "students", "parents"]:
            self.assertTrue(steps[key]["done"], key)
        # Section B has no subjects yet, so assigning subjects is the next step.
        self.assertFalse(steps["class_subjects"]["done"])
        self.assertEqual(steps["class_subjects"]["detail"], "1 of 2 sections have subjects.")
        self.assertEqual(response.data["next"], "class_subjects")
        self.assertFalse(steps["timetable"]["ready"])
        self.assertEqual(response.data["current_academic_year"]["name"], "2026-27")

        link = self.client.post("/api/section-subjects/", {"section": str(self.a.section_b.pk),
                                                           "subject": str(self.a.maths.pk)})
        self.assertEqual(link.status_code, 201, link.data)
        data = self.client.get("/api/setup-status").data
        steps = {s["key"]: s for s in data["steps"]}
        self.assertTrue(steps["class_subjects"]["done"])
        self.assertEqual(steps["subject_teachers"]["detail"], "1 subject still without a teacher.")
        self.assertEqual(data["next"], "subject_teachers")
