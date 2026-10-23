"""The guided setup path for a school admin.

Steps run in the order a school is built: a year, then classes and their
sections, then subjects for each section, then teachers allocated to those
subjects, then the timetable, students, parents and fees. Each step says
whether it is done, what is still missing, and which steps must come first,
so the admin's home screen can always point at the one next thing to do.
"""

from django.db.models import Count, Q


def _plural(n, one, many=None):
    return f"{n} {one if n == 1 else (many or one + 's')}"


def setup_progress():
    from apps.academics.models import AcademicYear, SchoolClass, Section, SectionSubject, Subject
    from apps.fees.models import FeeStructure
    from apps.people.models import Enrollment, Guardian, Teacher

    year = AcademicYear.objects.filter(is_current=True).first()
    sections = (
        Section.objects.filter(academic_year=year).annotate(
            subjects=Count("section_subjects", distinct=True),
            entries=Count("timetable_entries", distinct=True),
        )
        if year else Section.objects.none()
    )
    section_rows = list(sections.values("id", "subjects", "entries", "class_teacher_id"))
    n_sections = len(section_rows)
    classes = SchoolClass.objects.annotate(
        here=Count("sections", filter=Q(sections__academic_year=year), distinct=True))
    n_classes = classes.count()
    classes_without_sections = classes.filter(here=0).count() if year else n_classes
    links = SectionSubject.objects.filter(section__academic_year=year) if year else SectionSubject.objects.none()
    n_links = links.count()
    unallocated = links.filter(teacher__isnull=True).count()
    with_subjects = sum(1 for s in section_rows if s["subjects"])
    with_class_teacher = sum(1 for s in section_rows if s["class_teacher_id"])
    with_timetable = sum(1 for s in section_rows if s["entries"])
    n_teachers = Teacher.objects.filter(status=Teacher.Status.ACTIVE).count()
    n_students = (Enrollment.objects.filter(academic_year=year, status=Enrollment.Status.ACTIVE).count()
                  if year else 0)
    n_parents = Guardian.objects.count()
    n_fees = FeeStructure.objects.filter(academic_year=year).count() if year else 0
    n_subjects = Subject.objects.count()

    steps = [
        {
            "key": "academic_year", "label": "Set the current academic year", "href": "/app/setup",
            "count": 1 if year else 0, "done": year is not None, "requires": [],
            "detail": f"{year.name} is the current year." if year else "Every class, fee and report belongs to a year.",
        },
        {
            "key": "classes", "label": "Create classes", "href": "/app/setup",
            "count": n_classes, "done": n_classes > 0, "requires": [],
            "detail": _plural(n_classes, "class", "classes") + " so far." if n_classes
            else "Add Grade 1, Grade 2 and so on, in order.",
        },
        {
            "key": "sections", "label": "Add sections to each class", "href": "/app/setup",
            "count": n_sections, "done": n_sections > 0, "requires": ["academic_year", "classes"],
            "detail": (f"{_plural(classes_without_sections, 'class', 'classes')} still without a section."
                       if n_sections and classes_without_sections
                       else f"{_plural(n_sections, 'section')} this year." if n_sections
                       else "Sections such as 5-A and 5-B hold the students."),
        },
        {
            "key": "subjects", "label": "Add subjects", "href": "/app/setup",
            "count": n_subjects, "done": n_subjects > 0, "requires": [],
            "detail": f"{_plural(n_subjects, 'subject')} in the school list." if n_subjects
            else "One list for the school: English, Maths, Science…",
        },
        {
            "key": "class_subjects", "label": "Assign subjects to every section", "href": "/app/setup#assign",
            "count": with_subjects, "done": n_sections > 0 and with_subjects == n_sections,
            "requires": ["sections", "subjects"],
            "detail": f"{with_subjects} of {_plural(n_sections, 'section')} have subjects." if n_sections
            else "Each section studies its own set of subjects.",
        },
        {
            "key": "teachers", "label": "Register teachers", "href": "/app/teachers",
            "count": n_teachers, "done": n_teachers > 0, "requires": [],
            "detail": f"{_plural(n_teachers, 'active teacher')}." if n_teachers
            else "Teachers get their own sign-in to mark attendance and enter marks.",
        },
        {
            "key": "subject_teachers", "label": "Allocate a teacher to every subject", "href": "/app/setup#assign",
            "count": n_links - unallocated, "done": n_links > 0 and unallocated == 0,
            "requires": ["class_subjects", "teachers"],
            "detail": (f"{_plural(unallocated, 'subject')} still without a teacher." if unallocated
                       else f"All {_plural(n_links, 'class subject')} have a teacher." if n_links
                       else "Who teaches Maths to 5-A? That teacher marks 5-A's attendance too."),
        },
        {
            "key": "class_teachers", "label": "Choose a class teacher for each section", "href": "/app/setup#sections",
            "count": with_class_teacher, "done": n_sections > 0 and with_class_teacher == n_sections,
            "requires": ["sections", "teachers"],
            "detail": f"{with_class_teacher} of {_plural(n_sections, 'section')} have a class teacher." if n_sections
            else "The class teacher takes the daily roll call.",
        },
        {
            "key": "timetable", "label": "Build the timetable", "href": "/app/timetable",
            "count": with_timetable, "done": n_sections > 0 and with_timetable == n_sections,
            "requires": ["subject_teachers"],
            "detail": f"{with_timetable} of {_plural(n_sections, 'section')} have a timetable." if n_sections
            else "Periods and who teaches what, day by day.",
        },
        {
            "key": "students", "label": "Enroll students", "href": "/app/students",
            "count": n_students, "done": n_students > 0, "requires": ["sections"],
            "detail": f"{_plural(n_students, 'student')} enrolled this year." if n_students
            else "Add them one by one or import a spreadsheet.",
        },
        {
            "key": "parents", "label": "Link parents", "href": "/app/parents",
            "count": n_parents, "done": n_parents > 0, "requires": ["students"],
            "detail": f"{_plural(n_parents, 'parent')} linked." if n_parents
            else "Parents see attendance, results and fees on their phone.",
        },
        {
            "key": "fees", "label": "Set up fees", "href": "/app/fees",
            "count": n_fees, "done": n_fees > 0, "requires": ["classes", "academic_year"],
            "detail": f"{_plural(n_fees, 'fee line')} for this year." if n_fees
            else "What each class pays, and when.",
        },
    ]
    # A step only counts once the steps it builds on are done, so the path
    # is followed in order. Requirements always point at earlier steps.
    done = set()
    for s in steps:
        s["ready"] = all(r in done for r in s["requires"])
        s["done"] = s["done"] and s["ready"]
        if s["done"]:
            done.add(s["key"])
    pending = [s for s in steps if not s["done"]]
    # The next step is the first one not done whose prerequisites are done.
    nxt = next((s for s in pending if s["ready"]), pending[0] if pending else None)
    return {
        "current_academic_year": {"id": str(year.id), "name": year.name} if year else None,
        "steps": steps,
        "done": len(done),
        "next": nxt["key"] if nxt else None,
        "complete": not pending,
    }
