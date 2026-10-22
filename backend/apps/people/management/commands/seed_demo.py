"""Create a demo platform with two schools, for trying the app locally.

    python manage.py seed_demo

Everyone's password is the one printed at the end.
"""

from datetime import date, time, timedelta

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.academics.models import AcademicYear, SchoolClass, Section, SectionSubject, Subject
from apps.accounts import services
from apps.accounts.models import Role, User
from apps.people.models import Enrollment, Guardian, Student, StudentGuardian, Teacher
from apps.attendance.models import AttendanceRecord
from apps.exams.models import Exam, ExamTerm, Mark
from apps.fees import services as fee_services
from apps.fees.models import FeeHead, FeeStructure, Payment
from apps.homework.models import Homework
from apps.tenancy.context import school_context, school_today
from apps.timetable.models import Period, TimetableEntry
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
        self.seed_academics(year, admin, teacher, subjects)

    def seed_academics(self, year, admin, teacher, subjects):
        """A timetable, a week of attendance, homework, a test and fees for Grade 5-A."""
        today = school_today()
        section = Section.objects.get(academic_year=year, school_class__name="Grade 5", name="A")
        slots = [(time(8, 0), time(8, 45)), (time(8, 45), time(9, 30)), (time(9, 45), time(10, 30)),
                 (time(10, 30), time(11, 15))]
        periods = [
            Period.objects.get_or_create(name=f"Period {i}", defaults={"start_time": start, "end_time": end,
                                                                      "order": i})[0]
            for i, (start, end) in enumerate(slots, start=1)
        ]
        for day in range(1, 6):
            for i, period in enumerate(periods):
                subject = subjects[(day + i) % len(subjects)]
                link = SectionSubject.objects.filter(section=section, subject=subject).first()
                TimetableEntry.objects.get_or_create(section=section, day_of_week=day, period=period, defaults={
                    "subject": subject, "teacher": link.teacher if link else None})

        enrollments = list(Enrollment.objects.filter(section=section, status=Enrollment.Status.ACTIVE))
        for back in range(1, 8):
            day = today - timedelta(days=back)
            if day.isoweekday() > 5 or day < year.start_date:
                continue
            for n, e in enumerate(enrollments):
                status = "absent" if (n + back) % 6 == 0 else "late" if (n + back) % 9 == 0 else "present"
                AttendanceRecord.objects.get_or_create(enrollment=e, date=day,
                                                       defaults={"status": status, "marked_by": teacher.user})

        Homework.objects.get_or_create(section=section, subject=subjects[1], title="Fractions worksheet", defaults={
            "teacher": teacher, "instructions": "Do questions 1 to 10 on page 42.", "assigned_on": today,
            "due_date": today + timedelta(days=2), "created_by": teacher.user})

        term, _ = ExamTerm.objects.get_or_create(academic_year=year, name="Unit test 1", defaults={"order": 1})
        ExamTerm.objects.get_or_create(academic_year=year, name="Half-yearly", defaults={"order": 2})
        exam, created = Exam.objects.get_or_create(exam_term=term, section=section, subject=subjects[1],
                                                   defaults={"max_marks": 50, "date": today - timedelta(days=14)})
        if created:
            for n, e in enumerate(enrollments):
                Mark.objects.create(exam=exam, enrollment=e, marks_obtained=30 + n * 7, entered_by=teacher.user)
            exam.status, exam.published_at = Exam.Status.PUBLISHED, exam.created_at
            exam.save(update_fields=["status", "published_at"])

        tuition, _ = FeeHead.objects.get_or_create(name="Tuition")
        FeeHead.objects.get_or_create(name="Transport")
        for klass in SchoolClass.objects.all():
            FeeStructure.objects.get_or_create(
                academic_year=year, school_class=klass, fee_head=tuition, defaults={
                    "amount": 2400000, "installments": [
                        {"name": "Term 1", "due_date": year.start_date.replace(day=15).isoformat(), "amount": 1200000},
                        {"name": "Term 2", "due_date": date(year.start_date.year, 10, 15).isoformat(),
                         "amount": 1200000}]})
        fee_services.generate_dues(year)
        if enrollments and not Payment.objects.filter(student=enrollments[0].student).exists():
            fee_services.record_payment(student=enrollments[0].student, year=year, amount=1200000,
                                        paid_on=today, mode="cash", received_by=admin)
