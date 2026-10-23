"""Demo data, read from one config file (config/demo_data.json by default,
or the file named by DEMO_DATA_FILE).

`seed()` creates the demo platform: an owner, schools, people, a timetable,
attendance, homework, a test, fees and quizzes. It is safe to run more than
once. When DEMO_AUTOLOAD is on, `migrate` runs it on an empty database, so a
fresh install has something to look at straight away.
"""

import json
import logging
from datetime import date, time, timedelta
from functools import lru_cache
from pathlib import Path

from django.conf import settings
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger("apps.demo")


@lru_cache(maxsize=1)
def load_config(path=None):
    path = Path(path or getattr(settings, "DEMO_DATA_FILE", settings.BASE_DIR / "config" / "demo_data.json"))
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def demo_logins(config=None):
    """The demo accounts to offer on the sign-in page, one per role."""
    c = config or load_config()
    first = c["schools"][0]["subdomain"]
    return {
        "password": c["password"],
        "logins": [
            {"role": "owner", "label": "Owner", "email": c["owner"]["email"]},
            {"role": "admin", "label": "Admin", "email": f"admin@{first}.test"},
            {"role": "teacher", "label": "Teacher", "email": f"teacher@{first}.test"},
            {"role": "student", "label": "Student", "email": f"student1@{first}.test"},
            {"role": "parent", "label": "Parent", "email": f"parent1@{first}.test"},
        ],
    }


def autoload(sender=None, **kwargs):
    """post_migrate hook: seed the demo when asked to and the database has no schools."""
    if not getattr(settings, "DEMO_AUTOLOAD", False):
        return
    from apps.tenancy.models import School

    if School.objects.exists():
        return
    logger.info("Empty database and DEMO_AUTOLOAD is on: loading demo data.")
    seed()


def _hm(text):
    h, m = text.split(":")
    return time(int(h), int(m))


