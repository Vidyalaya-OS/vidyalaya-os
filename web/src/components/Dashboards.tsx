"use client";

import { Award, BookOpen, CalendarDays, CircleCheck, ClipboardCheck, Clock, Lightbulb, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";
import { BarList, Ring } from "@/components/charts";
import { scoreText } from "@/components/QuizList";
import { Schedule } from "@/components/Schedule";
import { QuickActions } from "@/components/StaffHome";
import { Async, Avatar, Badge, ButtonLink, Card, Empty, Loading, Progress, Stat, cx } from "@/components/ui";
import { useChildren } from "@/lib/children";
import { formatDate, formatDateTime, money, num, pct } from "@/lib/format";
import { AttendanceStatus, ChildSummary, DashAttendance, DashHomework, DashQuizzes, DashTests, StudentDashboard as StudentData } from "@/lib/types";
import { useApi } from "@/lib/useApi";

export const ATTENDANCE: Record<AttendanceStatus, { label: string; tone: "good" | "warn" | "bad" | "neutral" }> = {
  present: { label: "Present", tone: "good" },
  late: { label: "Late", tone: "warn" },
  absent: { label: "Absent", tone: "bad" },
  leave: { label: "On leave", tone: "neutral" },
};

function attendanceTone(p: number | null) {
  return p == null ? undefined : p < 75 ? "bad" : p < 90 ? "warn" : "good";
}

function ViewAll({ href, children = "See all" }: { href: string; children?: React.ReactNode }) {
  return <Link href={href} className="text-sm font-medium text-brand hover:underline">{children}</Link>;
}

/** The student's first screen: today's classes, quizzes to take, homework due and latest results. */
export function StudentDashboard() {
  const dash = useApi<StudentData>("dashboard/student");
  return (
    <Async state={dash} loading={<><Loading variant="stats" /><div className="mt-5"><Loading variant="cards" /></div></>}>
      {(d) => (
        <div className="space-y-6">
          <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Quizzes to take" value={d.quizzes.pending.length} icon={<Lightbulb aria-hidden />} tone={d.quizzes.pending.length ? "warn" : undefined} href="/app/quizzes" />
            <Stat label="Homework pending" value={d.homework.pending + d.homework.overdue} icon={<BookOpen aria-hidden />} tone={d.homework.overdue ? "bad" : undefined} hint={d.homework.overdue ? `${d.homework.overdue} overdue` : "On track"} href="/app/homework" />
            <Stat label="Attendance this month" value={pct(d.attendance.month_summary.percentage)} icon={<ClipboardCheck aria-hidden />} tone={attendanceTone(d.attendance.month_summary.percentage)} progress={d.attendance.month_summary.percentage} href="/app/my/attendance" />
            <Stat label="Attendance this year" value={pct(d.attendance.year_summary.percentage)} icon={<CalendarDays aria-hidden />} tone={attendanceTone(d.attendance.year_summary.percentage)} progress={d.attendance.year_summary.percentage} href="/app/my/attendance" />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card
              title={`Today, ${d.day_name}`}
              icon={<Clock aria-hidden />}
              actions={d.attendance.today ? <Badge tone={ATTENDANCE[d.attendance.today].tone} dot>{ATTENDANCE[d.attendance.today].label}</Badge> : <ViewAll href="/app/timetable">Week</ViewAll>}
            >
              {d.timetable.length === 0 ? (
                <Empty icon={<CalendarDays aria-hidden />}>No classes today.</Empty>
              ) : (
                <Schedule slots={d.timetable.map((t) => ({ id: t.id, start: t.start_time, end: t.end_time, title: t.subject_name, detail: [t.period_name, t.teacher_name, t.room && `Room ${t.room}`].filter(Boolean).join(" · ") }))} />
              )}
            </Card>
            <QuizzesCard quizzes={d.quizzes} canTake />
            <HomeworkCard homework={d.homework} href="/app/homework" />
            <TestsCard tests={d.tests} studentId={d.student.id} />
          </div>

          <QuickActions actions={[
            { href: "/app/calendar", label: "Calendar", icon: <CalendarDays aria-hidden />, hint: "Due dates and tests" },
            { href: "/app/timetable", label: "Timetable", icon: <Clock aria-hidden /> },
            { href: "/app/my/attendance", label: "Attendance", icon: <ClipboardCheck aria-hidden /> },
            { href: "/app/my/results", label: "Results", icon: <TrendingUp aria-hidden /> },
            { href: "/app/my/fees", label: "Fees", icon: <Wallet aria-hidden /> },
            { href: "/app/quizzes", label: "Quizzes", icon: <Lightbulb aria-hidden /> },
          ]} />
        </div>
      )}
    </Async>
  );
}

function QuizzesCard({ quizzes, canTake, student }: { quizzes: DashQuizzes; canTake?: boolean; student?: string }) {
  const suffix = student ? `?student=${student}` : "";
  return (
    <Card title="Quizzes" icon={<Lightbulb aria-hidden />} actions={<ViewAll href="/app/quizzes" />}>
      {quizzes.pending.length > 0 && (
        <ul className="mb-4 space-y-2">
          {quizzes.pending.map((q) => (
            <li key={q.id} className="flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50/60 p-3 dark:border-amber-800 dark:bg-amber-950/30">
              <div className="min-w-0">
                <div className="truncate font-medium">{q.title}</div>
                <div className="text-xs text-soft">{q.subject_name} · {q.question_count} questions · closes {formatDateTime(q.closes_at)}</div>
              </div>
              <span className="shrink-0">{canTake ? <ButtonLink href={`/app/quizzes/${q.id}`} size="sm">Take quiz</ButtonLink> : <Badge tone="warn">Not taken yet</Badge>}</span>
            </li>
          ))}
        </ul>
      )}
      {quizzes.recent_scores.length > 0 ? (
        <>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-soft">Recent scores</div>
          <ul className="space-y-1">
            {quizzes.recent_scores.map((q) => {
              const p = q.max_score ? (q.score / q.max_score) * 100 : 0;
              return (
                <li key={q.id}>
                  <Link href={`/app/quizzes/${q.id}${suffix}`} className="block rounded-lg px-1 py-2 transition hover:bg-muted">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">{q.title} <span className="text-soft">· {q.subject_name}</span></span>
                      <span className="shrink-0 font-semibold tabular-nums">{scoreText(q.score, q.max_score)}</span>
                    </div>
                    <Progress value={p} tone={p >= 75 ? "good" : p >= 40 ? "warn" : "bad"} className="mt-1.5 h-1.5" label={`${q.title} score`} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      ) : quizzes.pending.length === 0 ? (
        <Empty icon={<Lightbulb aria-hidden />}>No quizzes yet.</Empty>
      ) : null}
      {quizzes.upcoming.length > 0 && (
        <p className="mt-3 text-xs text-soft">Coming up: {quizzes.upcoming.map((q) => `${q.title} (opens ${formatDateTime(q.opens_at)})`).join(", ")}</p>
      )}
    </Card>
  );
}

function HomeworkCard({ homework, href }: { homework: DashHomework; href: string }) {
  return (
    <Card title="Homework due" icon={<BookOpen aria-hidden />} actions={<ViewAll href={href} />}>
      {homework.items.length === 0 ? (
        <Empty icon={<CircleCheck aria-hidden />}>Nothing due this week.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {homework.items.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-3 py-2.5">
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

function TestsCard({ tests, studentId, resultsHref = "/app/my/results" }: { tests: DashTests; studentId: string; resultsHref?: string }) {
  return (
    <Card title="Latest test results" icon={<TrendingUp aria-hidden />} actions={<ViewAll href={resultsHref} />}>
      {tests.latest.length === 0 ? (
        <Empty icon={<TrendingUp aria-hidden />}>No results are published yet.</Empty>
      ) : (
        <BarList
          valueLabel="Score"
          compareLabel="Class average"
          items={tests.latest.map((t) => ({
            label: `${t.subject_name} · ${t.exam_term_name}`,
            value: t.is_absent ? null : t.percentage,
            compare: t.class_average != null && Number(t.max_marks) ? (t.class_average / Number(t.max_marks)) * 100 : null,
            note: t.is_absent ? "Absent" : `${num(t.marks_obtained)} / ${num(t.max_marks)}${t.grade ? ` · ${t.grade}` : ""}`,
          }))}
        />
      )}
      {tests.report_cards.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {tests.report_cards.map((c) => (
            <Link key={c.exam_term} href={`/app/report-cards/${studentId}/${c.exam_term}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium text-brand transition hover:border-brand/40 hover:bg-brand-soft">
              <Award className="size-4" aria-hidden /> Report card: {c.exam_term_name}
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

/** Chips with each child's name, to choose whose details are shown. */
export function ChildSwitcher({ items, value, onChange }: { items: { id: string; name: string; detail?: string | null }[]; value: string; onChange: (id: string) => void }) {
  if (items.length < 2) return null;
  return (
    <div role="radiogroup" aria-label="Choose a child" className="scrollbar-none -mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1">
      {items.map((c) => {
        const active = c.id === value;
        return (
          <button
            key={c.id}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(c.id)}
            className={cx(
              "flex shrink-0 items-center gap-2.5 rounded-2xl border py-2 pl-2 pr-4 text-left transition duration-200 active:scale-[0.98]",
              active ? "border-brand bg-brand-soft shadow-sm" : "border-line bg-surface hover:border-brand/40",
            )}
          >
            <Avatar name={c.name} size="sm" />
            <span>
              <span className={cx("block text-sm font-semibold leading-tight", active && "text-brand")}>{c.name}</span>
              {c.detail && <span className="block text-xs text-soft">{c.detail}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** The parent's first screen: for the chosen child, attendance, homework, marks, quizzes and fees. */
export function ParentDashboard() {
  const dash = useApi<{ children: ChildSummary[] }>("dashboard/parent");
  const { chosen, choose } = useChildren();
  return (
    <Async
      state={dash}
      loading={<><Loading variant="stats" /><div className="mt-5"><Loading variant="cards" /></div></>}
      isEmpty={(d) => d.children.length === 0}
      empty={<Empty title="No children linked yet">Ask the school office to link your child to your account.</Empty>}
    >
      {(d) => {
        const child = d.children.find((c) => c.student.id === chosen?.id) ?? d.children[0];
        return (
          <div>
            <ChildSwitcher
              items={d.children.map((c) => ({ id: c.student.id, name: c.student.name, detail: c.student.section_name }))}
              value={child.student.id}
              onChange={choose}
            />
            <ChildPanel key={child.student.id} child={child} />
          </div>
        );
      }}
    </Async>
  );
}

function AttendanceHero({ a, name }: { a: DashAttendance; name: string }) {
  const today = a.today ? ATTENDANCE[a.today] : null;
  return (
    <div className="flex items-center gap-4">
      <Ring value={a.month_summary.percentage} label="this month" tone={attendanceTone(a.month_summary.percentage)} />
      <div className="min-w-0 text-sm">
        <div className="font-semibold">{today ? `${name.split(" ")[0]} is ${today.label.toLowerCase()} today` : "Today's attendance is not marked yet"}</div>
        <div className="mt-1 text-soft">{a.month_summary.absent} absent and {a.month_summary.late} late this month</div>
        <div className="text-soft">This year: {pct(a.year_summary.percentage)}</div>
      </div>
    </div>
  );
}

function ChildPanel({ child }: { child: ChildSummary }) {
  const s = child.student;
  const fees = child.fees;
  const billed = fees ? Number(fees.due) - Number(fees.discount) : 0;
  const paidPct = fees && billed > 0 ? (Number(fees.paid) / billed) * 100 : null;
  return (
    <div className="space-y-6">
      <div className="flex animate-enter items-center gap-4 rounded-2xl border border-line bg-gradient-to-br from-brand-soft to-surface p-4 shadow-[var(--shadow-card)] sm:p-5">
        <Avatar name={s.name} size="lg" />
        <div className="min-w-0">
          <h2 className="truncate text-xl font-bold">{s.name}</h2>
          <p className="text-sm text-soft">{s.section_name ?? "No class yet"}{s.roll_no != null ? ` · Roll ${s.roll_no}` : ""} · Adm. {s.admission_no}</p>
          {s.class_teacher && <p className="text-sm text-soft">Class teacher: {s.class_teacher}</p>}
        </div>
      </div>

      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Homework pending" value={child.homework.pending + child.homework.overdue} icon={<BookOpen aria-hidden />} tone={child.homework.overdue ? "bad" : undefined} hint={child.homework.overdue ? `${child.homework.overdue} overdue` : undefined} href="/app/homework" />
        <Stat label="Quizzes not taken" value={child.quizzes.pending.length} icon={<Lightbulb aria-hidden />} tone={child.quizzes.pending.length ? "warn" : undefined} href="/app/quizzes" />
        <Stat label="Fees paid" value={fees ? money(fees.paid, child.currency) : "-"} icon={<Wallet aria-hidden />} tone={fees ? "good" : undefined} progress={paidPct} hint={fees ? `of ${money(billed, child.currency)}` : undefined} href="/app/my/fees" />
        <Stat
          label="Fees remaining"
          value={fees ? money(fees.remaining, child.currency) : "-"}
          icon={<Wallet aria-hidden />}
          tone={fees && Number(fees.overdue) > 0 ? "bad" : fees && Number(fees.remaining) > 0 ? "warn" : fees ? "good" : undefined}
          hint={fees && Number(fees.overdue) > 0 ? `${money(fees.overdue, child.currency)} overdue` : fees?.next_due ? `Next: ${money(fees.next_due.remaining, child.currency)} by ${formatDate(fees.next_due.due_date)}` : undefined}
          href="/app/my/fees"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Attendance" icon={<ClipboardCheck aria-hidden />} actions={<ViewAll href="/app/my/attendance">Calendar</ViewAll>}>
          <AttendanceHero a={child.attendance} name={s.name} />
        </Card>
        <HomeworkCard homework={child.homework} href="/app/homework" />
        <TestsCard tests={child.tests} studentId={s.id} />
        <QuizzesCard quizzes={child.quizzes} student={s.id} />
        <Card title="Fees" icon={<Wallet aria-hidden />} actions={<ViewAll href="/app/my/fees">Statement and receipts</ViewAll>} className="lg:col-span-2">
          {!fees ? (
            <Empty>Fees for this year are not set up yet.</Empty>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="mb-1.5 flex justify-between text-sm">
                  <span className="text-soft">Paid for {fees.academic_year_name}</span>
                  <span className="font-semibold tabular-nums">{paidPct == null ? "-" : `${Math.round(paidPct)}%`}</span>
                </div>
                <Progress value={paidPct ?? 0} tone={Number(fees.overdue) > 0 ? "bad" : "good"} className="h-3" label="Fees paid" />
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div><dt className="text-soft">Total</dt><dd className="font-semibold tabular-nums">{money(fees.due, child.currency)}</dd></div>
                <div><dt className="text-soft">Paid</dt><dd className="font-semibold tabular-nums text-green-700 dark:text-green-300">{money(fees.paid, child.currency)}</dd></div>
                <div><dt className="text-soft">Remaining</dt><dd className="font-semibold tabular-nums">{money(fees.remaining, child.currency)}</dd></div>
                <div><dt className="text-soft">Overdue</dt><dd className={cx("font-semibold tabular-nums", Number(fees.overdue) > 0 && "text-red-700 dark:text-red-300")}>{money(fees.overdue, child.currency)}</dd></div>
              </dl>
              {fees.next_due && <Alert>Next due: <b>{fees.next_due.name}</b>, {money(fees.next_due.remaining, child.currency)} by {formatDate(fees.next_due.due_date)}.</Alert>}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Alert({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">{children}</p>;
}
