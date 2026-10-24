import * as Haptics from "expo-haptics";
import { CircleCheck, ClipboardCheck, IdCard, TriangleAlert, UserRoundCheck, UsersRound } from "lucide-react-native";
import { useEffect, useState } from "react";
import { DeviceEventEmitter, TextInput, View } from "react-native";
import { TEACHER_ATTENDANCE_SAVED } from "@/components/AdminReminders";
import { DateField, Legend, MonthGrid, MonthNav } from "@/components/Calendar";
import { Donut } from "@/components/charts";
import { useStaffSections } from "@/components/sections";
import { useAttendanceColors } from "@/components/StudentRecord";
import { useToast } from "@/components/toast";
import {
  Alert, Avatar, Badge, Button, Card, DataTable, Empty, Enter, ErrorState, Field, Grid, LinkText, Loading, PageHeader, Press, Progress, Row, Screen, Select, Stack, Stagger, Stat, StickyBar, Tabs, Txt,
} from "@/components/ui";
import { api } from "@/lib/api";
import { pct, todayIso } from "@/lib/format";
import { useSession } from "@/lib/session";
import { FONTS, useTheme } from "@/lib/theme";
import type { AttendanceSheet, AttendanceStatus, AttendanceSummary, MyTeacherAttendance, TeacherAttendanceSheet } from "@/lib/types";
import { useApi, useDebounced } from "@/lib/useApi";

const STATUS: { key: AttendanceStatus; label: string; short: string; color: string }[] = [
  { key: "present", label: "Present", short: "P", color: "#16a34a" },
  { key: "absent", label: "Absent", short: "A", color: "#dc2626" },
  { key: "late", label: "Late", short: "L", color: "#f59e0b" },
  { key: "leave", label: "On leave", short: "Lv", color: "#64748b" },
];

type Tab = "teachers" | "teacher-month" | "mark" | "mine" | "today" | "month" | "low";

/** In the admin portal this is the teachers' register (and read-only student
 * reports); in the teacher portal the students' register and the teacher's own attendance. */
export default function AttendancePage() {
  const { portal } = useSession();
  const isAdmin = portal === "admin";
  const [tab, setTab] = useState<Tab>(isAdmin ? "teachers" : "mark");
  const tabs: { key: Tab; label: string }[] = isAdmin
    ? [{ key: "teachers", label: "Teachers" }, { key: "teacher-month", label: "Teachers by month" }, { key: "today", label: "Students today" }, { key: "month", label: "Students by month" }, { key: "low", label: "Below 75%" }]
    : [{ key: "mark", label: "Mark students" }, { key: "mine", label: "My attendance" }, { key: "today", label: "Today" }, { key: "month", label: "Monthly" }, { key: "low", label: "Below 75%" }];
  return (
    <Screen>
      <PageHeader title="Attendance" subtitle={isAdmin
        ? "Mark your teachers every day. Students are marked by their own teachers; their reports are here for you to follow up."
        : "Everyone starts present. Tap the students who are absent or late, then save."} />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={tabs} />
      <Enter key={tab}>
        {tab === "teachers" && <TeacherSheet />}
        {tab === "teacher-month" && <TeacherMonthly />}
        {tab === "mark" && <MarkSheet />}
        {tab === "mine" && <MyAttendance />}
        {tab === "today" && <DailyReport studentsOnly={isAdmin} />}
        {tab === "month" && <MonthlyReport />}
        {tab === "low" && <LowAttendance />}
      </Enter>
    </Screen>
  );
}

function SectionPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const sections = useStaffSections();
  useEffect(() => {
    if (!value && sections[0]) onChange(sections[0].id);
  }, [value, sections, onChange]);
  return <Select label="Section" value={value} onChange={onChange} placeholder={sections.length === 0 ? "No sections" : "Choose…"} options={sections.map((s) => ({ value: s.id, label: s.name }))} />;
}

