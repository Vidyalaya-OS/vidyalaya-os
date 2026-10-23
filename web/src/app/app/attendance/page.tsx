"use client";

import { CircleCheck, ClipboardCheck, IdCard, TriangleAlert, UserRoundCheck, UsersRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Donut } from "@/components/charts";
import { TEACHER_ATTENDANCE_SAVED } from "@/components/AdminReminders";
import { Legend, MonthGrid, MonthNav } from "@/components/Calendar";
import { useStaffSections } from "@/components/sections";
import { ATTENDANCE_COLORS } from "@/components/StudentRecord";
import { useToast } from "@/components/toast";
import { Alert, Avatar, Badge, Button, Card, DataTable, Empty, ErrorState, Field, Loading, PageHeader, Progress, Select, Stat, StickyBar, Tabs, cx } from "@/components/ui";
import { api } from "@/lib/api";
import { pct, todayIso } from "@/lib/format";
import { useSession } from "@/lib/session";
import { AttendanceSheet, AttendanceStatus, AttendanceSummary, MyTeacherAttendance, TeacherAttendanceSheet } from "@/lib/types";
import { useApi, useDebounced } from "@/lib/useApi";

const STATUS: { key: AttendanceStatus; label: string; short: string; tone: string }[] = [
  { key: "present", label: "Present", short: "P", tone: "bg-green-600 text-white shadow-sm shadow-green-600/30" },
  { key: "absent", label: "Absent", short: "A", tone: "bg-red-600 text-white shadow-sm shadow-red-600/30" },
  { key: "late", label: "Late", short: "L", tone: "bg-amber-500 text-white shadow-sm shadow-amber-500/30" },
  { key: "leave", label: "On leave", short: "Lv", tone: "bg-slate-500 text-white shadow-sm" },
];

type Tab = "teachers" | "teacher-month" | "mark" | "mine" | "today" | "month" | "low";

/** Who marks whom: in the admin portal this is the teachers' register (and
 * read-only student reports); in the teacher portal it is the students'
 * register and the teacher's own attendance. */
export default function AttendancePage() {
  const { portal } = useSession();
  const isAdmin = portal === "admin";
  const [tab, setTab] = useState<Tab>(isAdmin ? "teachers" : "mark");
  const tabs: { key: Tab; label: string }[] = isAdmin
    ? [
      { key: "teachers", label: "Teachers" },
      { key: "teacher-month", label: "Teachers by month" },
      { key: "today", label: "Students today" },
      { key: "month", label: "Students by month" },
      { key: "low", label: "Below 75%" },
    ]
    : [
      { key: "mark", label: "Mark students" },
      { key: "mine", label: "My attendance" },
      { key: "today", label: "Today" },
      { key: "month", label: "Monthly" },
      { key: "low", label: "Below 75%" },
    ];
  return (
    <>
      <PageHeader
        title="Attendance"
        subtitle={isAdmin
          ? "Mark your teachers every day. Students are marked by their own teachers; their reports are here for you to follow up."
          : "Everyone starts present. Tap the students who are absent or late, then save."}
      />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={tabs} />
      <div key={tab} className="animate-enter">
        {tab === "teachers" && <TeacherSheet />}
        {tab === "teacher-month" && <TeacherMonthly />}
        {tab === "mark" && <MarkSheet />}
        {tab === "mine" && <MyAttendance />}
        {tab === "today" && <DailyReport studentsOnly={isAdmin} />}
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
  const canMark = sheet.data?.can_mark ?? false;

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
      {sheet.data && !canMark && sheet.data.cannot_mark_reason && (
        <div className="mb-4"><Alert tone="warn" title="You can look, but not mark this one">{sheet.data.cannot_mark_reason}</Alert></div>
      )}
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
                        disabled={!canMark}
                        aria-checked={current === st.key}
                        title={st.label}
                        onClick={() => setDraft((d) => ({ ...d, [s.enrollment]: st.key }))}
                        aria-label={`${st.label}: ${s.name}`}
                        className={cx("h-11 min-w-11 rounded-xl px-2 text-sm font-bold transition duration-150 active:scale-90 disabled:cursor-not-allowed disabled:active:scale-100", current === st.key ? `${st.tone} scale-105` : "border border-line bg-surface text-soft hover:border-soft/50 hover:text-ink")}
                      >
                        {st.short}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
          {canMark && (
            <StickyBar>
              <Button onClick={save} busy={busy}><CircleCheck aria-hidden /> {sheet.data?.marked ? "Save changes" : "Save attendance"}</Button>
              <Button variant="ghost" onClick={() => setDraft(Object.fromEntries(students.map((s) => [s.enrollment, "present"])))}>Everyone present</Button>
              {changed && <span className="ml-auto text-xs font-medium text-amber-700 dark:text-amber-300">Unsaved changes</span>}
            </StickyBar>
          )}
        </>
      )}
    </Card>
  );
}

