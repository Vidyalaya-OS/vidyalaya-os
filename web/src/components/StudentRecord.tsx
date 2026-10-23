"use client";

import { Award, ClipboardCheck, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Legend, MonthGrid, MonthNav, shiftMonth } from "@/components/Calendar";
import { BarList, Donut, TrendLine } from "@/components/charts";
import { FeeStatement } from "@/components/FeeStatement";
import { HomeworkList } from "@/components/HomeworkList";
import { Async, Badge, ButtonLink, Card, Empty, Loading, Stat, Tabs } from "@/components/ui";
import { api } from "@/lib/api";
import { num, pct, todayIso } from "@/lib/format";
import { useSession } from "@/lib/session";
import { AttendanceStatus, StudentAttendance, TermResult } from "@/lib/types";
import { useApi } from "@/lib/useApi";

type Tab = "attendance" | "results" | "homework" | "fees";

/** Attendance, results, homework and fees for one student, as each role may see them. */
export function StudentRecord({ studentId }: { studentId: string }) {
  const { hasRole } = useSession();
  const seesFees = hasRole("admin", "student", "parent");
  const tabs: { key: Tab; label: string }[] = [
    { key: "attendance", label: "Attendance" },
    { key: "results", label: "Results" },
    { key: "homework", label: "Homework" },
    ...(seesFees ? [{ key: "fees" as Tab, label: "Fees" }] : []),
  ];
  const [tab, setTab] = useState<Tab>("attendance");
  return (
    <section className="mt-6 first:mt-0">
      <Tabs<Tab> tabs={tabs} value={tab} onChange={setTab} />
      <div key={tab} className="animate-enter">
        {tab === "attendance" && <AttendanceCalendar studentId={studentId} />}
        {tab === "results" && <Results studentId={studentId} />}
        {tab === "homework" && <Card><HomeworkList query={`student=${studentId}&upcoming=true`} canMarkDone={hasRole("student") && !hasRole("parent")} /></Card>}
        {tab === "fees" && <FeeStatement studentId={studentId} isAdmin={hasRole("admin")} />}
      </div>
    </section>
  );
}

