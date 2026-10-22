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

export type Period = { id: string; name: string; start_time: string; end_time: string; order: number; is_break: boolean };
export type TimetableEntry = {
  id: string;
  section: string;
  section_name: string;
  day_of_week: number;
  day_name: string;
  period: string;
  period_name: string;
  start_time: string;
  end_time: string;
  subject: string;
  subject_name: string;
  teacher: string | null;
  teacher_name: string | null;
  room: string;
};

export type AttendanceStatus = "present" | "absent" | "late" | "leave";
export type AttendanceSummary = Record<AttendanceStatus, number> & { marked_days: number; attended: number; percentage: number | null };
export type AttendanceSheet = {
  section: string;
  section_name: string;
  date: string;
  marked: boolean;
  marked_by: string | null;
  updated_at: string | null;
  students: { enrollment: string; student: string; name: string; roll_no: number | null; admission_no: string; status: AttendanceStatus; remark: string; marked: boolean }[];
  summary: AttendanceSummary;
};
export type StudentAttendance = {
  student: string;
  name: string;
  month: string;
  first_day: string;
  last_day: string;
  days: { date: string; status: AttendanceStatus; remark: string }[];
  month_summary: AttendanceSummary;
  academic_year: string | null;
  year_summary: AttendanceSummary;
};

export type Homework = {
  id: string;
  section: string;
  section_name: string;
  subject: string;
  subject_name: string;
  teacher_name: string | null;
  title: string;
  instructions: string;
  assigned_on: string;
  due_date: string;
  attachments: { id: string; name: string; size: number; url: string }[];
  done: boolean | null;
  done_count?: number;
};

export type GradeBand = { min: number; grade: string };
export type GradeScale = { id: string; name: string; bands: GradeBand[]; is_default: boolean };
export type ExamTerm = {
  id: string;
  academic_year: string;
  academic_year_name: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  order: number;
  grade_scale: string | null;
  grade_scale_name: string | null;
};
export type Exam = {
  id: string;
  exam_term: string;
  exam_term_name: string;
  section: string;
  section_name: string;
  subject: string;
  subject_name: string;
  date: string | null;
  max_marks: string;
  pass_marks: string | null;
  status: "draft" | "published";
  published_at: string | null;
  marks_entered: number;
  students: number;
};
export type MarkRow = {
  enrollment: string;
  student: string;
  name: string;
  roll_no: number | null;
  admission_no: string;
  marks_obtained: string | null;
  is_absent: boolean;
  remark: string;
  entered: boolean;
};
export type SubjectResult = {
  exam: string;
  subject_name: string;
  date: string | null;
  max_marks: string;
  pass_marks: string | null;
  marks_obtained: string | null;
  is_absent: boolean;
  remark: string;
  percentage: number | null;
  grade: string | null;
  passed: boolean | null;
  class_average: number | null;
  highest: string | null;
  status: string;
};
export type TermResult = {
  exam_term: string;
  exam_term_name: string;
  subjects: SubjectResult[];
  total: string;
  total_max: string;
  percentage: number | null;
  grade: string | null;
  report_card_published?: boolean;
};
export type ReportCard = {
  school: { name: string; address: string; board: string; logo: string | null };
  student: { id: string; name: string; admission_no: string; dob: string | null; roll_no: number | null };
  section_name: string | null;
  class_teacher: string | null;
  academic_year: string;
  result: TermResult;
  attendance: AttendanceSummary;
  remarks: string;
  published_at: string | null;
  bands: GradeBand[];
};

