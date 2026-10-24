import {
  Award, BellRing, BookOpen, Building2, CalendarDays, ChartNoAxesColumn, ClipboardCheck, Clock, Crown, FileSpreadsheet, GraduationCap,
  HeartHandshake, KeyRound, Layers, Lightbulb, LockKeyhole, MailCheck, ReceiptText, School, ShieldCheck, Smartphone, Upload, Users, Wallet,
} from "lucide-react-native";
import type { Icon } from "@/lib/nav";

// Everything the landing page says, the same words as the web's
// (web/src/components/landing/content.ts), kept apart from how it is drawn.

export type RoleKey = "owner" | "admin" | "teacher" | "student" | "parent";

export type RoleStory = {
  key: RoleKey;
  label: string;
  icon: Icon;
  /** The two ends of the role's gradient. */
  accent: [string, string];
  tagline: string;
  meaning: string;
  can: { icon: Icon; title: string; text: string }[];
  day: { time: string; text: string }[];
  signIn: string;
  preview: { title: string; rows: { label: string; value: string; tone?: "good" | "warn" | "bad" }[] };
};

export const ROLES: RoleStory[] = [
  {
    key: "owner",
    label: "Platform owner",
    icon: Crown,
    accent: ["#fbbf24", "#f97316"],
    tagline: "You run the platform that schools run on.",
    meaning:
      "The owner portal is your control room. You bring new schools on board, pick their plan, and keep an eye on how big each one is and how much fee it has collected. You never see a child's private record: only head counts and totals.",
    can: [
      { icon: Building2, title: "Onboard a school", text: "Name, web address, plan and first admin in four short steps. The admin gets an email invite." },
      { icon: ChartNoAxesColumn, title: "Watch every school", text: "Students, teachers and fees collected this year, school by school." },
      { icon: ShieldCheck, title: "Active, Suspend, Archive", text: "Suspend makes a school read-only; Archive closes it but keeps its data." },
      { icon: MailCheck, title: "Resend admin invite", text: "If the admin lost the email or the link ran out, send a fresh one." },
    ],
    day: [
      { time: "Morning", text: "A new school signs up. You onboard it in two minutes." },
      { time: "Afternoon", text: "A school's payment is late, so you suspend it. Its people can still look, but not change anything." },
      { time: "Evening", text: "You check which schools are growing fastest." },
    ],
    signIn: "Email and password. Platform owners are set up by the people who host the system.",
    preview: { title: "Schools", rows: [{ label: "Green Valley", value: "Active", tone: "good" }, { label: "Riverside Academy", value: "Active", tone: "good" }, { label: "Hill View", value: "Suspended", tone: "warn" }] },
  },
  {
    key: "admin",
    label: "School admin",
    icon: School,
    accent: ["#2f5bea", "#4f46e5"],
    tagline: "You run one school's office.",
    meaning:
      "The admin portal is the school office on a screen. You set up classes and subjects, add teachers, students and parents (one by one or from Excel), build the timetable, and keep track of fees. Your menu shows only the office and classroom sections an admin uses.",
    can: [
      { icon: Layers, title: "Set up the school", text: "Academic year, classes, sections, subjects and who teaches what." },
      { icon: Upload, title: "Add people fast", text: "Import students and teachers from Excel. Each gets an invite to set a password." },
      { icon: Wallet, title: "Fees and receipts", text: "Fee plans per class, record payments, print receipts, and see who is overdue with the parent's phone number." },
      { icon: ClipboardCheck, title: "See the whole day", text: "Which sections have marked attendance, and who is often absent." },
    ],
    day: [
      { time: "Morning", text: "Home shows 4 sections haven't marked attendance yet. You remind those teachers." },
      { time: "Afternoon", text: "A parent pays at the counter. You record it and hand over a receipt." },
      { time: "Evening", text: "You publish report cards for Grade 6." },
    ],
    signIn: "Email and password. Your first invite comes from the platform owner; you can invite more admins.",
    preview: { title: "Today", rows: [{ label: "Students", value: "412" }, { label: "Attendance", value: "94%", tone: "good" }, { label: "Overdue fees", value: "₹2.7L", tone: "bad" }] },
  },
  {
    key: "teacher",
    label: "Teacher",
    icon: Users,
    accent: ["#10b981", "#0d9488"],
    tagline: "You teach; the portal does the paperwork.",
    meaning:
      "The teacher portal puts your day on one screen: the classes you teach today, attendance still to mark, homework due and tests waiting for marks. Everything you enter reaches students and parents straight away.",
    can: [
      { icon: ClipboardCheck, title: "Attendance in seconds", text: "Everyone starts as present; tap the few who are absent or late." },
      { icon: BookOpen, title: "Homework", text: "Set it with a due date and file. It appears on each student's calendar." },
      { icon: Lightbulb, title: "Quizzes", text: "Build a quiz from a question bank. It marks itself, and you see who got what wrong." },
      { icon: FileSpreadsheet, title: "Tests and report cards", text: "Enter marks in a grid; grades and report cards are worked out for you." },
    ],
    day: [
      { time: "8:00", text: "Mark Grade 5-A attendance from your phone." },
      { time: "11:30", text: "Open a 10-question quiz for the class." },
      { time: "16:00", text: "See the quiz results and enter unit test marks." },
    ],
    signIn: "Email or phone and password, from the invite your school admin sends.",
    preview: { title: "Your day", rows: [{ label: "Classes today", value: "5" }, { label: "Attendance to mark", value: "1", tone: "warn" }, { label: "Marks to enter", value: "2", tone: "warn" }] },
  },
  {
    key: "student",
    label: "Student",
    icon: GraduationCap,
    accent: ["#0ea5e9", "#0891b2"],
    tagline: "Your timetable, homework and results, always with you.",
    meaning:
      "The student portal answers \"what do I have today?\" at a glance: your classes, homework due, quizzes to take, your latest marks against the class average, and your attendance.",
    can: [
      { icon: Clock, title: "Today's classes", text: "With the current class highlighted, on your phone." },
      { icon: BookOpen, title: "Homework", text: "What is due, what is late and what you finished." },
      { icon: Lightbulb, title: "Take quizzes", text: "Answer on any device and see your score and the right answers." },
      { icon: Award, title: "Results", text: "Marks per subject compared with the class average, and your report cards." },
    ],
    day: [
      { time: "7:30", text: "Check the timetable: science test today." },
      { time: "13:00", text: "Take the maths quiz on your phone. 8 out of 10." },
      { time: "19:00", text: "See tomorrow's homework on the calendar." },
    ],
    signIn: "Email or phone and password, from the invite your school sends. Younger students can use their parent's login.",
    preview: { title: "Today", rows: [{ label: "Quizzes to take", value: "1", tone: "warn" }, { label: "Homework due", value: "2" }, { label: "Attendance", value: "96%", tone: "good" }] },
  },
  {
    key: "parent",
    label: "Parent",
    icon: HeartHandshake,
    accent: ["#f43f5e", "#db2777"],
    tagline: "Know how your child is doing, without waiting for a meeting.",
    meaning:
      "The parent portal shows each of your children on one screen: whether they were in school today, homework, marks, quizzes and fees. With more than one child, switch between them at the top.",
    can: [
      { icon: CalendarDays, title: "Attendance", text: "A month calendar of present, absent and late days." },
      { icon: Award, title: "Marks and report cards", text: "Test results and report cards as soon as the school publishes them." },
      { icon: ReceiptText, title: "Fees and receipts", text: "What is billed, paid and still due, with every receipt." },
      { icon: Smartphone, title: "Sign in with a code", text: "No password to remember: we send a 6-digit code to your phone or email." },
    ],
    day: [
      { time: "9:15", text: "See that your daughter was marked present." },
      { time: "15:00", text: "Notice homework due tomorrow and remind her." },
      { time: "20:00", text: "Download last term's fee receipt." },
    ],
    signIn: "Password, or the Parent code: type your phone or email and we send a one-time 6-digit code.",
    preview: { title: "Aarav · Grade 5-A", rows: [{ label: "Today", value: "Present", tone: "good" }, { label: "Homework pending", value: "1", tone: "warn" }, { label: "Fees due", value: "₹0", tone: "good" }] },
  },
];