export const ATTENDANCE_COLORS: Record<AttendanceStatus, { cell: string; dot: string; label: string }> = {
  present: { cell: "border-green-200 bg-green-50 text-green-900 dark:border-green-900/60 dark:bg-green-950/50 dark:text-green-200", dot: "bg-green-500", label: "Present" },
  absent: { cell: "border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200", dot: "bg-red-500", label: "Absent" },
  late: { cell: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-200", dot: "bg-amber-500", label: "Late" },
  leave: { cell: "border-slate-200 bg-slate-100 text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200", dot: "bg-slate-400", label: "On leave" },
};

function tone(p: number | null | undefined) {
  return p == null ? undefined : p < 75 ? "bad" : p < 90 ? "warn" : "good";
}

export function AttendanceCalendar({ studentId }: { studentId: string }) {
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const data = useApi<StudentAttendance>(`attendance/students/${studentId}?month=${month}`);
  const d = data.data?.month === month ? data.data : null;
  const byDate = new Map((d?.days ?? []).map((x) => [x.date, x]));

  return (
    <div className="space-y-5">
      {data.data && (
        <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="This month" value={pct(data.data.month_summary.percentage)} tone={tone(data.data.month_summary.percentage)} progress={data.data.month_summary.percentage} hint={`${data.data.month_summary.attended} of ${data.data.month_summary.marked_days} days`} />
          <Stat label="Absent this month" value={data.data.month_summary.absent} tone={data.data.month_summary.absent ? "bad" : undefined} />
          <Stat label={`Year ${data.data.academic_year ?? ""}`} value={pct(data.data.year_summary.percentage)} tone={tone(data.data.year_summary.percentage)} progress={data.data.year_summary.percentage} hint={`${data.data.year_summary.attended} of ${data.data.year_summary.marked_days} days`} />
          <Stat label="Late this year" value={data.data.year_summary.late} />
        </div>
      )}
      <div className="grid gap-5 xl:grid-cols-[1fr_20rem]">
        <Card title="Calendar" icon={<ClipboardCheck aria-hidden />} actions={<MonthNav month={month} onChange={setMonth} max={todayIso().slice(0, 7)} />}>
          {data.error && !data.data ? (
            <Async state={data}>{() => null}</Async>
          ) : !d ? (
            <Loading variant="text" rows={6} />
          ) : (
            <>
              <MonthGrid
                month={month}
                dayClass={(iso) => {
                  const rec = byDate.get(iso);
                  return rec ? ATTENDANCE_COLORS[rec.status].cell : undefined;
                }}
                dayNote={(iso) => {
                  const rec = byDate.get(iso);
                  return rec ? <span className="hidden sm:inline" title={rec.remark || undefined}>{ATTENDANCE_COLORS[rec.status].label}</span> : null;
                }}
              />
              <div className="mt-4">
                <Legend items={Object.values(ATTENDANCE_COLORS).map((c) => ({ label: c.label, className: c.dot }))} />
              </div>
            </>
          )}
        </Card>
        <div className="space-y-5">
          {d && (
            <Card title="This month">
              <Donut
                size={110}
                segments={[
                  { label: "Present", value: d.month_summary.present, tone: "good" },
                  { label: "Late", value: d.month_summary.late, tone: "warn" },
                  { label: "Absent", value: d.month_summary.absent, tone: "bad" },
                  { label: "On leave", value: d.month_summary.leave, tone: "neutral" },
                ]}
                centre={<span className="text-base font-bold tabular-nums">{pct(d.month_summary.percentage)}</span>}
              />
            </Card>
          )}
          <AttendanceTrend studentId={studentId} />
        </div>
      </div>
    </div>
  );
}

/** The last six months of attendance as a line. */
function AttendanceTrend({ studentId }: { studentId: string }) {
  const [points, setPoints] = useState<{ label: string; value: number | null }[] | null>(null);
  useEffect(() => {
    const now = todayIso().slice(0, 7);
    const months = Array.from({ length: 6 }, (_, i) => shiftMonth(now, i - 5));
    let live = true;
    Promise.all(months.map((m) => api<StudentAttendance>(`attendance/students/${studentId}?month=${m}`).catch(() => null))).then((res) => {
      if (!live) return;
      setPoints(months.map((m, i) => ({
        label: new Date(`${m}-01T00:00:00`).toLocaleDateString(undefined, { month: "short" }),
        value: res[i]?.month_summary.marked_days ? res[i]!.month_summary.percentage : null,
      })));
    });
    return () => {
      live = false;
    };
  }, [studentId]);
  return (
    <Card title="Last six months" icon={<TrendingUp aria-hidden />} description="The dashed line is 75%.">
      {!points ? <Loading variant="text" /> : points.every((p) => p.value == null) ? <Empty>No attendance marked yet.</Empty> : <TrendLine points={points} threshold={75} />}
    </Card>
  );
}

export function Results({ studentId }: { studentId: string }) {
  const data = useApi<{ terms: TermResult[] }>(`results/students/${studentId}`);
  return (
    <Async
      state={data}
      loading={<Loading variant="cards" rows={2} />}
      isEmpty={(r) => r.terms.every((t) => t.subjects.length === 0 && !t.report_card_published)}
      empty={<Empty icon={<TrendingUp aria-hidden />} title="No results yet">Results show here once the school publishes them.</Empty>}
    >
      {(r) => (
        <div className="stagger space-y-5">
          {r.terms.filter((t) => t.subjects.length > 0 || t.report_card_published).map((t) => (
            <Card
              key={t.exam_term}
              title={t.exam_term_name}
              icon={<Award aria-hidden />}
              description={`Total ${num(t.total)} / ${num(t.total_max)}`}
              actions={
                <div className="flex items-center gap-2">
                  {t.percentage != null && <span className="text-lg font-bold tabular-nums">{pct(t.percentage)}</span>}
                  {t.grade && <Badge tone="good">{t.grade}</Badge>}
                  {t.report_card_published && <ButtonLink size="sm" variant="soft" href={`/app/report-cards/${studentId}/${t.exam_term}`}>Report card</ButtonLink>}
                </div>
              }
            >
              <div className="grid gap-6 lg:grid-cols-2">
                <BarList
                  valueLabel="Score"
                  compareLabel="Class average"
                  items={t.subjects.map((s) => ({
                    label: s.subject_name,
                    value: s.is_absent ? null : s.percentage,
                    compare: s.class_average != null && Number(s.max_marks) ? (s.class_average / Number(s.max_marks)) * 100 : null,
                    note: s.is_absent ? "Absent" : undefined,
                  }))}
                />
                <div className="-mx-1 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-line text-xs font-semibold uppercase tracking-wide text-soft">
                        <th className="px-1 py-2">Subject</th><th className="px-1 py-2 text-right">Marks</th><th className="px-1 py-2">Grade</th><th className="px-1 py-2 text-right">Class avg.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {t.subjects.map((s) => (
                        <tr key={s.exam} className="border-b border-line last:border-0">
                          <td className="px-1 py-2.5">{s.subject_name}{s.status === "draft" && <span className="ml-2"><Badge tone="warn">Not published</Badge></span>}</td>
                          <td className="px-1 py-2.5 text-right tabular-nums">{s.is_absent ? "Absent" : `${num(s.marks_obtained)} / ${num(s.max_marks)}`}</td>
                          <td className="px-1 py-2.5 font-semibold">{s.grade ?? "-"}</td>
                          <td className="px-1 py-2.5 text-right tabular-nums">{s.class_average ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {t.report_card_published && (
                <p className="mt-4 text-sm"><Link className="font-medium text-brand hover:underline" href={`/app/report-cards/${studentId}/${t.exam_term}`}>Open the report card to print or save as PDF</Link></p>
              )}
            </Card>
          ))}
        </div>
      )}
    </Async>
  );
}