export type FeeHead = { id: string; name: string; description: string; is_refundable: boolean };
export type Installment = { name: string; due_date: string; amount: string };
export type FeeStructure = {
  id: string;
  academic_year: string;
  school_class: string;
  class_name: string;
  fee_head: string;
  fee_head_name: string;
  amount: string;
  installments: Installment[];
  students_billed: number;
};
export type FeeDue = {
  id: string;
  student: string;
  fee_head: string;
  fee_head_name: string;
  installment_no: number;
  name: string;
  due_date: string;
  amount: string;
  discount: string;
  discount_reason: string;
  paid: string;
  remaining: string;
  is_overdue: boolean;
  from_structure: boolean;
};
export type Payment = {
  id: string;
  receipt_no: string;
  student: string;
  student_name: string;
  admission_no: string;
  academic_year: string;
  amount: string;
  paid_on: string;
  mode: string;
  reference: string;
  notes: string;
  received_by_name: string;
  allocations: { due: string; name: string; fee_head: string; amount: string }[];
  is_reversal: boolean;
  is_reversed: boolean;
  reverses_receipt_no: string | null;
  created_at: string;
};
export type FeeTotals = { due: string; discount: string; paid: string; remaining: string; overdue: string };
export type FeeStatement = {
  student: string;
  name: string;
  admission_no: string;
  academic_year: string;
  academic_year_name: string;
  currency: string;
  totals: FeeTotals & { next_due: { due: string; name: string; due_date: string; remaining: string } | null };
  dues: FeeDue[];
  payments: Payment[];
};
export type BalanceRow = FeeTotals & { student: string; name: string; admission_no: string; section_name: string; roll_no: number | null };

export type QuizState = "upcoming" | "open" | "closed";
export type Quiz = {
  id: string;
  section: string;
  section_name: string;
  subject: string;
  subject_name: string;
  topic_name: string | null;
  teacher_name: string | null;
  title: string;
  taught_on: string;
  opens_at: string;
  closes_at: string;
  state: QuizState;
  question_count: number;
  max_score: number;
  attempt_count?: number;
  student_count?: number;
  my_attempt: { score: number; max_score: number; submitted_at: string } | null;
};
export type QuizPaperQuestion = {
  id: string;
  type: "mcq" | "true_false";
  text: string;
  options: string[];
  marks: number;
  correct_option?: number;
  your_answer?: number | null;
  is_correct?: boolean;
};
export type QuizPaper = {
  quiz: Quiz;
  state: QuizState;
  answers_shown: boolean;
  attempt: { score: number; max_score: number; submitted_at: string } | null;
  questions: QuizPaperQuestion[];
};
export type QuizResults = {
  quiz: Quiz;
  attempted: number;
  students: number;
  average_score: number | null;
  max_score: number;
  scores: { student: string; name: string; roll_no: number | null; attempted: boolean; score: number | null; max_score: number | null; submitted_at: string | null }[];
  questions: { id: string; order: number; text: string; options: string[]; correct_option: number; marks: number; correct: number; wrong: number; percent_correct: number | null; choices: number[] }[];
  most_missed: string[];
};
export type BankQuestion = { id: string; subject: string; subject_name: string; topic: string | null; topic_name: string | null; type: "mcq" | "true_false"; text: string; options: string[]; correct_option: number };

export type DashQuiz = { id: string; title: string; subject_name: string; topic_name: string | null; opens_at: string; closes_at: string; state: QuizState; question_count: number; max_score: number };
export type DashScore = DashQuiz & { score: number; max_score: number; percentage: number | null; submitted_at: string };
export type DashChildProfile = { id: string; name: string; admission_no: string; section: string | null; section_name: string | null; roll_no: number | null; class_teacher: string | null };
export type DashHomework = { items: { id: string; title: string; subject_name: string; due_date: string; overdue: boolean }[]; pending: number; overdue: number };
export type DashTests = {
  latest: { exam: string; subject_name: string; exam_term: string; exam_term_name: string; date: string | null; max_marks: string; marks_obtained: string | null; is_absent: boolean; percentage: number | null; grade: string | null; class_average: number | null }[];
  report_cards: { exam_term: string; exam_term_name: string; published_at: string }[];
};
export type DashAttendance = { today: AttendanceStatus | null; month: string; month_summary: AttendanceSummary; year_summary: AttendanceSummary };
export type DashQuizzes = { pending: DashQuiz[]; upcoming: DashQuiz[]; recent_scores: DashScore[] };
export type StudentDashboard = {
  today: string;
  day_name: string;
  student: DashChildProfile;
  timetable: { id: string; period_name: string; start_time: string; end_time: string; subject_name: string; teacher_name: string | null; room: string }[];
  homework: DashHomework;
  quizzes: DashQuizzes;
  tests: DashTests;
  attendance: DashAttendance;
};
export type ChildSummary = {
  student: DashChildProfile;
  attendance: DashAttendance;
  homework: DashHomework;
  tests: DashTests;
  quizzes: DashQuizzes;
  fees: (FeeTotals & { academic_year_name: string; next_due: { due: string; name: string; due_date: string; remaining: string } | null }) | null;
  currency: string;
};