type DailyRow = AttendanceSummary & { section: string; section_name: string; students: number; marked: boolean };

function DailyReport({ studentsOnly }: { studentsOnly?: boolean }) {
  const [date, setDate] = useState(todayIso());
  const report = useApi<{ sections: DailyRow[]; total: AttendanceSummary; unmarked_sections: number }>(`attendance/reports/daily?date=${date}`);
  return (
    <div className="space-y-4">
      {studentsOnly && <Alert tone="info" title="Students are marked by their teachers">Each section&apos;s class teacher or subject teachers take the roll call. Sections still to mark show as Not marked; remind their teacher.</Alert>}
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

/** The admin's daily register of teachers. Required every day: until it is
 * saved, the admin's home screen and menu keep reminding them. */
function TeacherSheet() {
  const [date, setDate] = useState(todayIso());
  const sheet = useApi<TeacherAttendanceSheet>(`attendance/teachers/sheet?date=${date}`);
  const [draft, setDraft] = useState<Record<string, { status: AttendanceStatus; remark: string }>>({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(Object.fromEntries((sheet.data?.teachers ?? []).map((t) => [t.teacher, { status: t.status, remark: t.remark }])));
  }, [sheet.data]);

  const teachers = sheet.data?.teachers ?? [];
  const pick = (id: string) => draft[id] ?? { status: "present" as AttendanceStatus, remark: "" };
  const counts = STATUS.map((s) => ({ ...s, n: teachers.filter((t) => pick(t.teacher).status === s.key).length }));
  const changed = teachers.some((t) => !t.marked || pick(t.teacher).status !== t.status || pick(t.teacher).remark !== t.remark);

  const save = async () => {
    setBusy(true);
    try {
      const records = teachers
        .map((t) => ({ teacher: t.teacher, ...pick(t.teacher) }))
        .filter((r) => r.status !== "present" || r.remark);
      const data = await api<TeacherAttendanceSheet>("attendance/teachers/sheet", { method: "POST", body: { date, records } });
      sheet.setData(data);
      window.dispatchEvent(new Event(TEACHER_ATTENDANCE_SAVED));
      toast.success(`Teacher attendance saved. ${data.summary.present + data.summary.late} of ${data.teachers.length} teachers in school.`);
    } catch (e) {
      toast.error(e, "Could not save teacher attendance. Your changes are still here; try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Teacher attendance" icon={<UserRoundCheck aria-hidden />} description="Required every working day. Teachers marked absent or on leave cannot take their classes' roll call that day.">
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Field label="Date" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
        <div className="flex items-end sm:col-span-2">
          {sheet.data && (sheet.data.marked
            ? <Badge tone="good" dot>Marked by {sheet.data.marked_by}</Badge>
            : <Badge tone="bad" dot>{sheet.data.unmarked.length} of {teachers.length} not marked yet</Badge>)}
        </div>
      </div>
      {sheet.error && !sheet.data ? <ErrorState message={sheet.error} onRetry={sheet.reload} /> : !sheet.data ? <Loading rows={5} /> : teachers.length === 0 ? (
        <Empty icon={<IdCard aria-hidden />} title="No teachers yet">Add teachers in School office, Teachers. They will appear here to mark each day.</Empty>
      ) : (
        <>
          {!sheet.data.marked && date === todayIso() && (
            <div className="mb-4"><Alert tone="warn" title="Today's teacher attendance is still to do">Everyone starts present. Tap anyone absent, late or on leave, add a note if you like, then save.</Alert></div>
          )}
          <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 rounded-xl bg-muted/50 p-3 text-sm">
            {counts.map((c) => (
              <span key={c.key} className="flex items-center gap-1.5">
                <span className={cx("size-2.5 rounded-full", c.tone.split(" ")[0])} aria-hidden />
                <span className="font-semibold tabular-nums">{c.n}</span> <span className="text-soft">{c.label.toLowerCase()}</span>
              </span>
            ))}
          </div>
          <ul className="stagger divide-y divide-line overflow-hidden rounded-xl border border-line">
            {teachers.map((t) => {
              const current = pick(t.teacher);
              return (
                <li key={t.teacher} className={cx("px-3 py-2.5 transition-colors", current.status === "absent" && "bg-red-50/70 dark:bg-red-950/30", current.status === "late" && "bg-amber-50/70 dark:bg-amber-950/30", current.status === "leave" && "bg-slate-100/70 dark:bg-slate-800/40")}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={t.name} size="sm" />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{t.name}</div>
                        <div className="text-xs text-soft">{t.employee_no ? `Emp. ${t.employee_no}` : "Teacher"}{t.marked ? "" : " · not marked"}</div>
                      </div>
                    </div>
                    <div className="flex gap-1" role="radiogroup" aria-label={`Attendance for ${t.name}`}>
                      {STATUS.map((st) => (
                        <button
                          key={st.key}
                          role="radio"
                          aria-checked={current.status === st.key}
                          title={st.label}
                          aria-label={`${st.label}: ${t.name}`}
                          onClick={() => setDraft((d) => ({ ...d, [t.teacher]: { ...current, status: st.key } }))}
                          className={cx("h-11 min-w-11 rounded-xl px-2 text-sm font-bold transition duration-150 active:scale-90", current.status === st.key ? `${st.tone} scale-105` : "border border-line bg-surface text-soft hover:border-soft/50 hover:text-ink")}
                        >
                          {st.short}
                        </button>
                      ))}
                    </div>
                  </div>
                  {current.status !== "present" && (
                    <input
                      value={current.remark}
                      onChange={(e) => setDraft((d) => ({ ...d, [t.teacher]: { ...current, remark: e.target.value } }))}
                      placeholder="Note, such as sick leave or training (optional)"
                      maxLength={200}
                      aria-label={`Note for ${t.name}`}
                      className="mt-2 min-h-10 w-full animate-fade rounded-xl border border-line bg-surface px-3 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-[var(--ring)]"
                    />
                  )}
                </li>
              );
            })}
          </ul>
          <StickyBar>
            <Button onClick={save} busy={busy}><CircleCheck aria-hidden /> {sheet.data.marked ? "Save changes" : "Save teacher attendance"}</Button>
            <Button variant="ghost" onClick={() => setDraft(Object.fromEntries(teachers.map((t) => [t.teacher, { status: "present", remark: "" }])))}>Everyone present</Button>
            {changed && <span className="ml-auto text-xs font-medium text-amber-700 dark:text-amber-300">{sheet.data.marked ? "Unsaved changes" : "Not saved yet"}</span>}
          </StickyBar>
        </>
      )}
    </Card>
  );
}

type TeacherRow = AttendanceSummary & { teacher: string; name: string; employee_no: string };

function TeacherMonthly() {
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const report = useApi<{ teachers: TeacherRow[] }>(`attendance/teachers/monthly?month=${month}`);
  return (
    <Card title="Teachers by month" icon={<UserRoundCheck aria-hidden />}>
      <Field label="Month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="mb-4 max-w-xs" />
      {report.error && !report.data ? <ErrorState message={report.error} onRetry={report.reload} /> : !report.data ? <Loading variant="table" /> : (
        <DataTable
          rows={report.data.teachers}
          rowKey={(r) => r.teacher}
          columns={[
            { header: "Teacher", cell: (r) => <span className="font-medium">{r.name}</span> },
            { header: "Days marked", cell: (r) => r.marked_days },
            { header: "Absent", cell: (r) => r.absent },
            { header: "Late", cell: (r) => r.late },
            { header: "On leave", cell: (r) => r.leave },
            { header: "%", cell: (r) => <span className={cx(r.percentage != null && r.percentage < 75 && "font-semibold text-red-700 dark:text-red-300")}>{pct(r.percentage)}</span> },
          ]}
        />
      )}
    </Card>
  );
}

/** A teacher's own attendance, as the school office marked it. */
function MyAttendance() {
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const data = useApi<MyTeacherAttendance>(`attendance/teachers/me?month=${month}`);
  const d = data.data?.month === month ? data.data : null;
  const byDate = new Map((d?.days ?? []).map((x) => [x.date, x]));
  return (
    <div className="space-y-4">
      <Alert tone="info" title="Marked by the school office">Your attendance is marked by the school admin each morning. If something looks wrong, ask the office to correct it.</Alert>
      {data.error && !data.data ? <ErrorState message={data.error} onRetry={data.reload} /> : (
        <>
          {data.data && (
            <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Today" value={data.data.today ? ATTENDANCE_COLORS[data.data.today].label : "Not marked"} tone={data.data.today === "absent" ? "bad" : data.data.today === "late" || !data.data.today ? "warn" : "good"} />
              <Stat label="This month" value={pct(data.data.month_summary.percentage)} progress={data.data.month_summary.percentage} hint={`${data.data.month_summary.attended} of ${data.data.month_summary.marked_days} days`} />
              <Stat label="Late" value={data.data.month_summary.late} />
              <Stat label="On leave" value={data.data.month_summary.leave} />
            </div>
          )}
          <Card title="Calendar" icon={<ClipboardCheck aria-hidden />} actions={<MonthNav month={month} onChange={setMonth} max={todayIso().slice(0, 7)} />}>
            {!d ? <Loading variant="text" rows={6} /> : (
              <>
                <MonthGrid
                  month={month}
                  dayClass={(iso) => { const r = byDate.get(iso); return r ? ATTENDANCE_COLORS[r.status].cell : undefined; }}
                  dayNote={(iso) => { const r = byDate.get(iso); return r ? <span className="hidden sm:inline" title={r.remark || undefined}>{ATTENDANCE_COLORS[r.status].label}</span> : null; }}
                />
                <div className="mt-4"><Legend items={Object.values(ATTENDANCE_COLORS).map((c) => ({ label: c.label, className: c.dot }))} /></div>
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
