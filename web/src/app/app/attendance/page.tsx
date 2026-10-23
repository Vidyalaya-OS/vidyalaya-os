"use client";

import { CircleCheck, ClipboardCheck, TriangleAlert, UsersRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Donut } from "@/components/charts";
import { useStaffSections } from "@/components/sections";
import { useToast } from "@/components/toast";
import { Avatar, Badge, Button, Card, DataTable, Empty, ErrorState, Field, Loading, PageHeader, Progress, Select, Stat, StickyBar, Tabs, cx } from "@/components/ui";
import { api } from "@/lib/api";
import { pct, todayIso } from "@/lib/format";
import { useSession } from "@/lib/session";
import { AttendanceSheet, AttendanceStatus, AttendanceSummary } from "@/lib/types";
import { useApi, useDebounced } from "@/lib/useApi";

const STATUS: { key: AttendanceStatus; label: string; short: string; tone: string }[] = [
  { key: "present", label: "Present", short: "P", tone: "bg-green-600 text-white shadow-sm shadow-green-600/30" },
  { key: "absent", label: "Absent", short: "A", tone: "bg-red-600 text-white shadow-sm shadow-red-600/30" },
  { key: "late", label: "Late", short: "L", tone: "bg-amber-500 text-white shadow-sm shadow-amber-500/30" },
  { key: "leave", label: "On leave", short: "Lv", tone: "bg-slate-500 text-white shadow-sm" },
];

type Tab = "mark" | "today" | "month" | "low";

export default function AttendancePage() {
  const { hasRole } = useSession();
  const isAdmin = hasRole("admin");
  const [tab, setTab] = useState<Tab>("mark");
  return (
    <>
      <PageHeader title="Attendance" subtitle="Everyone starts present. Tap the students who are absent or late, then save." />
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "mark", label: "Mark attendance" },
          { key: "today", label: isAdmin ? "Today by class" : "Today" },
          { key: "month", label: "Monthly" },
          { key: "low", label: "Below 75%" },
        ]}
      />
      <div key={tab} className="animate-enter">
        {tab === "mark" && <MarkSheet />}
        {tab === "today" && <DailyReport />}
        {tab === "month" && <MonthlyReport />}
        {tab === "low" && <LowAttendance />}
      </div>
    </>
  );
}

function SectionPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const sections = useStaffSections();
  useEffect(() => {
    if (!value && sections[0]) onChange(sections[0].id);
  }, [value, sections, onChange]);
  return (
    <Select label="Section" value={value} onChange={(e) => onChange(e.target.value)}>
      {sections.length === 0 && <option value="">No sections</option>}
      {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </Select>
  );
}