export const STEPS = [
  { icon: Crown, title: "The owner onboards the school", text: "One form creates the school's private space and emails its first admin." },
  { icon: School, title: "The admin sets it up", text: "Classes, subjects, timetable and fees; then teachers, students and parents are invited." },
  { icon: Users, title: "Teachers run the day", text: "Attendance, homework, quizzes and marks, from a phone or a computer." },
  { icon: HeartHandshake, title: "Students and parents follow along", text: "Everything appears for them straight away: no notes home, no lost diaries." },
];

export const FEATURES = [
  { icon: Clock, title: "Timetable", text: "Week and day views, each subject in its own colour, with the current class highlighted." },
  { icon: ClipboardCheck, title: "Attendance", text: "Fast daily marking, monthly reports and alerts for low attendance." },
  { icon: BookOpen, title: "Homework", text: "Set, attach files, track who submitted and what is overdue." },
  { icon: Lightbulb, title: "Quizzes", text: "Question bank by topic, timed quizzes, automatic marking and per-question results." },
  { icon: FileSpreadsheet, title: "Tests and marks", text: "Mark grids, grade scales and results per subject." },
  { icon: Award, title: "Report cards", text: "Term report cards with remarks, published to students and parents." },
  { icon: Wallet, title: "Fees", text: "Fee plans per class, installments, payments, receipts and overdue lists." },
  { icon: CalendarDays, title: "Calendar", text: "Homework, tests, quizzes and fee dates on one month view." },
];

export const TRUST = [
  { icon: LockKeyhole, title: "Each school is sealed off", text: "The database itself only shows a school's rows to that school, so one school can never see another's data." },
  { icon: KeyRound, title: "The right screens for each role", text: "Every request is checked against the person's role in that school, not just hidden in the menu." },
  { icon: BellRing, title: "A record of changes", text: "Important changes are written to an audit log that cannot be edited." },
];

export const FAQ = [
  {
    q: "What is the \"Parent code\" on the sign-in page?",
    a: "It is a way to sign in without a password. Type the email or phone number the school has for you and press \"Send me a code\". We send a 6-digit code that works once and only for 10 minutes. Type it in and you are signed in. It works for parent accounts only; admins, teachers and students sign in with their password.",
  },
  {
    q: "How do I get an account?",
    a: "Your school creates it. You get an email with an invite link; open it to set your password. Platform owners create each school's first admin, and admins invite everyone else.",
  },
  {
    q: "I have two children at the school. Do I need two logins?",
    a: "No. One login shows all your children, with a switcher at the top.",
  },
  {
    q: "I'm a teacher and a parent. What will I see?",
    a: "One login with both portals. Switch between Teacher and Parent at the top of the menu; the menu changes to match.",
  },
  {
    q: "Does it work on a phone?",
    a: "Yes. This app is made for phones and tablets, with bottom tabs and a menu drawer, and the same school works on a computer in the browser.",
  },
];
