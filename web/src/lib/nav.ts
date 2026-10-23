import {
  Award, BookOpen, CalendarDays, ClipboardCheck, Clock, FileSpreadsheet, GraduationCap, HeartHandshake, House,
  Layers, Lightbulb, ShieldCheck, TrendingUp, Upload, Users, Wallet,
} from "lucide-react";
import type { NavGroup, NavItem } from "@/components/AppShell";
import type { Role } from "./api";

type Item = NavItem & { roles: Role[] };

const ALL: Role[] = ["admin", "teacher", "student", "parent"];

const OVERVIEW: Item[] = [
  { href: "/app", label: "Home", icon: House, roles: ALL, exact: true },
  { href: "/app/calendar", label: "Calendar", icon: CalendarDays, roles: ALL },
];
const CLASSROOM: Item[] = [
  { href: "/app/timetable", label: "Timetable", icon: Clock, roles: ALL },
  { href: "/app/attendance", label: "Attendance", icon: ClipboardCheck, roles: ["admin", "teacher"] },
  { href: "/app/homework", label: "Homework", icon: BookOpen, roles: ALL },
  { href: "/app/quizzes", label: "Quizzes", icon: Lightbulb, roles: ALL },
  { href: "/app/exams", label: "Tests & marks", icon: FileSpreadsheet, roles: ["admin", "teacher"] },
  { href: "/app/report-cards", label: "Report cards", icon: Award, roles: ["admin", "teacher"] },
];
const RECORD: Item[] = [
  { href: "/app/my/attendance", label: "Attendance", icon: ClipboardCheck, roles: ["student", "parent"] },
  { href: "/app/my/results", label: "Results & report cards", icon: TrendingUp, roles: ["student", "parent"] },
  { href: "/app/my/fees", label: "Fees", icon: Wallet, roles: ["student", "parent"] },
];
const OFFICE: Item[] = [
  { href: "/app/fees", label: "Fees", icon: Wallet, roles: ["admin"] },
  { href: "/app/students", label: "Students", icon: GraduationCap, roles: ["admin", "teacher"] },
  { href: "/app/teachers", label: "Teachers", icon: Users, roles: ["admin"] },
  { href: "/app/parents", label: "Parents", icon: HeartHandshake, roles: ["admin"] },
  { href: "/app/setup", label: "Classes & subjects", icon: Layers, roles: ["admin"] },
  { href: "/app/import", label: "Import", icon: Upload, roles: ["admin"] },
  { href: "/app/admins", label: "Admins", icon: ShieldCheck, roles: ["admin"] },
];

function pick(items: Item[], roles: Role[]): NavItem[] {
  return items.filter((i) => i.roles.some((r) => roles.includes(r))).map((i) => ({ href: i.href, label: i.label, icon: i.icon, exact: i.exact }));
}

export function schoolNav(roles: Role[]): NavGroup[] {
  const isParentOnly = roles.includes("parent") && !roles.includes("student");
  return [
    { items: pick(OVERVIEW, roles) },
    { title: "Classroom", items: pick(CLASSROOM, roles) },
    { title: isParentOnly ? "Your children" : "Your record", items: pick(RECORD, roles) },
    { title: "School office", items: pick(OFFICE, roles) },
  ].filter((g) => g.items.length > 0);
}

/** The four shortcuts in the phone tab bar, for the person's main role. */
export function schoolTabs(roles: Role[]): NavItem[] {
  const groups = schoolNav(roles).flatMap((g) => g.items);
  const want = roles.includes("admin")
    ? ["/app", "/app/students", "/app/attendance", "/app/fees"]
    : roles.includes("teacher")
      ? ["/app", "/app/attendance", "/app/homework", "/app/quizzes"]
      : roles.includes("parent")
        ? ["/app", "/app/calendar", "/app/my/attendance", "/app/my/fees"]
        : ["/app", "/app/timetable", "/app/homework", "/app/quizzes"];
  const short: Record<string, string> = { "/app/my/attendance": "Attendance", "/app/my/fees": "Fees" };
  return want
    .map((href) => groups.find((g) => g.href === href))
    .filter((x): x is NavItem => Boolean(x))
    .map((x) => ({ ...x, label: short[x.href] ?? x.label }));
}