function MarkSheet() {
  const [section, setSection] = useState("");
  const [date, setDate] = useState(todayIso());
  const sheet = useApi<AttendanceSheet>(section ? `attendance/sheet?section=${section}&date=${date}` : null);
  const [draft, setDraft] = useState<Record<string, AttendanceStatus>>({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    // Start from what is saved whenever the section or date changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(Object.fromEntries((sheet.data?.students ?? []).map((s) => [s.enrollment, s.status])));
  }, [sheet.data]);

  const save = async () => {
    setBusy(true);
    try {
      const data = await api<AttendanceSheet>("attendance/sheet", {
        method: "POST",
        body: { section, date, records: Object.entries(draft).filter(([, s]) => s !== "present").map(([enrollment, status]) => ({ enrollment, status })) },
      });
      sheet.setData(data);
      toast.success(`Attendance saved. ${data.summary.present + data.summary.late} of ${data.students.length} in class.`);
    } catch (e) {
      toast.error(e, "Could not save attendance. Your changes are still here; try again.");
    } finally {
      setBusy(false);
    }
  };

  const students = sheet.data?.students ?? [];
  const counts = STATUS.map((s) => ({ ...s, n: students.filter((x) => (draft[x.enrollment] ?? x.status) === s.key).length }));
  const changed = students.some((s) => (draft[s.enrollment] ?? s.status) !== s.status);
  const inClass = counts[0].n + counts[2].n;

  return (
    <Card title="Mark attendance" icon={<ClipboardCheck aria-hidden />}>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <SectionPicker value={section} onChange={setSection} />
        <Field label="Date" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
        <div className="flex items-end text-sm text-soft">
          {sheet.data?.marked ? <Badge tone="good" dot>Marked by {sheet.data.marked_by}</Badge> : sheet.data ? <Badge tone="warn" dot>Not marked yet</Badge> : null}
        </div>
      </div>
      {sheet.error && !sheet.data && <ErrorState message={sheet.error} onRetry={sheet.reload} />}
      {!section ? <Empty icon={<UsersRound aria-hidden />}>You have no sections to mark.</Empty> : sheet.loading && !sheet.data ? <Loading rows={6} /> : sheet.data && students.length === 0 ? <Empty icon={<UsersRound aria-hidden />}>No students in this section.</Empty> : !sheet.data ? null : (
        <>
          <div className="mb-4 rounded-xl bg-muted/50 p-3">
            <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {counts.map((c) => (
                <span key={c.key} className="flex items-center gap-1.5">
                  <span className={cx("size-2.5 rounded-full", c.tone.split(" ")[0])} aria-hidden />
                  <span className="font-semibold tabular-nums">{c.n}</span> <span className="text-soft">{c.label.toLowerCase()}</span>
                </span>
              ))}
            </div>
            <Progress value={students.length ? (inClass / students.length) * 100 : 0} tone={inClass / Math.max(1, students.length) < 0.75 ? "bad" : "good"} label="In class" />
          </div>
          <ul className="stagger divide-y divide-line overflow-hidden rounded-xl border border-line">
            {students.map((s) => {
              const current = draft[s.enrollment] ?? s.status;
              return (
                <li key={s.enrollment} className={cx("flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 transition-colors", current === "absent" && "bg-red-50/70 dark:bg-red-950/30", current === "late" && "bg-amber-50/70 dark:bg-amber-950/30")}>
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={s.name} size="sm" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{s.roll_no ? `${s.roll_no}. ` : ""}{s.name}</div>
                      <div className="text-xs text-soft">Adm. {s.admission_no}</div>
                    </div>
                  </div>
                  <div className="flex gap-1" role="radiogroup" aria-label={`Attendance for ${s.name}`}>
                    {STATUS.map((st) => (
                      <button
                        key={st.key}
                        role="radio"
                        aria-checked={current === st.key}
                        title={st.label}
                        onClick={() => setDraft((d) => ({ ...d, [s.enrollment]: st.key }))}
                        aria-label={`${st.label}: ${s.name}`}
                        className={cx("h-11 min-w-11 rounded-xl px-2 text-sm font-bold transition duration-150 active:scale-90", current === st.key ? `${st.tone} scale-105` : "border border-line bg-surface text-soft hover:border-soft/50 hover:text-ink")}
                      >
                        {st.short}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
          <StickyBar>
            <Button onClick={save} busy={busy}><CircleCheck aria-hidden /> {sheet.data?.marked ? "Save changes" : "Save attendance"}</Button>
            <Button variant="ghost" onClick={() => setDraft(Object.fromEntries(students.map((s) => [s.enrollment, "present"])))}>Everyone present</Button>
            {changed && <span className="ml-auto text-xs font-medium text-amber-700 dark:text-amber-300">Unsaved changes</span>}
          </StickyBar>
        </>
      )}
    </Card>
  );
}

type DailyRow = AttendanceSummary & { section: string; section_name: string; students: number; marked: boolean };

function DailyReport() {
  const [date, setDate] = useState(todayIso());
  const report = useApi<{ sections: DailyRow[]; total: AttendanceSummary; unmarked_sections: number }>(`attendance/reports/daily?date=${date}`);
  return (
    <div className="space-y-4">
      <Field label="Date" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} className="max-w-xs" />
      {report.error && !report.data ? <ErrorState message={report.error} onRetry={report.reload} /> : !report.data ? <Loading variant="stats" /> : (
        <>
          <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Attendance" value={pct(report.data.total.percentage)} progress={report.data.total.percentage} />
            <Stat label="Absent" value={report.data.total.absent} tone={report.data.total.absent ? "bad" : undefined} />
            <Stat label="Late" value={report.data.total.late} />
            <Stat label="Sections not marked" value={report.data.unmarked_sections} tone={report.data.unmarked_sections ? "warn" : "good"} />
          </div>
          <Card title="By section" icon={<ClipboardCheck aria-hidden />}>
            <div className="mb-5">
              <Donut segments={[
                { label: "Present", value: report.data.total.present, tone: "good" },
                { label: "Late", value: report.data.total.late, tone: "warn" },
                { label: "Absent", value: report.data.total.absent, tone: "bad" },
                { label: "On leave", value: report.data.total.leave, tone: "neutral" },
              ]} centre={<span className="text-base font-bold tabular-nums">{pct(report.data.total.percentage)}</span>} />
            </div>
            <DataTable
              rows={report.data.sections}
              rowKey={(r) => r.section}
              columns={[
                { header: "Section", cell: (r) => r.section_name },
                { header: "Students", cell: (r) => r.students },
                { header: "Present", cell: (r) => (r.marked ? r.present + r.late : "-") },
                { header: "Absent", cell: (r) => (r.marked ? r.absent : "-") },
                { header: "%", cell: (r) => pct(r.percentage) },
                { header: "Status", cell: (r) => <Badge tone={r.marked ? "good" : "warn"}>{r.marked ? "Marked" : "Not marked"}</Badge> },
              ]}
            />
          </Card>
        </>
      )}
    </div>
  );
}

type StudentRow = AttendanceSummary & { student: string; name: string; roll_no: number | null; section_name?: string };

function MonthlyReport() {
  const [section, setSection] = useState("");
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const report = useApi<{ students: StudentRow[] }>(section ? `attendance/reports/monthly?section=${section}&month=${month}` : null);
  return (
    <Card>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <SectionPicker value={section} onChange={setSection} />
        <Field label="Month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>
      {report.error && !report.data ? <ErrorState message={report.error} onRetry={report.reload} /> : !report.data ? <Loading variant="table" /> : <StudentTable rows={report.data.students} />}
    </Card>
  );
}

function LowAttendance() {
  const [threshold, setThreshold] = useState("75");
  const settled = useDebounced(threshold, 400);
  const report = useApi<{ students: StudentRow[] }>(`attendance/reports/low?threshold=${encodeURIComponent(settled || "75")}`);
  return (
    <Card title="Low attendance this year" icon={<TriangleAlert aria-hidden />}>
      <Field label="Below (%)" type="number" min={1} max={100} value={threshold} onChange={(e) => setThreshold(e.target.value)} className="mb-4 max-w-40" />
      {report.error && !report.data ? <ErrorState message={report.error} onRetry={report.reload} /> : !report.data ? <Loading variant="table" /> : report.data.students.length === 0 ? <Empty icon={<CircleCheck aria-hidden />} title="Everyone is above the line">No students are under {threshold}% this year.</Empty> : <StudentTable rows={report.data.students} showSection />}
    </Card>
  );
}

function StudentTable({ rows, showSection }: { rows: StudentRow[]; showSection?: boolean }) {
  return (
    <DataTable
      rows={rows}
      rowKey={(r) => r.student}
      columns={[
        { header: "Student", cell: (r) => <Link className="font-medium text-brand hover:underline" href={`/app/students/${r.student}`}>{r.roll_no ? `${r.roll_no}. ` : ""}{r.name}</Link> },
        ...(showSection ? [{ header: "Section", cell: (r: StudentRow) => r.section_name }] : []),
        { header: "Days", cell: (r) => r.marked_days },
        { header: "Absent", cell: (r) => r.absent },
        { header: "Late", cell: (r) => r.late },
        { header: "%", cell: (r) => <span className={cx(r.percentage != null && r.percentage < 75 && "font-semibold text-red-700 dark:text-red-300")}>{pct(r.percentage)}</span> },
      ]}
    />
  );
}