/** P / A / L / Lv buttons for one person. */
function StatusButtons({ value, onChange, name, disabled }: { value: AttendanceStatus; onChange: (s: AttendanceStatus) => void; name: string; disabled?: boolean }) {
  const { c } = useTheme();
  return (
    <Row gap={4}>
      {STATUS.map((st) => {
        const on = value === st.key;
        return (
          <Press key={st.key} disabled={disabled} scale={0.88} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${st.label}: ${name}`}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); onChange(st.key); }}
            style={{ height: 42, minWidth: 42, paddingHorizontal: 8, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: on ? 0 : 1, borderColor: c.line, backgroundColor: on ? st.color : c.surface, transform: [{ scale: on ? 1.05 : 1 }], shadowColor: st.color, shadowOpacity: on ? 0.3 : 0, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } }}>
            <Txt size="sm" weight="bold" color={on ? "#fff" : c.soft}>{st.short}</Txt>
          </Press>
        );
      })}
    </Row>
  );
}

function Counts({ counts }: { counts: { key: string; label: string; color: string; n: number }[] }) {
  return (
    <Row wrap gap={14}>
      {counts.map((x) => (
        <Row key={x.key} gap={6}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: x.color }} />
          <Txt size="sm"><Txt size="sm" weight="semibold" tabular>{x.n}</Txt> <Txt size="sm" soft>{x.label.toLowerCase()}</Txt></Txt>
        </Row>
      ))}
    </Row>
  );
}

function useRowTint() {
  const { dark } = useTheme();
  return (s: AttendanceStatus) => s === "absent" ? (dark ? "#450a0a4d" : "#fef2f2b3") : s === "late" ? (dark ? "#451a034d" : "#fffbebb3") : s === "leave" ? (dark ? "#1e293b66" : "#f1f5f9b3") : "transparent";
}

function MarkSheet() {
  const { c, dark } = useTheme();
  const tint = useRowTint();
  const [section, setSection] = useState("");
  const [date, setDate] = useState(todayIso());
  const sheet = useApi<AttendanceSheet>(section ? `attendance/sheet?section=${section}&date=${date}` : null);
  const [draft, setDraft] = useState<Record<string, AttendanceStatus>>({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
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
    <Card title="Mark attendance" icon={ClipboardCheck}>
      <Grid cols={{ base: 1, md: 3 }} gap={12} style={{ marginBottom: 14 }}>
        <SectionPicker value={section} onChange={setSection} />
        <DateField label="Date" value={date} max={todayIso()} onChange={setDate} />
        <View style={{ justifyContent: "flex-end", minHeight: 20 }}>
          {sheet.data?.marked ? <Badge tone="good" dot>{`Marked by ${sheet.data.marked_by}`}</Badge> : sheet.data ? <Badge tone="warn" dot>Not marked yet</Badge> : null}
        </View>
      </Grid>
      {sheet.error && !sheet.data && <ErrorState message={sheet.error} onRetry={sheet.reload} />}
      {sheet.data && !canMark && sheet.data.cannot_mark_reason && <Alert tone="warn" title="You can look, but not mark this one" style={{ marginBottom: 14 }}>{sheet.data.cannot_mark_reason}</Alert>}
      {!section ? <Empty icon={UsersRound}>You have no sections to mark.</Empty> : sheet.loading && !sheet.data ? <Loading rows={6} /> : sheet.data && students.length === 0 ? <Empty icon={UsersRound}>No students in this section.</Empty> : !sheet.data ? null : (
        <>
          <View style={{ marginBottom: 14, borderRadius: 12, backgroundColor: c.muted + "80", padding: 12, gap: 8 }}>
            <Counts counts={counts} />
            <Progress value={students.length ? (inClass / students.length) * 100 : 0} tone={inClass / Math.max(1, students.length) < 0.75 ? "bad" : "good"} />
          </View>
          <View style={{ borderRadius: 14, borderWidth: 1, borderColor: c.line, overflow: "hidden" }}>
            <Stagger gap={0}>
              {students.map((s, i) => {
                const current = draft[s.enrollment] ?? s.status;
                return (
                  <View key={s.enrollment} style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: tint(current), borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
                    <Row gap={10} style={{ flex: 1, minWidth: 150 }}>
                      <Avatar name={s.name} size="sm" />
                      <View style={{ flex: 1 }}>
                        <Txt size="sm" weight="medium" numberOfLines={1}>{s.roll_no ? `${s.roll_no}. ` : ""}{s.name}</Txt>
                        <Txt size="xs" soft>Adm. {s.admission_no}</Txt>
                      </View>
                    </Row>
                    <StatusButtons value={current} name={s.name} disabled={!canMark} onChange={(st) => setDraft((d) => ({ ...d, [s.enrollment]: st }))} />
                  </View>
                );
              })}
            </Stagger>
          </View>
          {canMark && (
            <StickyBar>
              <Button icon={CircleCheck} onPress={save} busy={busy}>{sheet.data?.marked ? "Save changes" : "Save attendance"}</Button>
              <Button variant="ghost" onPress={() => setDraft(Object.fromEntries(students.map((s) => [s.enrollment, "present"])))}>Everyone present</Button>
              {changed && <Txt size="xs" weight="medium" color={dark ? "#fcd34d" : "#b45309"} style={{ marginLeft: "auto" }}>Unsaved changes</Txt>}
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
    <Stack gap={16}>
      {studentsOnly && <Alert tone="info" title="Students are marked by their teachers">Each section&apos;s class teacher or subject teachers take the roll call. Sections still to mark show as Not marked; remind their teacher.</Alert>}
      <DateField label="Date" value={date} max={todayIso()} onChange={setDate} style={{ maxWidth: 320 }} />
      {report.error && !report.data ? <ErrorState message={report.error} onRetry={report.reload} /> : !report.data ? <Loading variant="stats" /> : (
        <>
          <Grid cols={{ base: 2, lg: 4 }} gap={12}>
            <Stat label="Attendance" value={pct(report.data.total.percentage)} progress={report.data.total.percentage} />
            <Stat label="Absent" value={report.data.total.absent} tone={report.data.total.absent ? "bad" : undefined} />
            <Stat label="Late" value={report.data.total.late} />
            <Stat label="Sections not marked" value={report.data.unmarked_sections} tone={report.data.unmarked_sections ? "warn" : "good"} />
          </Grid>
          <Card title="By section" icon={ClipboardCheck}>
            <View style={{ marginBottom: 18 }}>
              <Donut segments={[
                { label: "Present", value: report.data.total.present, tone: "good" },
                { label: "Late", value: report.data.total.late, tone: "warn" },
                { label: "Absent", value: report.data.total.absent, tone: "bad" },
                { label: "On leave", value: report.data.total.leave, tone: "neutral" },
              ]} centre={<Txt weight="bold" tabular>{pct(report.data.total.percentage)}</Txt>} />
            </View>
            <DataTable rows={report.data.sections} rowKey={(r) => r.section}
              columns={[
                { header: "Section", cell: (r) => <Txt size="sm" weight="medium">{r.section_name}</Txt> },
                { header: "Students", align: "right", cell: (r) => String(r.students) },
                { header: "Present", align: "right", cell: (r) => (r.marked ? String(r.present + r.late) : "-") },
                { header: "Absent", align: "right", cell: (r) => (r.marked ? String(r.absent) : "-") },
                { header: "%", align: "right", cell: (r) => pct(r.percentage) },
                { header: "Status", cell: (r) => <Badge tone={r.marked ? "good" : "warn"}>{r.marked ? "Marked" : "Not marked"}</Badge> },
              ]} />
          </Card>
        </>
      )}
    </Stack>
  );
}

type StudentRow = AttendanceSummary & { student: string; name: string; roll_no: number | null; section_name?: string };

function MonthlyReport() {
  const [section, setSection] = useState("");
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const report = useApi<{ students: StudentRow[] }>(section ? `attendance/reports/monthly?section=${section}&month=${month}` : null);
  return (
    <Card>
      <Grid cols={{ base: 1, md: 2 }} gap={12} style={{ marginBottom: 14 }}>
        <SectionPicker value={section} onChange={setSection} />
        <View><Txt size="sm" weight="medium" style={{ marginBottom: 6 }}>Month</Txt><MonthNav month={month} onChange={setMonth} max={todayIso().slice(0, 7)} /></View>
      </Grid>
      {report.error && !report.data ? <ErrorState message={report.error} onRetry={report.reload} /> : !report.data ? <Loading variant="table" /> : <StudentTable rows={report.data.students} />}
    </Card>
  );
}

function LowAttendance() {
  const [threshold, setThreshold] = useState("75");
  const settled = useDebounced(threshold, 400);
  const report = useApi<{ students: StudentRow[] }>(`attendance/reports/low?threshold=${encodeURIComponent(settled || "75")}`);
  return (
    <Card title="Low attendance this year" icon={TriangleAlert}>
      <Field label="Below (%)" keyboardType="number-pad" maxLength={3} value={threshold} onChangeText={setThreshold} style={{ marginBottom: 14, maxWidth: 160 }} />
      {report.error && !report.data ? <ErrorState message={report.error} onRetry={report.reload} /> : !report.data ? <Loading variant="table" /> : report.data.students.length === 0 ? <Empty icon={CircleCheck} title="Everyone is above the line">{`No students are under ${threshold}% this year.`}</Empty> : <StudentTable rows={report.data.students} showSection />}
    </Card>
  );
}

function StudentTable({ rows, showSection }: { rows: StudentRow[]; showSection?: boolean }) {
  const { tone } = useTheme();
  return (
    <DataTable rows={rows} rowKey={(r) => r.student} empty="No students."
      columns={[
        { header: "Student", flex: 2, cell: (r) => <LinkText href={`/app/students/${r.student}`}>{`${r.roll_no ? `${r.roll_no}. ` : ""}${r.name}`}</LinkText> },
        ...(showSection ? [{ header: "Section", cell: (r: StudentRow) => r.section_name ?? "" }] : []),
        { header: "Days", align: "right", cell: (r) => String(r.marked_days) },
        { header: "Absent", align: "right", cell: (r) => String(r.absent) },
        { header: "Late", align: "right", cell: (r) => String(r.late) },
        { header: "%", align: "right", cell: (r) => <Txt size="sm" tabular weight={r.percentage != null && r.percentage < 75 ? "semibold" : "regular"} color={r.percentage != null && r.percentage < 75 ? tone.bad.fg : undefined}>{pct(r.percentage)}</Txt> },
      ]} />
  );
}

/** The admin's daily register of teachers. Required every day. */
function TeacherSheet() {
  const { c, dark } = useTheme();
  const tint = useRowTint();
  const [date, setDate] = useState(todayIso());
  const sheet = useApi<TeacherAttendanceSheet>(`attendance/teachers/sheet?date=${date}`);
  const [draft, setDraft] = useState<Record<string, { status: AttendanceStatus; remark: string }>>({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    setDraft(Object.fromEntries((sheet.data?.teachers ?? []).map((t) => [t.teacher, { status: t.status, remark: t.remark }])));
  }, [sheet.data]);

  const teachers = sheet.data?.teachers ?? [];
  const pick = (id: string) => draft[id] ?? { status: "present" as AttendanceStatus, remark: "" };
  const counts = STATUS.map((s) => ({ ...s, n: teachers.filter((t) => pick(t.teacher).status === s.key).length }));
  const changed = teachers.some((t) => !t.marked || pick(t.teacher).status !== t.status || pick(t.teacher).remark !== t.remark);

  const save = async () => {
    setBusy(true);
    try {
      const records = teachers.map((t) => ({ teacher: t.teacher, ...pick(t.teacher) })).filter((r) => r.status !== "present" || r.remark);
      const data = await api<TeacherAttendanceSheet>("attendance/teachers/sheet", { method: "POST", body: { date, records } });
      sheet.setData(data);
      DeviceEventEmitter.emit(TEACHER_ATTENDANCE_SAVED);
      toast.success(`Teacher attendance saved. ${data.summary.present + data.summary.late} of ${data.teachers.length} teachers in school.`);
    } catch (e) {
      toast.error(e, "Could not save teacher attendance. Your changes are still here; try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Teacher attendance" icon={UserRoundCheck} description="Required every working day. Teachers marked absent or on leave cannot take their classes' roll call that day.">
      <Grid cols={{ base: 1, md: 2 }} gap={12} style={{ marginBottom: 14 }}>
        <DateField label="Date" value={date} max={todayIso()} onChange={setDate} />
        <View style={{ justifyContent: "flex-end" }}>
          {sheet.data && (sheet.data.marked ? <Badge tone="good" dot>{`Marked by ${sheet.data.marked_by}`}</Badge> : <Badge tone="bad" dot>{`${sheet.data.unmarked.length} of ${teachers.length} not marked yet`}</Badge>)}
        </View>
      </Grid>
      {sheet.error && !sheet.data ? <ErrorState message={sheet.error} onRetry={sheet.reload} /> : !sheet.data ? <Loading rows={5} /> : teachers.length === 0 ? (
        <Empty icon={IdCard} title="No teachers yet">Add teachers in School office, Teachers. They will appear here to mark each day.</Empty>
      ) : (
        <>
          {!sheet.data.marked && date === todayIso() && <Alert tone="warn" title="Today's teacher attendance is still to do" style={{ marginBottom: 14 }}>Everyone starts present. Tap anyone absent, late or on leave, add a note if you like, then save.</Alert>}
          <View style={{ marginBottom: 14, borderRadius: 12, backgroundColor: c.muted + "80", padding: 12 }}><Counts counts={counts} /></View>
          <View style={{ borderRadius: 14, borderWidth: 1, borderColor: c.line, overflow: "hidden" }}>
            <Stagger gap={0}>
              {teachers.map((t, i) => {
                const current = pick(t.teacher);
                return (
                  <View key={t.teacher} style={{ paddingHorizontal: 12, paddingVertical: 10, backgroundColor: tint(current.status), borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <Row gap={10} style={{ flex: 1, minWidth: 150 }}>
                        <Avatar name={t.name} size="sm" />
                        <View style={{ flex: 1 }}>
                          <Txt size="sm" weight="medium" numberOfLines={1}>{t.name}</Txt>
                          <Txt size="xs" soft>{t.employee_no ? `Emp. ${t.employee_no}` : "Teacher"}{t.marked ? "" : " · not marked"}</Txt>
                        </View>
                      </Row>
                      <StatusButtons value={current.status} name={t.name} onChange={(st) => setDraft((d) => ({ ...d, [t.teacher]: { ...current, status: st } }))} />
                    </View>
                    {current.status !== "present" && (
                      <Enter from={4}>
                        <TextInput value={current.remark} onChangeText={(v) => setDraft((d) => ({ ...d, [t.teacher]: { ...current, remark: v } }))}
                          placeholder="Note, such as sick leave or training (optional)" placeholderTextColor={c.soft + "99"} maxLength={200} accessibilityLabel={`Note for ${t.name}`}
                          style={{ marginTop: 8, minHeight: 40, borderRadius: 12, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, paddingHorizontal: 12, fontFamily: FONTS.regular, fontSize: 15, color: c.ink }} />
                      </Enter>
                    )}
                  </View>
                );
              })}
            </Stagger>
          </View>
          <StickyBar>
            <Button icon={CircleCheck} onPress={save} busy={busy}>{sheet.data.marked ? "Save changes" : "Save teacher attendance"}</Button>
            <Button variant="ghost" onPress={() => setDraft(Object.fromEntries(teachers.map((t) => [t.teacher, { status: "present", remark: "" }])))}>Everyone present</Button>
            {changed && <Txt size="xs" weight="medium" color={dark ? "#fcd34d" : "#b45309"} style={{ marginLeft: "auto" }}>{sheet.data.marked ? "Unsaved changes" : "Not saved yet"}</Txt>}
          </StickyBar>
        </>
      )}
    </Card>
  );
}

type TeacherRow = AttendanceSummary & { teacher: string; name: string; employee_no: string };

function TeacherMonthly() {
  const { tone } = useTheme();
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const report = useApi<{ teachers: TeacherRow[] }>(`attendance/teachers/monthly?month=${month}`);
  return (
    <Card title="Teachers by month" icon={UserRoundCheck} actions={<MonthNav month={month} onChange={setMonth} max={todayIso().slice(0, 7)} />}>
      {report.error && !report.data ? <ErrorState message={report.error} onRetry={report.reload} /> : !report.data ? <Loading variant="table" /> : (
        <DataTable rows={report.data.teachers} rowKey={(r) => r.teacher} empty="No teachers."
          columns={[
            { header: "Teacher", flex: 2, cell: (r) => <Txt size="sm" weight="medium">{r.name}</Txt> },
            { header: "Days marked", align: "right", cell: (r) => String(r.marked_days) },
            { header: "Absent", align: "right", cell: (r) => String(r.absent) },
            { header: "Late", align: "right", cell: (r) => String(r.late) },
            { header: "On leave", align: "right", cell: (r) => String(r.leave) },
            { header: "%", align: "right", cell: (r) => <Txt size="sm" tabular color={r.percentage != null && r.percentage < 75 ? tone.bad.fg : undefined}>{pct(r.percentage)}</Txt> },
          ]} />
      )}
    </Card>
  );
}

/** A teacher's own attendance, as the school office marked it. */
function MyAttendance() {
  const colors = useAttendanceColors();
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const data = useApi<MyTeacherAttendance>(`attendance/teachers/me?month=${month}`);
  const d = data.data?.month === month ? data.data : null;
  const byDate = new Map((d?.days ?? []).map((x) => [x.date, x]));
  return (
    <Stack gap={16}>
      <Alert tone="info" title="Marked by the school office">Your attendance is marked by the school admin each morning. If something looks wrong, ask the office to correct it.</Alert>
      {data.error && !data.data ? <ErrorState message={data.error} onRetry={data.reload} /> : (
        <>
          {data.data && (
            <Grid cols={{ base: 2, lg: 4 }} gap={12}>
              <Stat label="Today" value={data.data.today ? colors[data.data.today].label : "Not marked"} tone={data.data.today === "absent" ? "bad" : data.data.today === "late" || !data.data.today ? "warn" : "good"} />
              <Stat label="This month" value={pct(data.data.month_summary.percentage)} progress={data.data.month_summary.percentage} hint={`${data.data.month_summary.attended} of ${data.data.month_summary.marked_days} days`} />
              <Stat label="Late" value={data.data.month_summary.late} />
              <Stat label="On leave" value={data.data.month_summary.leave} />
            </Grid>
          )}
          <Card title="Calendar" icon={ClipboardCheck} actions={<MonthNav month={month} onChange={setMonth} max={todayIso().slice(0, 7)} />}>
            {!d ? <Loading variant="text" rows={6} /> : (
              <>
                <MonthGrid month={month}
                  dayStyle={(iso) => { const r = byDate.get(iso); return r ? colors[r.status] : undefined; }}
                  dayNote={(iso) => { const r = byDate.get(iso); return r ? colors[r.status].label : null; }} />
                <View style={{ marginTop: 14 }}><Legend items={Object.values(colors).map((x) => ({ label: x.label, color: x.dot }))} /></View>
              </>
            )}
          </Card>
        </>
      )}
    </Stack>
  );
}
