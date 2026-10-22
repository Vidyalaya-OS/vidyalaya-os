"use client";

import Link from "next/link";
import { Badge, ButtonLink, Card, Empty, Loading, PageHeader } from "@/components/ui";
import { Page } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Section, SetupStatus, Student, Teacher } from "@/lib/types";
import { rows, useApi } from "@/lib/useApi";

export default function SchoolHome() {
  const { hasRole, user } = useSession();
  return (
    <>
      <PageHeader title={`Hello, ${user?.name.split(" ")[0]}`} subtitle="Here is what needs you today." />
      <div className="space-y-5">
        {hasRole("admin") && <AdminHome />}
        {hasRole("teacher") && <TeacherHome />}
        {hasRole("student") && <StudentHome />}
        {hasRole("parent") && <ParentHome />}
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
    <Card title="Your classes" actions={<div className="flex gap-2"><ButtonLink href="/app/attendance">Mark attendance</ButtonLink><ButtonLink href="/app/students" variant="secondary">Your students</ButtonLink></div>}>
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

function StudentHome() {
  const { data } = useApi<Page<Student>>("students/");
  const { data: sections } = useApi<Page<Section>>("sections/");
  const me = rows(data)[0];
  if (!data) return <Loading />;
  if (!me) return null;
  const section = rows(sections)[0];
  return (
    <Card title="Your class">
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-soft">Class</dt><dd className="font-medium">{me.current_enrollment?.section_name ?? "Not assigned"}</dd></div>
        <div><dt className="text-soft">Roll number</dt><dd className="font-medium">{me.current_enrollment?.roll_no ?? "-"}</dd></div>
        <div><dt className="text-soft">Admission no.</dt><dd className="font-medium">{me.admission_no}</dd></div>
        <div><dt className="text-soft">Class teacher</dt><dd className="font-medium">{section?.class_teacher_name ?? "-"}</dd></div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <ButtonLink href={`/app/students/${me.id}`}>Attendance, results and fees</ButtonLink>
        <ButtonLink href="/app/homework" variant="secondary">Homework</ButtonLink>
        <ButtonLink href="/app/timetable" variant="secondary">Timetable</ButtonLink>
      </div>
    </Card>
  );
}

function ParentHome() {
  const { data } = useApi<Student[]>("my-children");
  if (!data) return <Loading />;
  return (
    <Card title="Your children">
      {data.length === 0 ? (
        <Empty>No children are linked to your account yet. Ask the school office.</Empty>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.map((c) => (
            <li key={c.id} className="rounded-lg border border-line p-3 text-sm">
              <div className="font-medium">{c.name}</div>
              <div className="text-soft">{c.current_enrollment?.section_name ?? "No class yet"} · Adm. {c.admission_no}</div>
              <Link href={`/app/students/${c.id}`} className="mt-2 inline-block text-sm font-medium text-brand">Attendance, homework, marks and fees</Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