class DemoSeeder:
    """Builds the demo from the config. Each step uses get_or_create, so
    running it again fills gaps without making duplicates."""

    def __init__(self, config):
        self.c = config

    def person(self, name, email):
        from apps.accounts.models import User

        user = User.objects.filter(email=email).first()
        if user is None:
            user = User.objects.create_user(email=email, name=name, password=self.c["password"], status=User.Status.ACTIVE)
        return user

    @transaction.atomic
    def run(self):
        from apps.tenancy.context import school_context
        from apps.tenancy.models import School

        owner = self.person(self.c["owner"]["name"], self.c["owner"]["email"])
        if not owner.is_platform_owner:
            owner.is_platform_owner = owner.is_staff = owner.is_superuser = True
            owner.save()
        for s in self.c["schools"]:
            school, _ = School.objects.get_or_create(subdomain=s["subdomain"], defaults={"name": s["name"], "board": s.get("board", "")})
            with school_context(school):
                self.school(school, s["subdomain"])

    def school(self, school, slug):
        from apps.academics.models import AcademicYear, SchoolClass, Section, SectionSubject, Subject
        from apps.accounts import services
        from apps.accounts.models import Role
        from apps.people.models import Enrollment, Guardian, Student, StudentGuardian, Teacher

        y = self.c["academic_year"]
        year, _ = AcademicYear.objects.get_or_create(
            name=y["name"], defaults={"start_date": date.fromisoformat(y["start"]), "end_date": date.fromisoformat(y["end"]), "is_current": True})
        admin = self.person(f"{school.name} Admin", f"admin@{slug}.test")
        services.grant_role(admin, Role.ADMIN)

        subjects = [Subject.objects.get_or_create(name=n, defaults={"code": n[:4].upper()})[0] for n in self.c["subjects"]]
        t = self.c["teacher"]
        t_user = self.person(t["name"], f"teacher@{slug}.test")
        teacher, _ = Teacher.objects.get_or_create(user=t_user, defaults={"employee_no": t["employee_no"]})
        services.grant_role(t_user, Role.TEACHER)

        focus = self.c["focus_section"]
        n = 0
        for klass_cfg in self.c["classes"]:
            klass, _ = SchoolClass.objects.get_or_create(name=klass_cfg["name"], defaults={"order": klass_cfg["order"]})
            for letter in klass_cfg["sections"]:
                section, _ = Section.objects.get_or_create(school_class=klass, academic_year=year, name=letter)
                if klass_cfg["name"] == focus["class"] and letter == focus["section"]:
                    section.class_teacher = teacher
                    section.save()
                    for subject in subjects[: t["teaches_first"]]:
                        SectionSubject.objects.get_or_create(section=section, subject=subject, defaults={"teacher": teacher})
                for roll in range(1, self.c["students_per_section"] + 1):
                    n += 1
                    s_user = self.person(f"Student {n}", f"student{n}@{slug}.test")
                    student, created = Student.objects.get_or_create(user=s_user, defaults={"admission_no": f"ADM{n:04d}"})
                    services.grant_role(s_user, Role.STUDENT)
                    if created:
                        Enrollment.objects.create(student=student, section=section, academic_year=year, roll_no=roll)
                    p_user = self.person(f"Parent {n}", f"parent{n}@{slug}.test")
                    guardian, _ = Guardian.objects.get_or_create(user=p_user, defaults={"relation": self.c["guardian_relation"]})
                    services.grant_role(p_user, Role.PARENT)
                    StudentGuardian.objects.get_or_create(student=student, guardian=guardian, defaults={"is_primary": True})
        self.academics(year, admin, teacher, {s.name: s for s in subjects})

    def academics(self, year, admin, teacher, subjects):
        """A timetable, attendance, homework, a test, fees and quizzes for the focus section."""
        from apps.academics.models import SchoolClass, Section, SectionSubject
        from apps.attendance.models import AttendanceRecord
        from apps.exams.models import Exam, ExamTerm, Mark
        from apps.fees import services as fee_services
        from apps.fees.models import FeeHead, FeeStructure, Payment
        from apps.fees.money import to_minor
        from apps.homework.models import Homework
        from apps.people.models import Enrollment
        from apps.tenancy.context import school_today
        from apps.timetable.models import Period, TimetableEntry

        today = school_today()
        focus = self.c["focus_section"]
        section = Section.objects.get(academic_year=year, school_class__name=focus["class"], name=focus["section"])
        ordered = list(subjects.values())
        periods = [
            Period.objects.get_or_create(name=f"Period {i}", defaults={"start_time": _hm(a), "end_time": _hm(b), "order": i})[0]
            for i, (a, b) in enumerate(self.c["periods"], start=1)
        ]
        for day in range(1, 6):
            for i, period in enumerate(periods):
                subject = ordered[(day + i) % len(ordered)]
                link = SectionSubject.objects.filter(section=section, subject=subject).first()
                TimetableEntry.objects.get_or_create(section=section, day_of_week=day, period=period, defaults={
                    "subject": subject, "teacher": link.teacher if link else None})

        enrollments = list(Enrollment.objects.filter(section=section, status=Enrollment.Status.ACTIVE))
        for back in range(1, self.c["attendance_days_back"] + 1):
            day = today - timedelta(days=back)
            if day.isoweekday() > 5 or day < year.start_date:
                continue
            for n, e in enumerate(enrollments):
                status = "absent" if (n + back) % 6 == 0 else "late" if (n + back) % 9 == 0 else "present"
                AttendanceRecord.objects.get_or_create(enrollment=e, date=day, defaults={"status": status, "marked_by": teacher.user})

        hw = self.c["homework"]
        Homework.objects.get_or_create(section=section, subject=subjects[hw["subject"]], title=hw["title"], defaults={
            "teacher": teacher, "instructions": hw["instructions"], "assigned_on": today,
            "due_date": today + timedelta(days=hw["due_in_days"]), "created_by": teacher.user})

        terms = {name: ExamTerm.objects.get_or_create(academic_year=year, name=name, defaults={"order": i})[0]
                 for i, name in enumerate(self.c["exam_terms"], start=1)}
        ex = self.c["exam"]
        exam, created = Exam.objects.get_or_create(exam_term=terms[ex["term"]], section=section, subject=subjects[ex["subject"]],
                                                   defaults={"max_marks": ex["max_marks"], "date": today - timedelta(days=ex["days_ago"])})
        if created:
            for n, e in enumerate(enrollments):
                Mark.objects.create(exam=exam, enrollment=e, marks_obtained=min(ex["max_marks"], ex["first_mark"] + n * ex["mark_step"]),
                                    entered_by=teacher.user)
            exam.status, exam.published_at = Exam.Status.PUBLISHED, exam.created_at
            exam.save(update_fields=["status", "published_at"])

        heads = {name: FeeHead.objects.get_or_create(name=name)[0] for name in self.c["fee_heads"]}
        fee = self.c["tuition"]
        installments = [{"name": i["name"], "due_date": i["due"], "amount": to_minor(i["amount"])} for i in fee["installments"]]
        for klass in SchoolClass.objects.all():
            FeeStructure.objects.get_or_create(academic_year=year, school_class=klass, fee_head=heads[fee["head"]], defaults={
                "amount": sum(i["amount"] for i in installments), "installments": installments})
        fee_services.generate_dues(year)
        if enrollments and fee.get("first_student_paid") and not Payment.objects.filter(student=enrollments[0].student).exists():
            fee_services.record_payment(student=enrollments[0].student, year=year, amount=to_minor(fee["first_student_paid"]),
                                        paid_on=today, mode="cash", received_by=admin)
        self.quizzes(section, teacher, subjects, enrollments)

    def quizzes(self, section, teacher, subjects, enrollments):
        """An open quiz for today's lesson, and yesterday's, closed and taken by most of the class."""
        from apps.quizzes.models import Question, Quiz, QuizAnswer, QuizAttempt, QuizQuestion, Topic
        from apps.tenancy.context import school_today

        if Quiz.objects.filter(section=section).exists():
            return
        qc = self.c["quiz"]
        subject = subjects[qc["subject"]]
        today, now = school_today(), timezone.now()
        topic, _ = Topic.objects.get_or_create(subject=subject, school_class=section.school_class, name=qc["topic"])
        bank = [Question.objects.create(subject=subject, topic=topic, type=q["type"], text=q["text"], options=q["options"],
                                        correct_option=q["answer"], teacher=teacher, created_by=teacher.user)
                for q in qc["questions"]]

        def quiz(title, taught_on, opens, closes, items):
            q = Quiz.objects.create(section=section, subject=subject, topic=topic, teacher=teacher, title=title,
                                    taught_on=taught_on, opens_at=opens, closes_at=closes, created_by=teacher.user)
            for order, question in enumerate(items, start=1):
                QuizQuestion.objects.create(quiz=q, question=question, order=order, marks=1)
            return q

        quiz(qc["open"]["title"], today, now - timedelta(minutes=5), now + timedelta(days=1), [bank[i] for i in qc["open"]["questions"]])
        closed_items = [bank[i] for i in qc["closed"]["questions"]]
        done = quiz(qc["closed"]["title"], today - timedelta(days=1), now - timedelta(days=1), now - timedelta(hours=1), closed_items)
        for n, e in enumerate(enrollments[:-1], start=1):
            picks = [q.correct_option if (n + i) % 3 else 0 for i, q in enumerate(closed_items)]
            score = sum(1 for q, p in zip(closed_items, picks) if p == q.correct_option)
            attempt = QuizAttempt.objects.create(quiz=done, student=e.student, started_at=now - timedelta(hours=20),
                                                 submitted_at=now - timedelta(hours=20), score=score, max_score=len(closed_items))
            for q, p in zip(closed_items, picks):
                QuizAnswer.objects.create(attempt=attempt, question=q, answer=p, is_correct=p == q.correct_option)


def seed(config=None):
    """Create (or top up) the demo platform. Returns the config used."""
    c = config or load_config()
    DemoSeeder(c).run()
    return c
