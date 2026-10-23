"use client";

import {
  BookOpen, CalendarDays, CircleCheck, ClipboardCheck, Clock, FileSpreadsheet, GraduationCap, Lightbulb, Phone,
  TriangleAlert, Upload, UserPlus, Users, Wallet,
} from "lucide-react";
import Link from "next/link";
import { BarList, Donut, SplitBars } from "@/components/charts";
import { Schedule } from "@/components/Schedule";
import { Async, Badge, ButtonLink, Card, Empty, Loading, Progress, Stat, cx } from "@/components/ui";
import { Page } from "@/lib/api";
import { formatDateTime, money, pct } from "@/lib/format";
import { AttendanceSummary, BalanceRow, Exam, FeeTotals, Homework, Quiz, SetupStatus, Teacher, TimetableEntry } from "@/lib/types";
import { rows, useApi } from "@/lib/useApi";

export type QuickAction = { href: string; label: string; icon: React.ReactNode; hint?: string };

export function QuickActions({ actions }: { actions: QuickAction[] }) {
  return (
    <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {actions.map((a) => (
        <Link
          key={a.href + a.label}
          href={a.href}
          className="group flex min-h-24 flex-col justify-between gap-3 rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-card)] transition duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-[var(--shadow-lift)] active:translate-y-0 active:scale-[0.98]"
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand transition group-hover:bg-brand group-hover:text-white dark:group-hover:text-slate-950 [&_svg]:size-5">{a.icon}</span>
          <span>
            <span className="block text-sm font-semibold leading-tight">{a.label}</span>
            {a.hint && <span className="mt-0.5 block text-xs text-soft">{a.hint}</span>}
          </span>
        </Link>
      ))}
    </div>
  );
}

type Summary = {
  academic_year: string;
  currency: string;
  collected_today: string;
  collected_this_month: string;
  collected_this_year: string;
  totals: FeeTotals;
  by_class: (FeeTotals & { school_class: string | null; class_name: string })[];
};
type Daily = { sections: (AttendanceSummary & { section: string; section_name: string; students: number; marked: boolean })[]; total: AttendanceSummary; unmarked_sections: number };
type Defaulter = BalanceRow & { parents: { name: string; email: string | null; phone: string | null }[] };

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

/** The school admin's first screen: today's attendance, fee collection,
 * who is overdue, and setup steps still to do. */
