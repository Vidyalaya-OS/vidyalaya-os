import {
  Award, BookOpen, Building2, CalendarDays, CirclePlus, ClipboardCheck, Clock, FileSpreadsheet, GraduationCap, HeartHandshake, House,
  Layers, Lightbulb, School, ShieldCheck, TrendingUp, Upload, Users, Wallet,
} from "lucide-react-native";
import type { Role } from "./api";

export type Icon = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
export type NavItem = { href: string; label: string; icon: Icon; exact?: boolean };
export type NavGroup = { title?: string; items: NavItem[] };

type Item = NavItem & { roles: Role[] };

const ALL: Role[] = ["admin", "teacher", "student", "parent"];

// The same menu as the web app (web/src/lib/nav.ts).
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

/** Pages reached from a link rather than the menu, and who may open them. */
const DETAIL_PAGES: { href: string; roles: Role[] }[] = [
  { href: "/app/fees/receipts", roles: ALL },
  { href: "/app/report-cards/", roles: ALL },
];

/** The roles that may open a page, from the longest matching menu entry;
 * null for pages every member may open. */
export function rolesFor(pathname: string): Role[] | null {
  const entries = [...OVERVIEW, ...CLASSROOM, ...RECORD, ...OFFICE, ...DETAIL_PAGES].filter((i) =>
    i.href.endsWith("/") ? pathname.startsWith(i.href) : pathname === i.href || pathname.startsWith(`${i.href}/`),
  );
  if (entries.length === 0) return null;
  return entries.sort((a, b) => b.href.length - a.href.length)[0].roles;
}

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

/** The four shortcuts in the tab bar, for the person's main role. */
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

export function platformNav(hasSchools: boolean): NavItem[] {
  return [
    { href: "/platform", label: "Schools", icon: Building2, exact: true },
    { href: "/platform/new", label: "Onboard a school", icon: CirclePlus },
    ...(hasSchools ? [{ href: "/choose-school", label: "My schools", icon: School }] : []),
  ];
}

export function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
