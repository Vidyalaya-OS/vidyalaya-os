"use client";

import Link from "next/link";
import { ParentDashboard, StudentDashboard } from "@/components/Dashboards";
import { Badge, ButtonLink, Card, Empty, Loading, PageHeader } from "@/components/ui";
import { Page } from "@/lib/api";
import { useSession } from "@/lib/session";
import { SetupStatus, Teacher } from "@/lib/types";
import { rows, useApi } from "@/lib/useApi";

export default function SchoolHome() {
  const { hasRole, user } = useSession();
  return (
    <>
      <PageHeader title={`Hello, ${user?.name.split(" ")[0]}`} subtitle="Here is what needs you today." />
      <div className="space-y-5">
        {hasRole("admin") && <AdminHome />}
        {hasRole("teacher") && <TeacherHome />}
        {hasRole("student") && <StudentDashboard />}
        {hasRole("parent") && <ParentDashboard />}
      </div>
    </>
  );
}

const STEP_LINKS: Record<string, string> = {
  academic_year: "/app/setup",
  classes: "/app/setup",
  sections: "/app/setup",
  subjects: "/app/setup",
  teachers: "/app/teachers",
  subject_teachers: "/app/setup",
  students: "/app/students",
  parents: "/app/parents",
};

function AdminHome() {
  const { data } = useApi<SetupStatus>("setup-status");
  if (!data) return <Loading />;
  const done = data.steps.filter((s) => s.done).length;
  return (
    <Card title="School setup" actions={<span className="text-sm text-soft">{done} of {data.steps.length} done</span>}>
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-brand" style={{ width: `${(done / data.steps.length) * 100}%` }} />
      </div>
      <ol className="space-y-2">
        {data.steps.map((s, i) => (
          <li key={s.key}>
            <Link href={STEP_LINKS[s.key]} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5 text-sm hover:bg-muted">
              <span className="flex items-center gap-3">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${s.done ? "bg-brand text-white" : "bg-muted text-soft"}`}>
                  {s.done ? "✓" : i + 1}
                </span>
                {s.label}
              </span>
              <span className="text-soft">{s.count}</span>
            </Link>
          </li>
        ))}
      </ol>
      {data.complete && <p className="mt-3 text-sm text-soft">Setup is complete. Next: build the <Link className="text-brand" href="/app/timetable">timetable</Link> and set up <Link className="text-brand" href="/app/fees">fees</Link>.</p>}
    </Card>
  );
}

function TeacherHome() {
  const { data } = useApi<Page<Teacher>>("teachers/");
  const me = rows(data)[0];
  if (!data) return <Loading />;
  if (!me) return null;
  return (
    <Card title="Your classes" actions={<div className="flex gap-2"><ButtonLink href="/app/attendance">Mark attendance</ButtonLink><ButtonLink href="/app/quizzes" variant="secondary">Set a quiz</ButtonLink><ButtonLink href="/app/students" variant="secondary">Your students</ButtonLink></div>}>
      {me.teaches.length === 0 && me.class_teacher_of.length === 0 ? (
        <Empty>You have no classes assigned yet. Your school admin assigns them.</Empty>
      ) : (
        <ul className="space-y-2 text-sm">
          {me.class_teacher_of.map((c) => (
            <li key={c.section} className="flex justify-between rounded-lg border border-line px-3 py-2"><span>{c.section_name}</span><Badge tone="good">Class teacher</Badge></li>
          ))}
          {me.teaches.map((t) => (
            <li key={`${t.section}-${t.subject}`} className="flex justify-between rounded-lg border border-line px-3 py-2"><span>{t.section_name}</span><span className="text-soft">{t.subject_name}</span></li>
          ))}
        </ul>
      )}
    </Card>
  );
}
