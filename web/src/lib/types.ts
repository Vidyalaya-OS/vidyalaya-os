export type AcademicYear = { id: string; name: string; start_date: string; end_date: string; is_current: boolean };
export type SchoolClass = { id: string; name: string; order: number };
export type Subject = { id: string; name: string; code: string };
export type Section = {
  id: string;
  school_class: string;
  class_name: string;
  academic_year: string;
  academic_year_name: string;
  name: string;
  display_name: string;
  class_teacher: string | null;
  class_teacher_name: string | null;
  student_count: number;
};
export type SectionSubject = { id: string; section: string; subject: string; subject_name: string; teacher: string | null; teacher_name: string | null };

export type Enrollment = {
  id: string;
  section: string;
  section_name: string;
  academic_year: string;
  academic_year_name: string;
  roll_no: number | null;
  status: string;
  ended_on: string | null;
};
export type GuardianBrief = { id: string; name: string; email: string | null; phone: string | null; relation: string; is_primary: boolean };
export type Student = {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  login_status: string;
  admission_no: string;
  dob: string | null;
  gender: string;
  status: string;
  left_on: string | null;
  current_enrollment: Enrollment | null;
  guardians: GuardianBrief[];
};
export type Teacher = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  login_status: string;
  employee_no: string;
  qualification: string;
  joined_on: string | null;
  status: string;
  teaches: { section: string; section_name: string; subject: string; subject_name: string }[];
  class_teacher_of: { section: string; section_name: string }[];
};
export type Guardian = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  login_status: string;
  relation: string;
  children: { id: string; name: string; admission_no: string; section_name: string | null; is_primary: boolean }[];
};
export type SetupStatus = {
  current_academic_year: { id: string; name: string } | null;
  steps: { key: string; label: string; count: number; done: boolean }[];
  complete: boolean;
};
