"use client";

import Link from "next/link";
import { useState } from "react";
import { scoreText } from "@/components/QuizList";
import { Badge, ButtonLink, Card, Empty, Loading, Stat, Tabs } from "@/components/ui";
import { formatDate, formatDateTime, money, num, pct, shortTime } from "@/lib/format";
import { AttendanceStatus, ChildSummary, DashHomework, DashQuizzes, DashTests, StudentDashboard as StudentData } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const ATTENDANCE: Record<AttendanceStatus, { label: string; tone: "good" | "warn" | "bad" | "neutral" }> = {
  present: { label: "Present", tone: "good" },
  late: { label: "Late", tone: "warn" },
  absent: { label: "Absent", tone: "bad" },
  leave: { label: "On leave", tone: "neutral" },
};

function attendanceTone(p: number | null) {
  return p == null ? undefined : p < 75 ? "bad" : "good";
}

function ViewAll({ href, children = "See all" }: { href: string; children?: React.ReactNode }) {
  return <Link href={href} className="text-sm font-medium text-brand">{children}</Link>;
}

/** The student's first screen: today's classes, quizzes to take, homework due and latest results. */
export function StudentDashboard() {
  const dash = useApi<StudentData>("dashboard/student");
  if (dash.error) return <p className="text-sm text-red-600">{dash.error}</p>;
  if (!dash.data) return <Loading />;
  const d = dash.data;
  const today = d.attendance.today ? ATTENDANCE[d.attendance.today] : null;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Quizzes to take" value={d.quizzes.pending.length} tone={d.quizzes.pending.length ? "warn" : undefined} />
        <Stat label="Homework pending" value={d.homework.pending + d.homework.overdue} tone={d.homework.overdue ? "bad" : undefined} hint={d.homework.overdue ? `${d.homework.overdue} overdue` : undefined} />
        <Stat label="Attendance this month" value={pct(d.attendance.month_summary.percentage)} tone={attendanceTone(d.attendance.month_summary.percentage)} />
        <Stat label="Attendance this year" value={pct(d.attendance.year_summary.percentage)} tone={attendanceTone(d.attendance.year_summary.percentage)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={`Today, ${d.day_name}`} actions={today ? <Badge tone={today.tone}>{today.label}</Badge> : <ViewAll href="/app/timetable">Week</ViewAll>}>
          {d.timetable.length === 0 ? (
            <Empty>No classes today.</Empty>
          ) : (
            <ol className="divide-y divide-line">
              {d.timetable.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="w-24 shrink-0 tabular-nums text-soft">{shortTime(t.start_time)}–{shortTime(t.end_time)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{t.subject_name}</span>
                    <span className="block truncate text-xs text-soft">{[t.period_name, t.teacher_name, t.room && `Room ${t.room}`].filter(Boolean).join(" · ")}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <QuizzesCard quizzes={d.quizzes} canTake />
        <HomeworkCard homework={d.homework} href="/app/homework" />
        <TestsCard tests={d.tests} studentId={d.student.id} />
      </div>
      <div className="flex flex-wrap gap-2">
        <ButtonLink href={`/app/students/${d.student.id}`} variant="secondary">Attendance calendar and all results</ButtonLink>
        <ButtonLink href={`/app/fees/students/${d.student.id}`} variant="secondary">Fees</ButtonLink>
      </div>
    </div>
  );
}

function QuizzesCard({ quizzes, canTake, student }: { quizzes: DashQuizzes; canTake?: boolean; student?: string }) {
  const suffix = student ? `?student=${student}` : "";
  return (
    <Card title="Quizzes" actions={<ViewAll href="/app/quizzes" />}>
      {quizzes.pending.length > 0 && (
        <ul className="mb-3 space-y-2">
          {quizzes.pending.map((q) => (
            <li key={q.id} className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 p-3 text-sm dark:border-amber-800">
              <div className="min-w-0">
                <div className="font-medium">{q.title}</div>
                <div className="text-xs text-soft">{q.subject_name} · {q.question_count} questions · closes {formatDateTime(q.closes_at)}</div>
              </div>
              <span className="shrink-0 whitespace-nowrap">{canTake ? <ButtonLink href={`/app/quizzes/${q.id}`}>Take quiz</ButtonLink> : <Badge tone="warn">Not taken yet</Badge>}</span>
            </li>
          ))}
        </ul>
      )}
      {quizzes.recent_scores.length > 0 ? (
        <>
          <div className="mb-1 text-xs uppercase tracking-wide text-soft">Recent scores</div>
          <ul className="divide-y divide-line">
            {quizzes.recent_scores.map((q) => (
              <li key={q.id}>
                <Link href={`/app/quizzes/${q.id}${suffix}`} className="flex items-center justify-between gap-3 py-2 text-sm hover:text-brand">
                  <span className="min-w-0 truncate">{q.title} <span className="text-soft">· {q.subject_name}</span></span>
                  <span className="shrink-0 font-semibold tabular-nums">{scoreText(q.score, q.max_score)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : quizzes.pending.length === 0 ? (
        <Empty>No quizzes yet.</Empty>
      ) : null}
      {quizzes.upcoming.length > 0 && (
        <p className="mt-2 text-xs text-soft">Coming up: {quizzes.upcoming.map((q) => `${q.title} (opens ${formatDateTime(q.opens_at)})`).join(", ")}</p>
      )}
    </Card>
  );
}

function HomeworkCard({ homework, href }: { homework: DashHomework; href: string }) {
  return (
    <Card title="Homework due" actions={<ViewAll href={href} />}>
      {homework.items.length === 0 ? (
        <Empty>Nothing due this week.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {homework.items.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium">{h.title}</span>
                <span className="text-xs text-soft">{h.subject_name}</span>
              </span>
              <Badge tone={h.overdue ? "bad" : "neutral"}>{h.overdue ? "Overdue" : "Due"} {formatDate(h.due_date)}</Badge>
            </li>
          ))}
        </ul>
      )}
      {homework.pending > homework.items.filter((h) => !h.overdue).length && (
        <p className="mt-2 text-xs text-soft">{homework.pending} not done in all.</p>
      )}
    </Card>
  );
}

function TestsCard({ tests, studentId }: { tests: DashTests; studentId: string }) {
  return (
    <Card title="Latest test results" actions={<ViewAll href={`/app/students/${studentId}`} />}>
      {tests.latest.length === 0 ? (
        <Empty>No results are published yet.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {tests.latest.map((t) => (
            <li key={t.exam} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block font-medium">{t.subject_name}</span>
                <span className="text-xs text-soft">{t.exam_term_name}{t.class_average != null ? ` · class average ${t.class_average}` : ""}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="font-semibold tabular-nums">{t.is_absent ? "Absent" : `${num(t.marks_obtained)} / ${num(t.max_marks)}`}</span>
                {t.grade && <span className="ml-2"><Badge tone="good">{t.grade}</Badge></span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {tests.report_cards.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {tests.report_cards.map((c) => (
            <Link key={c.exam_term} href={`/app/report-cards/${studentId}/${c.exam_term}`} className="rounded-lg border border-line px-3 py-1.5 text-sm text-brand hover:bg-muted">
              Report card: {c.exam_term_name}
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

/** The parent's first screen: one tab per child with attendance, homework, marks, quizzes and fees. */
export function ParentDashboard() {
  const dash = useApi<{ children: ChildSummary[] }>("dashboard/parent");
  const [chosen, setChosen] = useState("");
  if (dash.error) return <p className="text-sm text-red-600">{dash.error}</p>;
  if (!dash.data) return <Loading />;
  const children = dash.data.children;
  if (children.length === 0) return <Card title="Your children"><Empty>No children are linked to your account yet. Ask the school office.</Empty></Card>;
  const child = children.find((c) => c.student.id === chosen) ?? children[0];
  return (
    <div>
      {children.length > 1 && (
        <Tabs value={child.student.id} onChange={setChosen} tabs={children.map((c) => ({ key: c.student.id, label: c.student.name }))} />
      )}
      <ChildPanel child={child} />
    </div>
  );
}

function ChildPanel({ child }: { child: ChildSummary }) {
  const s = child.student;
  const today = child.attendance.today ? ATTENDANCE[child.attendance.today] : null;
  const fees = child.fees;
  const remaining = fees ? Number(fees.remaining) : 0;
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">{s.name}</h2>
        <p className="text-sm text-soft">{s.section_name ?? "No class yet"}{s.roll_no != null ? ` · Roll ${s.roll_no}` : ""} · Adm. {s.admission_no}{s.class_teacher ? ` · Class teacher ${s.class_teacher}` : ""}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Today" value={today ? today.label : "Not marked"} tone={today?.tone === "neutral" ? undefined : today?.tone} />
        <Stat label="Attendance this month" value={pct(child.attendance.month_summary.percentage)} tone={attendanceTone(child.attendance.month_summary.percentage)}
          hint={`${child.attendance.month_summary.absent} absent · year ${pct(child.attendance.year_summary.percentage)}`} />
        <Stat label="Fees paid" value={fees ? money(fees.paid, child.currency) : "-"} tone={fees ? "good" : undefined} hint={fees ? `of ${money(Number(fees.due) - Number(fees.discount), child.currency)}` : undefined} />
        <Stat label="Fees remaining" value={fees ? money(fees.remaining, child.currency) : "-"} tone={fees && Number(fees.overdue) > 0 ? "bad" : remaining > 0 ? "warn" : fees ? "good" : undefined}
          hint={fees && Number(fees.overdue) > 0 ? `${money(fees.overdue, child.currency)} overdue` : fees?.next_due ? `Next: ${money(fees.next_due.remaining, child.currency)} by ${formatDate(fees.next_due.due_date)}` : undefined} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <HomeworkCard homework={child.homework} href="/app/homework" />
        <TestsCard tests={child.tests} studentId={s.id} />
        <QuizzesCard quizzes={child.quizzes} student={s.id} />
        <Card title="Fees" actions={<ViewAll href={`/app/fees/students/${s.id}`}>Statement and receipts</ViewAll>}>
          {!fees ? (
            <Empty>Fees for this year are not set up yet.</Empty>
          ) : (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-soft">Total for {fees.academic_year_name}</dt><dd className="font-medium tabular-nums">{money(fees.due, child.currency)}</dd></div>
              {Number(fees.discount) > 0 && <div><dt className="text-soft">Discount</dt><dd className="font-medium tabular-nums">{money(fees.discount, child.currency)}</dd></div>}
              <div><dt className="text-soft">Paid</dt><dd className="font-medium tabular-nums text-green-700 dark:text-green-300">{money(fees.paid, child.currency)}</dd></div>
              <div><dt className="text-soft">Remaining</dt><dd className="font-medium tabular-nums">{money(fees.remaining, child.currency)}</dd></div>
              {Number(fees.overdue) > 0 && <div><dt className="text-soft">Overdue</dt><dd className="font-medium tabular-nums text-red-700 dark:text-red-300">{money(fees.overdue, child.currency)}</dd></div>}
              {fees.next_due && <div className="col-span-2"><dt className="text-soft">Next due</dt><dd className="font-medium">{fees.next_due.name}: {money(fees.next_due.remaining, child.currency)} by {formatDate(fees.next_due.due_date)}</dd></div>}
            </dl>
          )}
        </Card>
      </div>
      <ButtonLink href={`/app/students/${s.id}`} variant="secondary">Attendance calendar and all results</ButtonLink>
    </div>
  );
}
