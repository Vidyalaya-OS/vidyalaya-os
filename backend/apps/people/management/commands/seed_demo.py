"""Create a demo platform with two schools, for trying the app locally.

    python manage.py seed_demo

Everyone's password is the one printed at the end.
"""

from datetime import date

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.academics.models import AcademicYear, SchoolClass, Section, SectionSubject, Subject
from apps.accounts import services
from apps.accounts.models import Role, User
from apps.people.models import Enrollment, Guardian, Student, StudentGuardian, Teacher
from apps.tenancy.context import school_context
from apps.tenancy.models import School

PASSWORD = "Demo-pass-2026"


def person(name, email):
    user = User.objects.filter(email=email).first()
    if user is None:
        user = User.objects.create_user(email=email, name=name, password=PASSWORD, status=User.Status.ACTIVE)
    return user


class Command(BaseCommand):
    help = "Create demo schools and people (safe to run more than once)."

    @transaction.atomic
    def handle(self, *args, **options):
        owner = person("Platform Owner", "owner@demo.test")
        if not owner.is_platform_owner:
            owner.is_platform_owner = owner.is_staff = owner.is_superuser = True
            owner.save()

        for slug, name in (("greenvalley", "Green Valley Public School"), ("riverside", "Riverside Academy")):
            school, _ = School.objects.get_or_create(subdomain=slug, defaults={"name": name, "board": "CBSE"})
            with school_context(school):
                self.seed_school(school, slug)
        self.stdout.write(self.style.SUCCESS(f"Demo data ready. Password for every account: {PASSWORD}"))
        self.stdout.write("Platform owner: owner@demo.test")
        self.stdout.write("Green Valley: admin@greenvalley.test, teacher@greenvalley.test, "
                          "student1@greenvalley.test, parent1@greenvalley.test")

    def seed_school(self, school, slug):
        year, _ = AcademicYear.objects.get_or_create(
            name="2026-27", defaults={"start_date": date(2026, 4, 1), "end_date": date(2027, 3, 31),
                                      "is_current": True})
        admin = person(f"{school.name} Admin", f"admin@{slug}.test")
        services.grant_role(admin, Role.ADMIN)

        subjects = [Subject.objects.get_or_create(name=n, defaults={"code": n[:4].upper()})[0]
                    for n in ("English", "Maths", "Science", "Social Studies")]
        t_user = person("Anita Desai", f"teacher@{slug}.test")
        teacher, _ = Teacher.objects.get_or_create(user=t_user, defaults={"employee_no": "T001"})
        services.grant_role(t_user, Role.TEACHER)

        n = 0
        for order in (5, 6):
            klass, _ = SchoolClass.objects.get_or_create(name=f"Grade {order}", defaults={"order": order})
            for letter in ("A", "B"):
                section, _ = Section.objects.get_or_create(school_class=klass, academic_year=year, name=letter)
                if order == 5 and letter == "A":
                    section.class_teacher = teacher
                    section.save()
                    for subject in subjects[:2]:
                        SectionSubject.objects.get_or_create(section=section, subject=subject,
                                                             defaults={"teacher": teacher})
                for roll in (1, 2, 3):
                    n += 1
                    s_user = person(f"Student {n}", f"student{n}@{slug}.test")
                    student, created = Student.objects.get_or_create(user=s_user,
                                                                     defaults={"admission_no": f"ADM{n:04d}"})
                    services.grant_role(s_user, Role.STUDENT)
                    if created:
                        Enrollment.objects.create(student=student, section=section, academic_year=year,
                                                  roll_no=roll)
                    p_user = person(f"Parent {n}", f"parent{n}@{slug}.test")
                    guardian, _ = Guardian.objects.get_or_create(user=p_user, defaults={"relation": "Mother"})
                    services.grant_role(p_user, Role.PARENT)
                    StudentGuardian.objects.get_or_create(student=student, guardian=guardian,
                                                          defaults={"is_primary": True})
