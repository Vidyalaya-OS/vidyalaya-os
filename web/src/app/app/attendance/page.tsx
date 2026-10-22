"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useStaffSections } from "@/components/sections";
import { Alert, Badge, Button, Card, DataTable, Empty, Field, Loading, PageHeader, Select, Stat, Tabs, cx } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { pct, todayIso } from "@/lib/format";
import { useSession } from "@/lib/session";
import { AttendanceSheet, AttendanceStatus, AttendanceSummary } from "@/lib/types";
import { useApi } from "@/lib/useApi";

const STATUS: { key: AttendanceStatus; label: string; short: string; tone: string }[] = [
  { key: "present", label: "Present", short: "P", tone: "bg-green-600 text-white" },
  { key: "absent", label: "Absent", short: "A", tone: "bg-red-600 text-white" },
  { key: "late", label: "Late", short: "L", tone: "bg-amber-500 text-white" },
  { key: "leave", label: "On leave", short: "Lv", tone: "bg-slate-500 text-white" },
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
      {tab === "mark" && <MarkSheet />}
      {tab === "today" && <DailyReport />}
      {tab === "month" && <MonthlyReport />}
      {tab === "low" && <LowAttendance />}
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
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    // Start from what is saved whenever the section or date changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(Object.fromEntries((sheet.data?.students ?? []).map((s) => [s.enrollment, s.status])));
  }, [sheet.data]);

  const save = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const data = await api<AttendanceSheet>("attendance/sheet", {
        method: "POST",
        body: { section, date, records: Object.entries(draft).filter(([, s]) => s !== "present").map(([enrollment, status]) => ({ enrollment, status })) },
      });
      sheet.setData(data);
      setNotice({ tone: "success", text: `Saved. ${data.summary.present + data.summary.late} of ${data.students.length} in class.` });
    } catch (e) {
      setNotice({ tone: "error", text: e instanceof ApiError ? e.message : "Could not save." });
    } finally {
      setBusy(false);
    }
  };

  const students = sheet.data?.students ?? [];
  const counts = STATUS.map((s) => ({ ...s, n: students.filter((x) => (draft[x.enrollment] ?? x.status) === s.key).length }));

  return (
    <Card>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <SectionPicker value={section} onChange={setSection} />
        <Field label="Date" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
        <div className="flex items-end text-sm text-soft">
          {sheet.data?.marked ? <span>Marked by {sheet.data.marked_by}</span> : sheet.data ? <Badge tone="warn">Not marked yet</Badge> : null}
        </div>
      </div>
      {notice && <div className="mb-3"><Alert tone={notice.tone}>{notice.text}</Alert></div>}
      {sheet.error && <Alert>{sheet.error}</Alert>}
      {!section ? <Empty>You have no sections to mark.</Empty> : sheet.loading && !sheet.data ? <Loading /> : students.length === 0 ? <Empty>No students in this section.</Empty> : (
        <>
          <p className="mb-3 flex flex-wrap gap-3 text-sm">
            {counts.map((c) => <span key={c.key}><span className="font-semibold">{c.n}</span> <span className="text-soft">{c.label.toLowerCase()}</span></span>)}
          </p>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {students.map((s) => {
              const current = draft[s.enrollment] ?? s.status;
              return (
                <li key={s.enrollment} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{s.roll_no ? `${s.roll_no}. ` : ""}{s.name}</div>
                    <div className="text-xs text-soft">Adm. {s.admission_no}</div>
                  </div>
                  <div className="flex gap-1" role="radiogroup" aria-label={`Attendance for ${s.name}`}>
                    {STATUS.map((st) => (
                      <button
                        key={st.key}
                        role="radio"
                        aria-checked={current === st.key}
                        title={st.label}
                        onClick={() => setDraft((d) => ({ ...d, [s.enrollment]: st.key }))}
                        className={cx("h-10 min-w-10 rounded-lg px-2 text-sm font-semibold", current === st.key ? st.tone : "border border-line text-soft")}
                      >
                        {st.short}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="sticky bottom-0 mt-4 flex gap-2 bg-surface py-2">
            <Button onClick={save} busy={busy}>{sheet.data?.marked ? "Save changes" : "Save attendance"}</Button>
            <Button variant="ghost" onClick={() => setDraft(Object.fromEntries(students.map((s) => [s.enrollment, "present"])))}>Everyone present</Button>
          </div>
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
      {!report.data ? <Loading /> : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Attendance" value={pct(report.data.total.percentage)} />
            <Stat label="Absent" value={report.data.total.absent} tone={report.data.total.absent ? "bad" : undefined} />
            <Stat label="Late" value={report.data.total.late} />
            <Stat label="Sections not marked" value={report.data.unmarked_sections} tone={report.data.unmarked_sections ? "warn" : "good"} />
          </div>
          <Card>
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
      {!report.data ? <Loading /> : <StudentTable rows={report.data.students} />}
    </Card>
  );
}

function LowAttendance() {
  const [threshold, setThreshold] = useState("75");
  const report = useApi<{ students: StudentRow[] }>(`attendance/reports/low?threshold=${encodeURIComponent(threshold || "75")}`);
  return (
    <Card>
      <Field label="Below (%)" type="number" min={1} max={100} value={threshold} onChange={(e) => setThreshold(e.target.value)} className="mb-4 max-w-40" />
      {!report.data ? <Loading /> : report.data.students.length === 0 ? <Empty>No students are under {threshold}% this year.</Empty> : <StudentTable rows={report.data.students} showSection />}
    </Card>
  );
}

function StudentTable({ rows, showSection }: { rows: StudentRow[]; showSection?: boolean }) {
  return (
    <DataTable
      rows={rows}
      rowKey={(r) => r.student}
      columns={[
        { header: "Student", cell: (r) => <Link className="text-brand" href={`/app/students/${r.student}`}>{r.roll_no ? `${r.roll_no}. ` : ""}{r.name}</Link> },
        ...(showSection ? [{ header: "Section", cell: (r: StudentRow) => r.section_name }] : []),
        { header: "Days", cell: (r) => r.marked_days },
        { header: "Absent", cell: (r) => r.absent },
        { header: "Late", cell: (r) => r.late },
        { header: "%", cell: (r) => <span className={cx(r.percentage != null && r.percentage < 75 && "font-semibold text-red-700 dark:text-red-300")}>{pct(r.percentage)}</span> },
      ]}
    />
  );
}
