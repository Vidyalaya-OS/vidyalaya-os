"use client";

import Link from "next/link";
import { useState } from "react";
import { FeeStatement } from "@/components/FeeStatement";
import { HomeworkList } from "@/components/HomeworkList";
import { Badge, Card, Empty, Field, Loading, Stat, Tabs, cx } from "@/components/ui";
import { num, pct, todayIso } from "@/lib/format";
import { useSession } from "@/lib/session";
import { AttendanceStatus, StudentAttendance, TermResult } from "@/lib/types";
import { useApi } from "@/lib/useApi";

type Tab = "attendance" | "results" | "homework" | "fees";

/** Attendance, results, homework and fees for one student, as each role may see them. */
export function StudentRecord({ studentId }: { studentId: string }) {
  const { hasRole } = useSession();
  const seesFees = hasRole("admin", "student", "parent");
  const seesHomework = hasRole("student", "parent", "admin", "teacher");
  const tabs: { key: Tab; label: string }[] = [
    { key: "attendance", label: "Attendance" },
    { key: "results", label: "Results" },
    ...(seesHomework ? [{ key: "homework" as Tab, label: "Homework" }] : []),
    ...(seesFees ? [{ key: "fees" as Tab, label: "Fees" }] : []),
  ];
  const [tab, setTab] = useState<Tab>("attendance");
  return (
    <section className="mt-6 first:mt-0">
      <Tabs<Tab> tabs={tabs} value={tab} onChange={setTab} />
      {tab === "attendance" && <AttendanceCalendar studentId={studentId} />}
      {tab === "results" && <Results studentId={studentId} />}
      {tab === "homework" && <Card><HomeworkList query={`student=${studentId}&upcoming=true`} canMarkDone={hasRole("student") && !hasRole("parent")} /></Card>}
      {tab === "fees" && <FeeStatement studentId={studentId} isAdmin={hasRole("admin")} />}
    </section>
  );
}

const COLORS: Record<AttendanceStatus, string> = {
  present: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200",
  absent: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  late: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  leave: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
};

export function AttendanceCalendar({ studentId }: { studentId: string }) {
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const data = useApi<StudentAttendance>(`attendance/students/${studentId}?month=${month}`);
  if (data.error) return <p className="text-sm text-red-600">{data.error}</p>;
  if (!data.data) return <Loading />;
  const d = data.data;
  const byDate = new Map(d.days.map((x) => [x.date, x]));
  const [y, m] = d.month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7; // Monday first
  const cells = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="This month" value={pct(d.month_summary.percentage)} hint={`${d.month_summary.attended} of ${d.month_summary.marked_days} days`} />
        <Stat label="Absent this month" value={d.month_summary.absent} tone={d.month_summary.absent ? "bad" : undefined} />
        <Stat label={`Year ${d.academic_year ?? ""}`} value={pct(d.year_summary.percentage)} tone={d.year_summary.percentage != null && d.year_summary.percentage < 75 ? "bad" : "good"} hint={`${d.year_summary.attended} of ${d.year_summary.marked_days} days`} />
        <Stat label="Late this year" value={d.year_summary.late} />
      </div>
      <Card title="Calendar" actions={<Field label="Month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />}>
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => <div key={w} className="py-1 text-soft">{w}</div>)}
          {cells.map((day, i) => {
            if (day == null) return <div key={`e${i}`} />;
            const iso = `${d.month}-${String(day).padStart(2, "0")}`;
            const rec = byDate.get(iso);
            return (
              <div key={iso} title={rec ? `${rec.status}${rec.remark ? `: ${rec.remark}` : ""}` : "Not marked"}
                className={cx("rounded-md py-2", rec ? COLORS[rec.status] : "text-soft")}>
                <div className="font-medium">{day}</div>
                <div className="text-[10px] capitalize">{rec?.status ?? ""}</div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

export function Results({ studentId }: { studentId: string }) {
  const data = useApi<{ terms: TermResult[] }>(`results/students/${studentId}`);
  if (data.error) return <p className="text-sm text-red-600">{data.error}</p>;
  if (!data.data) return <Loading />;
  const terms = data.data.terms.filter((t) => t.subjects.length > 0 || t.report_card_published);
  if (terms.length === 0) return <Empty>No results are published yet.</Empty>;
  return (
    <div className="space-y-4">
      {terms.map((t) => (
        <Card key={t.exam_term} title={t.exam_term_name} actions={
          <div className="flex items-center gap-3 text-sm">
            {t.percentage != null && <span className="font-medium">{pct(t.percentage)} {t.grade && <Badge tone="good">{t.grade}</Badge>}</span>}
            {t.report_card_published && <Link className="text-brand" href={`/app/report-cards/${studentId}/${t.exam_term}`}>Report card</Link>}
          </div>
        }>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-soft">
                  <th className="py-2 pr-3">Subject</th><th className="py-2 pr-3 text-right">Marks</th><th className="py-2 pr-3">Grade</th><th className="py-2 text-right">Class avg.</th>
                </tr>
              </thead>
              <tbody>
                {t.subjects.map((s) => (
                  <tr key={s.exam} className="border-b border-line last:border-0">
                    <td className="py-2 pr-3">{s.subject_name}{s.status === "draft" && <span className="ml-2"><Badge tone="warn">Not published</Badge></span>}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{s.is_absent ? "Absent" : `${num(s.marks_obtained)} / ${num(s.max_marks)}`}</td>
                    <td className="py-2 pr-3 font-medium">{s.grade ?? "-"}</td>
                    <td className="py-2 text-right tabular-nums">{s.class_average ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-sm text-soft">Total {num(t.total)} / {num(t.total_max)}</p>
        </Card>
      ))}
    </div>
  );
}
