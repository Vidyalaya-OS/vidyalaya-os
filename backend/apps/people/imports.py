"""Bulk registration from a spreadsheet (CSV or Excel).

Every row is checked first. If any row has a problem, nothing is saved and
the response lists each problem by row number, so the admin can fix the file
and upload it again. Use ?dry_run=true to check a file without saving.
"""

import csv
import io
from datetime import date, datetime

from django.db import transaction
from django.http import HttpResponse
from rest_framework import serializers, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academics.models import AcademicYear, Section
from apps.accounts import audit, services
from apps.accounts.models import Role, User, normalize_email, normalize_phone
from apps.accounts.permissions import IsSchoolAdmin

from .models import Enrollment, Student, Teacher
from .serializers import ensure_guardian, link_guardian

MAX_ROWS = 5000

STUDENT_COLUMNS = [
    "admission_no", "name", "class", "section", "roll_no", "dob", "gender", "email", "phone",
    "guardian_name", "guardian_relation", "guardian_email", "guardian_phone",
]
STUDENT_REQUIRED = ["admission_no", "name", "class", "section"]

TEACHER_COLUMNS = ["name", "email", "phone", "employee_no", "qualification", "joined_on"]
TEACHER_REQUIRED = ["name"]


class SpreadsheetError(Exception):
    pass


def read_rows(upload):
    """Return a list of dicts with lowercase, underscored headers."""
    name = (upload.name or "").lower()
    if name.endswith((".xlsx", ".xlsm")):
        from openpyxl import load_workbook

        try:
            sheet = load_workbook(upload, read_only=True, data_only=True).active
        except Exception as exc:  # openpyxl raises many kinds of errors for bad files
            raise SpreadsheetError("This Excel file could not be read.") from exc
        values = list(sheet.iter_rows(values_only=True))
    elif name.endswith(".csv"):
        try:
            text = upload.read().decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise SpreadsheetError("Save the CSV file as UTF-8 and upload it again.") from exc
        values = list(csv.reader(io.StringIO(text)))
    else:
        raise SpreadsheetError("Upload a .csv or .xlsx file.")
    values = [row for row in values if any(cell not in (None, "") for cell in row)]
    if not values:
        raise SpreadsheetError("The file is empty.")
    headers = [str(h or "").strip().lower().replace(" ", "_") for h in values[0]]
    if len(values) - 1 > MAX_ROWS:
        raise SpreadsheetError(f"Upload at most {MAX_ROWS} rows at a time.")
    rows = []
    for raw in values[1:]:
        row = {}
        for header, cell in zip(headers, raw):
            if not header:
                continue
            if isinstance(cell, datetime):
                cell = cell.date()
            row[header] = cell if isinstance(cell, date) else str(cell if cell is not None else "").strip()
        rows.append(row)
    return headers, rows


def parse_date(value):
    if not value:
        return None
    if isinstance(value, date):
        return value
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"'{value}' is not a date. Use YYYY-MM-DD or DD/MM/YYYY.")


def parse_int(value):
    if value in (None, ""):
        return None
    try:
        number = int(float(value))
    except ValueError:
        raise ValueError(f"'{value}' is not a whole number.") from None
    if number < 1:
        raise ValueError("Must be 1 or more.")
    return number


def check_email(value):
    value = normalize_email(value)
    if value:
        serializers.EmailField().run_validation(value)
    return value


