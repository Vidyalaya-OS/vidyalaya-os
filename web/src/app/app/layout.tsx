"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, cx, Loading } from "@/components/ui";
import { Role } from "@/lib/api";
import { ROLE_LABELS, useSession } from "@/lib/session";

const NAV: { href: string; label: string; roles: Role[] }[] = [
  { href: "/app", label: "Home", roles: ["admin", "teacher", "student", "parent"] },
  { href: "/app/timetable", label: "Timetable", roles: ["admin", "teacher", "student", "parent"] },
  { href: "/app/attendance", label: "Attendance", roles: ["admin", "teacher"] },
  { href: "/app/homework", label: "Homework", roles: ["admin", "teacher", "student", "parent"] },
  { href: "/app/quizzes", label: "Quizzes", roles: ["admin", "teacher", "student", "parent"] },
  { href: "/app/exams", label: "Tests & marks", roles: ["admin", "teacher"] },
  { href: "/app/report-cards", label: "Report cards", roles: ["admin", "teacher"] },
  { href: "/app/fees", label: "Fees", roles: ["admin"] },
  { href: "/app/setup", label: "Classes & subjects", roles: ["admin"] },
  { href: "/app/students", label: "Students", roles: ["admin", "teacher"] },
  { href: "/app/teachers", label: "Teachers", roles: ["admin"] },
  { href: "/app/parents", label: "Parents", roles: ["admin"] },
  { href: "/app/import", label: "Import", roles: ["admin"] },
  { href: "/app/admins", label: "Admins", roles: ["admin"] },
];

export default function SchoolLayout({ children }: { children: React.ReactNode }) {
  const { ready, user, school, roles, memberships, signOut } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace("/login");
    else if (!school) router.replace("/choose-school");
  }, [ready, user, school, router]);

  if (!ready || !user || !school) return <Loading />;

  const links = NAV.filter((n) => n.roles.some((r) => roles.includes(r)));
  const canSwitch = memberships.length > 1 || user.is_platform_owner;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-line bg-surface print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <Link href="/app" className="block truncate font-semibold">{school.school.name}</Link>
            <div className="truncate text-xs text-soft">{user.name} · {roles.map((r) => ROLE_LABELS[r]).join(", ")}</div>
          </div>
          <button className="rounded-lg border border-line px-3 py-2 text-sm md:hidden" onClick={() => setOpen(!open)} aria-expanded={open}>
            Menu
          </button>
          <div className="hidden items-center gap-4 text-sm md:flex">
            {canSwitch && <Link href="/choose-school" className="text-brand">Switch school</Link>}
            <button className="text-soft" onClick={() => signOut().then(() => router.replace("/login"))}>Sign out</button>
          </div>
        </div>
        <nav className={cx("border-t border-line md:block", open ? "block" : "hidden")}>
          <ul className="mx-auto flex max-w-6xl flex-col gap-1 px-2 py-2 md:flex-row md:overflow-x-auto md:px-4 md:py-0">
            {links.map((n) => {
              const active = n.href === "/app" ? pathname === "/app" : pathname.startsWith(n.href);
              return (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    onClick={() => setOpen(false)}
                    className={cx(
                      "block whitespace-nowrap rounded-md px-3 py-2 text-sm md:rounded-none md:border-b-2 md:py-3",
                      active ? "font-medium text-brand md:border-brand" : "text-soft md:border-transparent hover:text-ink",
                    )}
                  >
                    {n.label}
                  </Link>
                </li>
              );
            })}
            <li className="md:hidden">
              {canSwitch && <Link href="/choose-school" className="block px-3 py-2 text-sm text-brand">Switch school</Link>}
              <button className="block px-3 py-2 text-sm text-soft" onClick={() => signOut().then(() => router.replace("/login"))}>Sign out</button>
            </li>
          </ul>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 print:max-w-none print:p-0">
        {school.school.status === "suspended" && (
          <div className="mb-4"><Alert tone="info">This school is suspended. You can look, but changes are switched off.</Alert></div>
        )}
        {children}
      </main>
    </div>
  );
}
