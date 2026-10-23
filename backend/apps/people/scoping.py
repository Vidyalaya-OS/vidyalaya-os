"""Which rows a logged-in member may see, by role.

Row-level security already limits every query to the current school; these
helpers narrow it further to a teacher's classes, a student's own record or a
parent's children.
"""

from django.db.models import Q

from apps.accounts.models import Role
from apps.accounts.permissions import roles_in_current_school

from .models import Enrollment, Guardian, Student, Teacher


def has_role(request, *roles):
    return bool(roles_in_current_school(request) & set(roles))


def teacher_for(request):
    return Teacher.objects.filter(user=request.user, status=Teacher.Status.ACTIVE).first()


def student_for(request):
    return Student.objects.filter(user=request.user).first()


def guardian_for(request):
    return Guardian.objects.filter(user=request.user).first()


def teacher_section_ids(teacher):
    """Sections a teacher is class teacher of, or teaches a subject in."""
    from apps.academics.models import Section

    if teacher is None:
        return set()
    return set(
        Section.objects.filter(Q(class_teacher=teacher) | Q(section_subjects__teacher=teacher)).values_list(
            "id", flat=True
        )
    )


def own_section_ids(request):
    """Sections of the user's own active enrollment (student) and children's (parent)."""
    ids = set()
    if has_role(request, Role.STUDENT):
        student = student_for(request)
        if student:
            ids |= set(
                Enrollment.objects.filter(student=student, status=Enrollment.Status.ACTIVE).values_list(
                    "section_id", flat=True
                )
            )
    if has_role(request, Role.PARENT):
        guardian = guardian_for(request)
        if guardian:
            ids |= set(
                Enrollment.objects.filter(
                    student__guardian_links__guardian=guardian, status=Enrollment.Status.ACTIVE
                ).values_list("section_id", flat=True)
            )
    return ids


def visible_students(request):
    """Students this member may read."""
    qs = Student.objects.all()
    if has_role(request, Role.ADMIN):
        return qs
    q = Q(pk__in=[])
    if has_role(request, Role.TEACHER):
        q |= Q(
            enrollments__section_id__in=teacher_section_ids(teacher_for(request)),
            enrollments__status=Enrollment.Status.ACTIVE,
        )
    if has_role(request, Role.STUDENT):
        q |= Q(user=request.user)
    if has_role(request, Role.PARENT):
        guardian = guardian_for(request)
        if guardian:
            q |= Q(guardian_links__guardian=guardian)
    return qs.filter(q).distinct()


def teacher_subject_pairs(teacher):
    """(section_id, subject_id) pairs a teacher teaches."""
    from apps.academics.models import SectionSubject

    if teacher is None:
        return set()
    return set(SectionSubject.objects.filter(teacher=teacher).values_list("section_id", "subject_id"))


def class_teacher_section_ids(teacher):
    from apps.academics.models import Section

    if teacher is None:
        return set()
    return set(Section.objects.filter(class_teacher=teacher).values_list("id", flat=True))


def own_student_ids(request):
    """The student's own record and a parent's children."""
    ids = set()
    if has_role(request, Role.STUDENT):
        student = student_for(request)
        if student:
            ids.add(student.id)
    if has_role(request, Role.PARENT):
        guardian = guardian_for(request)
        if guardian:
            ids |= set(guardian.child_links.values_list("student_id", flat=True))
    return ids


def can_manage_section(request, section_id):
    """Admins, and teachers who teach or are class teacher of the section."""
    if has_role(request, Role.ADMIN):
        return True
    return has_role(request, Role.TEACHER) and section_id in teacher_section_ids(teacher_for(request))


def can_teach(request, section_id, subject_id):
    """Admins, the subject's teacher in that section, or the section's class teacher."""
    if has_role(request, Role.ADMIN):
        return True
    if not has_role(request, Role.TEACHER):
        return False
    teacher = teacher_for(request)
    return (section_id, subject_id) in teacher_subject_pairs(teacher) or section_id in class_teacher_section_ids(
        teacher
    )


def active_enrollments(section_id):
    return (
        Enrollment.objects.filter(section_id=section_id, status=Enrollment.Status.ACTIVE)
        .select_related("student__user")
        .order_by("roll_no", "student__user__name")
    )