export function AdminHome() {
  const setup = useApi<SetupStatus>("setup-status");
  const fees = useApi<Summary>("fees/summary");
  const daily = useApi<Daily>("attendance/reports/daily");
  const overdue = useApi<{ students: Defaulter[] }>("fees/defaulters");
  const count = (key: string) => setup.data?.steps.find((s) => s.key === key)?.count;
  const c = fees.data?.currency ?? "INR";
  const t = daily.data?.total;
  const overdueTotal = fees.data ? Number(fees.data.totals.overdue) : 0;
  const billed = fees.data ? Number(fees.data.totals.due) - Number(fees.data.totals.discount) : 0;

  return (
    <div className="space-y-6">
      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Students" value={count("students") ?? "-"} icon={<GraduationCap aria-hidden />} href="/app/students" hint={count("teachers") != null ? `${count("teachers")} teacher${count("teachers") === 1 ? "" : "s"}` : undefined} />
        <Stat
          label="Attendance today"
          value={t ? pct(t.percentage) : "-"}
          icon={<ClipboardCheck aria-hidden />}
          tone={t?.percentage == null ? undefined : t.percentage < 75 ? "bad" : t.percentage < 90 ? "warn" : "good"}
          progress={t?.percentage ?? null}
          hint={daily.data ? (daily.data.unmarked_sections ? `${daily.data.unmarked_sections} section${daily.data.unmarked_sections === 1 ? "" : "s"} not marked yet` : "All sections marked") : undefined}
          href="/app/attendance"
        />
        <Stat
          label="Collected this month"
          value={fees.data ? money(fees.data.collected_this_month, c) : "-"}
          icon={<Wallet aria-hidden />}
          tone="good"
          hint={fees.data ? `${money(fees.data.collected_today, c)} today` : undefined}
          href="/app/fees"
        />
        <Stat
          label="Overdue fees"
          value={fees.data ? money(fees.data.totals.overdue, c) : "-"}
          icon={<TriangleAlert aria-hidden />}
          tone={overdueTotal > 0 ? "bad" : "good"}
          hint={overdue.data ? `${overdue.data.students.length} student${overdue.data.students.length === 1 ? "" : "s"}` : undefined}
          href="/app/fees"
        />
      </div>

      <QuickActions actions={[
        { href: "/app/students", label: "Add a student", icon: <UserPlus aria-hidden /> },
        { href: "/app/attendance", label: "Attendance", icon: <ClipboardCheck aria-hidden />, hint: "Mark or see reports" },
        { href: "/app/fees", label: "Record a payment", icon: <Wallet aria-hidden /> },
        { href: "/app/timetable", label: "Timetable", icon: <Clock aria-hidden /> },
        { href: "/app/exams", label: "Tests & marks", icon: <FileSpreadsheet aria-hidden /> },
        { href: "/app/import", label: "Import from Excel", icon: <Upload aria-hidden /> },
      ]} />

      {setup.data && !setup.data.complete && <SetupCard setup={setup.data} />}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Attendance today" icon={<ClipboardCheck aria-hidden />} actions={<Link className="text-sm font-medium text-brand" href="/app/attendance">Reports</Link>}>
          <Async state={daily} loading={<Loading variant="text" />}>
            {(d) => (
              <div className="space-y-5">
                <Donut
                  segments={[
                    { label: "Present", value: d.total.present, tone: "good" },
                    { label: "Late", value: d.total.late, tone: "warn" },
                    { label: "Absent", value: d.total.absent, tone: "bad" },
                    { label: "On leave", value: d.total.leave, tone: "neutral" },
                  ]}
                  centre={<div><div className="text-xl font-bold tabular-nums">{pct(d.total.percentage)}</div><div className="text-[0.7rem] text-soft">in class</div></div>}
                />
                {d.sections.filter((s) => !s.marked).length > 0 && (
                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-soft">Not marked yet</div>
                    <div className="flex flex-wrap gap-2">
                      {d.sections.filter((s) => !s.marked).map((s) => <Badge key={s.section} tone="warn">{s.section_name}</Badge>)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Async>
        </Card>

        <Card title="Fee collection by class" icon={<Wallet aria-hidden />} description={fees.data ? `${money(fees.data.totals.paid, c)} of ${money(billed, c)} collected in ${fees.data.academic_year}` : undefined}>
          <Async state={fees} loading={<Loading variant="text" />} isEmpty={(f) => f.by_class.length === 0} empty={<Empty>No fees billed yet. Set up the fee structure, then bill students.</Empty>}>
            {(f) => (
              <SplitBars
                labels={["Collected", "Still due"]}
                format={(n) => money(n, c)}
                items={f.by_class.map((r) => ({ label: r.class_name, a: Number(r.paid), b: Number(r.remaining) }))}
              />
            )}
          </Async>
        </Card>
      </div>

      <Card title="Overdue fees" icon={<TriangleAlert aria-hidden />} description="Largest first, with parents' phone numbers to call." actions={<ButtonLink href="/app/fees" variant="secondary" size="sm">All fees</ButtonLink>}>
        <Async state={overdue} isEmpty={(o) => o.students.length === 0} empty={<Empty icon={<CircleCheck aria-hidden />} title="Nobody is overdue">Every due date so far has been paid.</Empty>}>
          {(o) => (
            <ul className="stagger divide-y divide-line">
              {o.students.slice(0, 6).map((s) => {
                const phone = s.parents.find((p) => p.phone)?.phone;
                return (
                  <li key={s.student} className="flex items-center justify-between gap-3 py-3">
                    <Link href={`/app/fees/students/${s.student}`} className="min-w-0 hover:text-brand">
                      <div className="truncate font-medium">{s.name}</div>
                      <div className="truncate text-xs text-soft">{s.section_name}{s.parents[0] ? ` · ${s.parents[0].name}` : ""}</div>
                    </Link>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums text-red-700 dark:text-red-300">{money(s.overdue, c)}</span>
                      {phone && (
                        <a href={`tel:${phone}`} className="flex size-9 items-center justify-center rounded-xl border border-line text-soft transition hover:border-brand hover:text-brand" aria-label={`Call ${s.parents[0]?.name ?? "parent"}`} title={phone}>
                          <Phone className="size-4" aria-hidden />
                        </a>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Async>
      </Card>

      {setup.data?.complete && <SetupCard setup={setup.data} compact />}
    </div>
  );
}

function SetupCard({ setup, compact }: { setup: SetupStatus; compact?: boolean }) {
  const done = setup.steps.filter((s) => s.done).length;
  if (compact) {
    return (
      <p className="flex items-center gap-2 text-sm text-soft">
        <CircleCheck className="size-4 text-green-600" aria-hidden /> School setup is complete ({done} of {setup.steps.length} steps).
        <Link className="font-medium text-brand" href="/app/setup">Classes &amp; subjects</Link>
      </p>
    );
  }
  return (
    <Card title="Finish setting up your school" description={`${done} of ${setup.steps.length} steps done`} icon={<CircleCheck aria-hidden />}>
      <Progress value={(done / setup.steps.length) * 100} className="mb-4" label="Setup progress" />
      <ol className="stagger grid gap-2 sm:grid-cols-2">
        {setup.steps.map((s, i) => (
          <li key={s.key}>
            <Link href={STEP_LINKS[s.key] ?? "/app/setup"} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5 text-sm transition hover:border-brand/40 hover:bg-brand-soft/40">
              <span className="flex items-center gap-3">
                <span className={cx("flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold", s.done ? "bg-green-600 text-white" : "bg-muted text-soft")}>
                  {s.done ? "✓" : i + 1}
                </span>
                {s.label}
              </span>
              <span className="tabular-nums text-soft">{s.count}</span>
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/** The teacher's first screen: today's classes, what to mark, open quizzes,
 * homework due and marks still to enter. */
export function TeacherHome() {
  const me = useApi<Page<Teacher>>("teachers/");
  const today = useApi<TimetableEntry[]>("timetable/?mine=true&day=today");
  const pending = useApi<{ date: string; sections: { section: string; section_name: string; marked: boolean }[] }>("attendance/pending");
  const quizzes = useApi<Page<Quiz>>("quizzes/?mine=true&state=open");
  const exams = useApi<Exam[]>("exams/?mine=true&status=draft");
  const homework = useApi<Page<Homework>>("homework/?upcoming=true");
  const teacher = rows(me.data)[0];
  const toMark = (pending.data?.sections ?? []).filter((s) => !s.marked);
  const marksDue = (exams.data ?? []).filter((e) => e.marks_entered < e.students);
  const openQuizzes = rows(quizzes.data);

  return (
    <div className="space-y-6">
      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Classes today" value={today.data ? today.data.length : "-"} icon={<CalendarDays aria-hidden />} href="/app/timetable" />
        <Stat label="Attendance to mark" value={pending.data ? toMark.length : "-"} icon={<ClipboardCheck aria-hidden />} tone={toMark.length ? "warn" : pending.data ? "good" : undefined} hint={pending.data && !toMark.length ? "All done for today" : undefined} href="/app/attendance" />
        <Stat label="Open quizzes" value={quizzes.data ? openQuizzes.length : "-"} icon={<Lightbulb aria-hidden />} href="/app/quizzes" />
        <Stat label="Marks to enter" value={exams.data ? marksDue.length : "-"} icon={<FileSpreadsheet aria-hidden />} tone={marksDue.length ? "warn" : undefined} href="/app/exams" />
      </div>

      <QuickActions actions={[
        { href: "/app/attendance", label: "Mark attendance", icon: <ClipboardCheck aria-hidden /> },
        { href: "/app/homework", label: "Post homework", icon: <BookOpen aria-hidden /> },
        { href: "/app/quizzes", label: "Set a quiz", icon: <Lightbulb aria-hidden /> },
        { href: "/app/exams", label: "Enter marks", icon: <FileSpreadsheet aria-hidden /> },
        { href: "/app/students", label: "Your students", icon: <Users aria-hidden /> },
        { href: "/app/calendar", label: "Calendar", icon: <CalendarDays aria-hidden /> },
      ]} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Today's classes" icon={<Clock aria-hidden />} actions={<Link className="text-sm font-medium text-brand" href="/app/timetable">Week</Link>}>
          <Async state={today} isEmpty={(d) => d.length === 0} empty={<Empty icon={<CalendarDays aria-hidden />}>No classes on your timetable today.</Empty>}>
            {(d) => <Schedule slots={d.map((e) => ({ id: e.id, start: e.start_time, end: e.end_time, title: e.subject_name, detail: [e.section_name, e.period_name, e.room && `Room ${e.room}`].filter(Boolean).join(" · ") }))} />}
          </Async>
        </Card>

        <div className="space-y-5">
          <Card title="Attendance" icon={<ClipboardCheck aria-hidden />} description="Sections you mark today">
            <Async state={pending} loading={<Loading variant="text" />} isEmpty={(p) => p.sections.length === 0} empty={<Empty>You have no sections to mark.</Empty>}>
              {(p) => (
                <ul className="space-y-2">
                  {p.sections.map((s) => (
                    <li key={s.section} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5">
                      <span className="font-medium">{s.section_name}</span>
                      {s.marked ? <Badge tone="good" dot>Marked</Badge> : <ButtonLink href="/app/attendance" size="sm">Mark now</ButtonLink>}
                    </li>
                  ))}
                </ul>
              )}
            </Async>
          </Card>

          <Card title="Open quizzes" icon={<Lightbulb aria-hidden />} actions={<Link className="text-sm font-medium text-brand" href="/app/quizzes">All</Link>}>
            <Async state={quizzes} loading={<Loading variant="text" />} isEmpty={(q) => rows(q).length === 0} empty={<Empty>No quiz is open. Set one on today&apos;s lesson.</Empty>}>
              {(q) => (
                <ul className="space-y-3">
                  {rows(q).map((z) => (
                    <li key={z.id}>
                      <Link href={`/app/quizzes/${z.id}`} className="block rounded-xl border border-line p-3 transition hover:border-brand/40 hover:bg-brand-soft/30">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium">{z.title}</span>
                          <span className="shrink-0 text-xs text-soft">closes {formatDateTime(z.closes_at)}</span>
                        </div>
                        <div className="mt-1 text-xs text-soft">{z.section_name} · {z.attempt_count ?? 0} of {z.student_count ?? 0} taken</div>
                        <Progress value={z.student_count ? ((z.attempt_count ?? 0) / z.student_count) * 100 : 0} className="mt-2" label="Students who took it" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Async>
          </Card>
        </div>

        <Card title="Marks to enter" icon={<FileSpreadsheet aria-hidden />} actions={<Link className="text-sm font-medium text-brand" href="/app/exams">All tests</Link>}>
          <Async state={exams} loading={<Loading variant="text" />} isEmpty={() => marksDue.length === 0} empty={<Empty icon={<CircleCheck aria-hidden />}>All marks are in.</Empty>}>
            {() => (
              <BarList
                valueLabel="Entered"
                format={(n) => `${Math.round(n)}%`}
                items={marksDue.slice(0, 6).map((e) => ({
                  label: `${e.section_name} · ${e.subject_name} (${e.exam_term_name})`,
                  value: e.students ? (e.marks_entered / e.students) * 100 : 0,
                  note: `${e.marks_entered} / ${e.students}`,
                }))}
              />
            )}
          </Async>
        </Card>

        <Card title="Homework due soon" icon={<BookOpen aria-hidden />} actions={<Link className="text-sm font-medium text-brand" href="/app/homework">All</Link>}>
          <Async state={homework} loading={<Loading variant="text" />} isEmpty={(h) => rows(h).length === 0} empty={<Empty>Nothing due. Post homework from the Homework screen.</Empty>}>
            {(h) => (
              <ul className="divide-y divide-line">
                {rows(h).slice(0, 5).map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{x.title}</span>
                      <span className="text-xs text-soft">{x.section_name} · {x.subject_name}</span>
                    </span>
                    {x.done_count != null && <Badge tone="info">{x.done_count} done</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </Async>
        </Card>
      </div>

      {teacher && (teacher.teaches.length > 0 || teacher.class_teacher_of.length > 0) && (
        <Card title="Your classes" icon={<Users aria-hidden />}>
          <ul className="flex flex-wrap gap-2">
            {teacher.class_teacher_of.map((c) => (
              <li key={c.section}><Badge tone="good">{c.section_name} · Class teacher</Badge></li>
            ))}
            {teacher.teaches.map((x) => (
              <li key={`${x.section}-${x.subject}`}><Badge>{x.section_name} · {x.subject_name}</Badge></li>
            ))}
          </ul>
        </Card>
      )}
      {me.data && !teacher && <Empty>Your teacher profile is not set up yet. Ask your school admin.</Empty>}
    </div>
  );
}
