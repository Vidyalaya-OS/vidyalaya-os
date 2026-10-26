import {
  Award, BookOpen, CalendarDays, ClipboardCheck, Clock, FileSpreadsheet, GraduationCap, HeartHandshake, House,
  Layers, Lightbulb, ShieldCheck, Upload, Users, Wallet,
} from "lucide-react";
import type { SceneKind } from "@/components/Scene3D";

export type Guide = {
  title: string;
  /** What the section is for, in a sentence or two. */
  purpose: string;
  /** How to use it, in order. */
  steps: string[];
  /** A rule the admin should know before acting. */
  rule?: string;
  next: { href: string; label: string };
  scene: SceneKind;
  icon: React.ComponentType<{ className?: string }>;
  hue: number;
};

/** The short explainer shown at the top of each admin section, keyed by its
 * address. The `next` links walk the admin through the school in a sensible
 * order: structure first, then people, then the daily work, then the office. */
export const ADMIN_GUIDES: Record<string, Guide> = {
  "/app": {
    title: "Home is your daily start",
    purpose: "Today's attendance, fee collection and the school's setup path in one place. Begin each school day here.",
    steps: [
      "Mark teacher attendance first. It is required every working day.",
      "Follow the setup path. It always points at the one next thing to do.",
      "Tap any number to open the section behind it.",
    ],
    next: { href: "/app/setup", label: "Classes & subjects" },
    scene: "orbit", icon: House, hue: 225,
  },
  "/app/calendar": {
    title: "One calendar for every date",
    purpose: "Homework due dates, tests and fee due dates on one month grid, so nothing clashes or is missed.",
    steps: [
      "Tap a day to see everything that is on.",
      "Move between months with the arrows.",
      "Dates come from the other sections: add a test in Tests & marks and it shows up here.",
    ],
    next: { href: "/app/timetable", label: "Timetable" },
    scene: "cube", icon: CalendarDays, hue: 200,
  },
  "/app/timetable": {
    title: "The weekly plan for every section",
    purpose: "Which subject, which teacher and which room, in every period of every day. Teachers and students see their own week from it.",
    steps: [
      "Set up the periods once: start and end times, and breaks.",
      "Pick a section and fill each day's periods with a subject.",
      "Check a teacher is not in two rooms at once; the app warns you.",
    ],
    rule: "Assign subjects and teachers in Classes & subjects first, so each period knows who teaches it.",
    next: { href: "/app/attendance", label: "Attendance" },
    scene: "stack", icon: Clock, hue: 190,
  },
  "/app/attendance": {
    title: "Two registers: teachers and students",
    purpose: "You mark the teachers every day. Each section's teachers mark its students. You can see every student report here, but you cannot change one.",
    steps: [
      "Each morning, open Teachers. Everyone starts present: tap who is absent, late or on leave, then save.",
      "Check Students today to see which sections their teachers have not marked yet.",
      "Use Below 75% to find students who need a call home.",
    ],
    rule: "Admins mark teachers only. Teachers mark students only. A teacher marked absent or on leave cannot take a roll call that day.",
    next: { href: "/app/homework", label: "Homework" },
    scene: "cube", icon: ClipboardCheck, hue: 150,
  },
  "/app/homework": {
    title: "Homework, set by teachers",
    purpose: "Teachers post homework for their sections. Students and parents see it with its due date, and students tick it off when done.",
    steps: [
      "Teachers post homework from their own portal.",
      "Here you can see what every section has been set, to keep the load fair.",
      "Due dates also appear on the Calendar.",
    ],
    next: { href: "/app/quizzes", label: "Quizzes" },
    scene: "stack", icon: BookOpen, hue: 30,
  },
  "/app/quizzes": {
    title: "Quizzes that mark themselves",
    purpose: "Short online quizzes. A teacher builds one, opens it for a time window, and sees the results as soon as students finish.",
    steps: [
      "Write multiple choice or true/false questions.",
      "Open the quiz to a section with a closing time.",
      "Read the results and which questions most students got wrong.",
    ],
    next: { href: "/app/exams", label: "Tests & marks" },
    scene: "orbit", icon: Lightbulb, hue: 45,
  },
  "/app/exams": {
    title: "Formal tests and their marks",
    purpose: "Create an exam term, add a test for each section and subject, let teachers enter marks, then publish them to students and parents.",
    steps: [
      "Create the term (such as Unit test 1) and the grade scale once.",
      "Add a test for each section and subject, with its maximum marks.",
      "The subject teacher enters marks. You publish them when they are complete.",
    ],
    rule: "Students and parents only see marks after they are published.",
    next: { href: "/app/report-cards", label: "Report cards" },
    scene: "bars", icon: FileSpreadsheet, hue: 265,
  },
  "/app/report-cards": {
    title: "Report cards, built for you",
    purpose: "A printable report for each student and term, made from published marks and attendance. Nothing to type twice.",
    steps: [
      "Publish the term's tests first.",
      "Pick a section and a term, then open a student's card.",
      "Print it or save it as a PDF. Parents see the same card in their portal.",
    ],
    next: { href: "/app/fees", label: "Fees" },
    scene: "bars", icon: Award, hue: 330,
  },
  "/app/fees": {
    title: "Fees from bill to receipt",
    purpose: "What each class pays, the bills for each student, payments at the counter and numbered receipts.",
    steps: [
      "Add fee heads (Tuition, Transport) and what each class pays, split into installments.",
      "Bill the students of a class.",
      "Record payments as they come in. Each one gets a receipt.",
      "Follow up overdue fees from Home, where parents' numbers are one tap away.",
    ],
    rule: "A payment is never edited or deleted. A mistake is reversed with a new entry, so the books always add up.",
    next: { href: "/app/students", label: "Students" },
    scene: "bars", icon: Wallet, hue: 160,
  },
  "/app/students": {
    title: "Every student's record",
    purpose: "Admission number, section, parents, attendance, results and fees for each student, in one record.",
    steps: [
      "Add a student and enroll them in a section. Sections must exist first.",
      "Link their parents so the parents can sign in.",
      "Open a student to see their whole record.",
    ],
    next: { href: "/app/parents", label: "Parents" },
    scene: "orbit", icon: GraduationCap, hue: 210,
  },
  "/app/teachers": {
    title: "Teachers and their sign-in",
    purpose: "Each teacher signs in to mark their sections' attendance, set homework and quizzes, and enter marks.",
    steps: [
      "Add a teacher with an email or phone. They get an invite to set a password.",
      "Allocate them to subjects, and make them a class teacher, in Classes & subjects.",
      "Mark their attendance every day in Attendance.",
    ],
    next: { href: "/app/setup#assign", label: "Allocate teachers" },
    scene: "orbit", icon: Users, hue: 250,
  },
  "/app/parents": {
    title: "Parents, linked to their children",
    purpose: "Parents see attendance, homework, results and fees on their phone. One parent can have several children.",
    steps: [
      "Add a parent and link one or more children.",
      "Parents sign in with a password, or a 6-digit code sent to them.",
      "A parent with two children switches between them in their portal.",
    ],
    next: { href: "/app/import", label: "Import" },
    scene: "orbit", icon: HeartHandshake, hue: 345,
  },
  "/app/setup": {
    title: "The skeleton of your school",
    purpose: "Attendance, the timetable, marks and fees all hang on classes, sections and subjects. Set them up first.",
    steps: [
      "Tap the year to edit it.",
      "Add class, or set up Class 1 to 12 in one go.",
      "Hover a card to edit or delete it.",
      "Tap a section to pick its class teacher.",
    ],
    next: { href: "/app/timetable", label: "Timetable" },
    scene: "stack", icon: Layers, hue: 230,
  },
  "/app/import": {
    title: "Bring many people in at once",
    purpose: "Add students, teachers or parents from an Excel or CSV file instead of one by one.",
    steps: [
      "Download the template for the kind of person you are adding.",
      "Fill one row per person. Sections must already exist.",
      "Upload, check the preview for errors, then import.",
    ],
    next: { href: "/app/admins", label: "Admins" },
    scene: "stack", icon: Upload, hue: 180,
  },
  "/app/admins": {
    title: "Who runs the school office",
    purpose: "Admins set up the school, mark teacher attendance, run fees and see every report.",
    steps: [
      "Invite another admin by email. They get a link to set a password.",
      "Give admin access to office staff only: admins can see everyone's records.",
      "Remove access when someone leaves.",
    ],
    next: { href: "/app", label: "Home" },
    scene: "orbit", icon: ShieldCheck, hue: 280,
  },
};
