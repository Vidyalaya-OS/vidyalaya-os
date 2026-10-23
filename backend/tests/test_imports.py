from django.core.files.uploadedfile import SimpleUploadedFile
from openpyxl import Workbook
import io

from apps.people.models import Guardian, Student, Teacher
from apps.tenancy.context import school_context

from .helpers import ApiTestCase, World

HEADER = "admission_no,name,class,section,roll_no,dob,gender,email,phone,guardian_name,guardian_relation," \
         "guardian_email,guardian_phone\n"


def csv_file(text, name="students.csv"):
    return SimpleUploadedFile(name, text.encode(), content_type="text/csv")


class StudentImportTests(ApiTestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a = World("alpha")

    def setUp(self):
        self.client = self.client_for(self.a.admin, self.a.school)

    def upload(self, text, query="", name="students.csv"):
        return self.client.post(f"/api/imports/students{query}", {"file": csv_file(text, name)}, format="multipart")

    def test_template(self):
        response = self.client.get("/api/imports/students")
        self.assertEqual(response.content.decode().strip(), HEADER.strip())

    def test_valid_file_is_saved(self):
        text = HEADER + (
            "S10,Anya Rao,Grade 5,A,5,2016-01-31,F,,,Kiran Rao,Father,kiran@x.test,\n"
            "S11,Dev Rao,grade 5,b,,31/12/2015,boy,,,Kiran Rao,Father,kiran@x.test,\n"
        )
        response = self.upload(text)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["saved"], 2)
        with school_context(self.a.school):
            anya = Student.objects.get(admission_no="S10")
            self.assertEqual((anya.gender, str(anya.dob)), ("female", "2016-01-31"))
            self.assertEqual(anya.current_enrollment.roll_no, 5)
            # One parent, linked to both children.
            kiran = Guardian.objects.get(user__email="kiran@x.test")
            self.assertEqual(kiran.children.count(), 2)

    def test_any_error_saves_nothing(self):
        text = HEADER + (
            "S10,Good Row,Grade 5,A,,,,,,,,,\n"
            "A1,Duplicate admission,Grade 5,A,,,,,,,,,\n"
            "S12,Bad section,Grade 9,Z,,,,,,,,,\n"
            "S13,Bad date,Grade 5,A,1,32/13/2015,,,,,,,\n"
            "S10,Repeat in file,Grade 5,B,,,,,,,,,\n"
            "S14,,Grade 5,A,,,,,,,,,\n"
            "S15,No parent contact,Grade 5,A,,,,,,Someone,,,\n"
        )
        response = self.upload(text)
        self.assertEqual(response.status_code, 400)
        problems = {e["row"]: set(e["errors"]) for e in response.data["errors"]}
        self.assertEqual(problems, {3: {"admission_no"}, 4: {"section"}, 5: {"dob", "roll_no"},
                                    6: {"admission_no"}, 7: {"name"}, 8: {"guardian_email"}})
        with school_context(self.a.school):
            self.assertFalse(Student.objects.filter(admission_no="S10").exists())

    def test_dry_run(self):
        response = self.upload(HEADER + "S20,Check Only,Grade 5,A,,,,,,,,,\n", "?dry_run=true")
        self.assertEqual(response.data, {"valid": True, "rows": 1, "saved": 0})
        with school_context(self.a.school):
            self.assertFalse(Student.objects.filter(admission_no="S20").exists())

    def test_missing_columns_and_bad_files(self):
        self.assertEqual(self.upload("name\nX\n").status_code, 400)
        self.assertEqual(self.upload("x", name="students.pdf").status_code, 400)
        self.assertEqual(self.upload("").status_code, 400)

    def test_excel_file(self):
        book = Workbook()
        sheet = book.active
        sheet.append(["Admission No", "Name", "Class", "Section", "Roll No"])
        sheet.append(["X1", "Excel Kid", "Grade 5", "A", 9])
        buffer = io.BytesIO()
        book.save(buffer)
        upload = SimpleUploadedFile("students.xlsx", buffer.getvalue())
        response = self.client.post("/api/imports/students", {"file": upload}, format="multipart")
        self.assertEqual(response.status_code, 201, response.data)


class TeacherImportTests(ApiTestCase):
    @classmethod
    def setUpTestData(cls):
        cls.a = World("alpha")

    def test_import_teachers(self):
        client = self.client_for(self.a.admin, self.a.school)
        text = ("name,email,phone,employee_no,qualification,joined_on\n"
                "Sita,sita@alpha.test,,T5,MSc,2024-06-01\n"
                "Gita,,+91 90000 11111,,BEd,\n")
        response = client.post("/api/imports/teachers", {"file": csv_file(text, "t.csv")}, format="multipart")
        self.assertEqual(response.status_code, 201, response.data)
        with school_context(self.a.school):
            self.assertEqual(Teacher.objects.count(), 3)
        bad = ("name,email,phone,employee_no\n"
               "No contact,,,\n"
               "Dup emp,x@alpha.test,,T1\n")
        response = client.post("/api/imports/teachers", {"file": csv_file(bad, "t.csv")}, format="multipart")
        self.assertEqual({e["row"] for e in response.data["errors"]}, {2, 3})
