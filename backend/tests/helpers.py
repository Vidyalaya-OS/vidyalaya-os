from datetime import date

from rest_framework.test import APIClient, APITestCase

from apps.academics.models import AcademicYear, SchoolClass, Section, SectionSubject, Subject
from apps.accounts import services
from apps.accounts.models import Role, User
from apps.people.models import Enrollment, Guardian, Student, StudentGuardian, Teacher
from apps.tenancy.context import school_context
from apps.tenancy.models import School

PASSWORD = "S3cure-pass-123"


def make_user(name, email=None, phone=None, password=PASSWORD, **extra):
    return User.objects.create_user(email=email, phone=phone, name=name, password=password,
                                    status=User.Status.ACTIVE, **extra)


class World:
    """A small school with one section, a teacher, two students and a parent."""

    def __init__(self, slug):
        self.school = School.objects.create(name=f"{slug.title()} School", subdomain=slug)
        with school_context(self.school):
            self.year = AcademicYear.objects.create(name="2026-27", start_date=date(2026, 4, 1),
                                                    end_date=date(2027, 3, 31), is_current=True)
            self.grade5 = SchoolClass.objects.create(name="Grade 5", order=5)
            self.section_a = Section.objects.create(school_class=self.grade5, academic_year=self.year, name="A")
            self.section_b = Section.objects.create(school_class=self.grade5, academic_year=self.year, name="B")
            self.maths = Subject.objects.create(name="Maths", code="MATH")

            self.admin = make_user(f"{slug} admin", f"admin@{slug}.test")
            services.grant_role(self.admin, Role.ADMIN)

            self.teacher_user = make_user(f"{slug} teacher", f"teacher@{slug}.test")
            self.teacher = Teacher.objects.create(user=self.teacher_user, employee_no="T1")
            services.grant_role(self.teacher_user, Role.TEACHER)
            SectionSubject.objects.create(section=self.section_a, subject=self.maths, teacher=self.teacher)

            self.student_user = make_user(f"{slug} student", f"student@{slug}.test")
            self.student = Student.objects.create(user=self.student_user, admission_no="A1")
            services.grant_role(self.student_user, Role.STUDENT)
            self.enrollment = Enrollment.objects.create(student=self.student, section=self.section_a,
                                                        academic_year=self.year, roll_no=1)

            # A second student in section B, not taught by the teacher.
            self.other_student_user = make_user(f"{slug} other student", f"other@{slug}.test")
            self.other_student = Student.objects.create(user=self.other_student_user, admission_no="B1")
            services.grant_role(self.other_student_user, Role.STUDENT)
            Enrollment.objects.create(student=self.other_student, section=self.section_b,
                                      academic_year=self.year, roll_no=1)

            self.parent_user = make_user(f"{slug} parent", f"parent@{slug}.test")
            self.guardian = Guardian.objects.create(user=self.parent_user, relation="Mother")
            services.grant_role(self.parent_user, Role.PARENT)
            StudentGuardian.objects.create(student=self.student, guardian=self.guardian, is_primary=True)


class ApiTestCase(APITestCase):
    def client_for(self, user, school=None):
        client = APIClient()
        client.force_authenticate(user)
        if school is not None:
            client.credentials(HTTP_X_SCHOOL=school.subdomain)
        return client

    @staticmethod
    def ids(response):
        data = response.data
        rows = data["results"] if isinstance(data, dict) and "results" in data else data
        return {str(row["id"]) for row in rows}