class BaseImportView(APIView):
    permission_classes = [IsSchoolAdmin]
    parser_classes = [MultiPartParser, FormParser]
    columns, required, template_name = [], [], ""

    def get(self, request):
        """Download an empty template with the right columns."""
        response = HttpResponse(",".join(self.columns) + "\n", content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="{self.template_name}"'
        return response

    def post(self, request):
        upload = request.FILES.get("file")
        if upload is None:
            return Response({"detail": "Attach the spreadsheet as 'file'."}, status=400)
        try:
            headers, rows = read_rows(upload)
        except SpreadsheetError as exc:
            return Response({"detail": str(exc)}, status=400)
        missing = [c for c in self.required if c not in headers]
        if missing:
            return Response({"detail": f"Missing columns: {', '.join(missing)}.", "columns": self.columns}, status=400)

        errors, parsed = [], []
        context = self.prepare()
        for number, row in enumerate(rows, start=2):  # row 1 is the header
            row_errors = {}
            for col in self.required:
                if not row.get(col):
                    row_errors[col] = "Required."
            if not row_errors:
                try:
                    parsed.append((number, self.validate_row(row, row_errors, context)))
                except serializers.ValidationError as exc:
                    row_errors["row"] = exc.detail
            if row_errors:
                errors.append({"row": number, "errors": row_errors})
        if errors:
            return Response({"detail": "Nothing was saved. Fix these rows and upload again.", "errors": errors},
                            status=400)
        if request.query_params.get("dry_run") in ("1", "true", "yes"):
            return Response({"valid": True, "rows": len(parsed), "saved": 0})
        send = request.query_params.get("send_invites", "true") not in ("0", "false", "no")
        with transaction.atomic():
            for _, data in parsed:
                self.save_row(data, send)
            audit.record(request.user, f"import.{self.template_name.split('.')[0]}", after={"rows": len(parsed)})
        return Response({"valid": True, "rows": len(parsed), "saved": len(parsed)}, status=status.HTTP_201_CREATED)


class StudentImportView(BaseImportView):
    columns, required, template_name = STUDENT_COLUMNS, STUDENT_REQUIRED, "students.csv"

    def prepare(self):
        year = AcademicYear.objects.filter(is_current=True).first()
        if year is None:
            raise serializers.ValidationError({"detail": "Set the current academic year before importing students."})
        sections = {
            (s.school_class.name.strip().lower(), s.name.strip().lower()): s
            for s in Section.objects.filter(academic_year=year).select_related("school_class")
        }
        return {
            "sections": sections,
            "admission_nos": {a.lower() for a in Student.objects.values_list("admission_no", flat=True)},
            "taken_rolls": set(
                Enrollment.objects.filter(academic_year=year, status=Enrollment.Status.ACTIVE, roll_no__isnull=False)
                .values_list("section_id", "roll_no")
            ),
            "seen_admission": set(),
            "seen_rolls": set(),
            "seen_contacts": set(),
        }

    def validate_row(self, row, errors, ctx):
        admission_no = row["admission_no"]
        key = admission_no.lower()
        if key in ctx["admission_nos"]:
            errors["admission_no"] = "A student with this admission number already exists."
        elif key in ctx["seen_admission"]:
            errors["admission_no"] = "This admission number appears twice in the file."
        ctx["seen_admission"].add(key)

        section = ctx["sections"].get((row["class"].lower(), row["section"].lower()))
        if section is None:
            errors["section"] = f"No section {row['class']}-{row['section']} in the current year."

        data = {"row": row, "section": section}
        for field, parser in (("dob", parse_date), ("roll_no", parse_int)):
            try:
                data[field] = parser(row.get(field))
            except ValueError as exc:
                errors[field] = str(exc)
        if section and data.get("roll_no"):
            pair = (section.id, data["roll_no"])
            if pair in ctx["taken_rolls"] or pair in ctx["seen_rolls"]:
                errors["roll_no"] = f"Roll number {data['roll_no']} is already taken in {section}."
            ctx["seen_rolls"].add(pair)

        gender = (row.get("gender") or "").lower()
        aliases = {"f": "female", "m": "male", "girl": "female", "boy": "male"}
        gender = aliases.get(gender, gender)
        if gender and gender not in Student.Gender.values:
            errors["gender"] = "Use female, male or other."
        data["gender"] = gender

        for prefix in ("", "guardian_"):
            try:
                data[f"{prefix}email"] = check_email(row.get(f"{prefix}email"))
            except serializers.ValidationError:
                errors[f"{prefix}email"] = "Not a valid email."
            data[f"{prefix}phone"] = normalize_phone(row.get(f"{prefix}phone"))

        if data.get("email") or data.get("phone"):
            for contact in filter(None, (data.get("email"), data.get("phone"))):
                if contact in ctx["seen_contacts"]:
                    errors["email"] = f"{contact} is used by two students in the file."
                ctx["seen_contacts"].add(contact)
            existing = User.objects.filter(email=data["email"]).first() if data.get("email") else None
            if existing and Student.objects.filter(user=existing).exists():
                errors["email"] = "This email already belongs to a student in this school."

        if row.get("guardian_name") and not (data.get("guardian_email") or data.get("guardian_phone")):
            errors["guardian_email"] = "A parent needs an email or phone number."
        if (data.get("guardian_email") or data.get("guardian_phone")) and not row.get("guardian_name"):
            errors["guardian_name"] = "Give the parent's name."
        return data

    def save_row(self, data, send):
        row = data["row"]
        user, _ = services.find_or_create_user(row["name"], data.get("email"), data.get("phone"),
                                               require_contact=False)
        student = Student.objects.create(user=user, admission_no=row["admission_no"], dob=data.get("dob"),
                                         gender=data.get("gender", ""))
        services.grant_role(user, Role.STUDENT)
        section = data["section"]
        Enrollment.objects.create(student=student, section=section, academic_year=section.academic_year,
                                  roll_no=data.get("roll_no"))
        if row.get("guardian_name"):
            guardian = ensure_guardian(
                {"name": row["guardian_name"], "email": data.get("guardian_email"),
                 "phone": data.get("guardian_phone"), "relation": row.get("guardian_relation", "")},
                invite=send,
            )
            link_guardian(student, guardian, is_primary=True)
        if send:
            services.send_invite(user)


class TeacherImportView(BaseImportView):
    columns, required, template_name = TEACHER_COLUMNS, TEACHER_REQUIRED, "teachers.csv"

    def prepare(self):
        return {
            "employee_nos": {e.lower() for e in Teacher.objects.exclude(employee_no="").values_list(
                "employee_no", flat=True)},
            "seen_employee": set(),
            "seen_contacts": set(),
        }

    def validate_row(self, row, errors, ctx):
        data = {"row": row}
        try:
            data["email"] = check_email(row.get("email"))
        except serializers.ValidationError:
            errors["email"] = "Not a valid email."
        data["phone"] = normalize_phone(row.get("phone"))
        if not (data.get("email") or data.get("phone")) and "email" not in errors:
            errors["email"] = "A teacher needs an email or phone number."
        for contact in filter(None, (data.get("email"), data.get("phone"))):
            if contact in ctx["seen_contacts"]:
                errors["email"] = f"{contact} appears twice in the file."
            ctx["seen_contacts"].add(contact)
        existing = User.objects.filter(email=data["email"]).first() if data.get("email") else None
        if existing and Teacher.objects.filter(user=existing).exists():
            errors["email"] = "This person is already a teacher here."
        employee_no = (row.get("employee_no") or "").strip()
        if employee_no:
            if employee_no.lower() in ctx["employee_nos"] or employee_no.lower() in ctx["seen_employee"]:
                errors["employee_no"] = "This employee number is already used."
            ctx["seen_employee"].add(employee_no.lower())
        data["employee_no"] = employee_no
        try:
            data["joined_on"] = parse_date(row.get("joined_on"))
        except ValueError as exc:
            errors["joined_on"] = str(exc)
        return data

    def save_row(self, data, send):
        row = data["row"]
        user, _ = services.find_or_create_user(row["name"], data.get("email"), data.get("phone"))
        Teacher.objects.create(user=user, employee_no=data["employee_no"],
                               qualification=row.get("qualification", ""), joined_on=data.get("joined_on"))
        services.grant_role(user, Role.TEACHER)
        if send:
            services.send_invite(user)
