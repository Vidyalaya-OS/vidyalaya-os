import { Award, ClipboardCheck, TrendingUp } from "lucide-react-native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { api } from "@/lib/api";
import { num, pct, todayIso } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import type { AttendanceStatus, StudentAttendance, TermResult } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { DayLook, Legend, MonthGrid, MonthNav, shiftMonth } from "./Calendar";
import { BarList, Donut, TrendLine } from "./charts";
import { FeeStatement } from "./FeeStatement";
import { HomeworkList } from "./HomeworkList";
import { Async, Badge, Button, Card, DataTable, Empty, Enter, Grid, LinkText, Loading, Row, Span, Stack, Stagger, Stat, Tabs, Txt, go } from "./ui";

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
    <View style={{ marginTop: 20 }}>
      <Tabs<Tab> tabs={tabs} value={tab} onChange={setTab} />
      <Enter key={tab}>
        {tab === "attendance" && <AttendanceCalendar studentId={studentId} />}
        {tab === "results" && <Results studentId={studentId} />}
        {tab === "homework" && <HomeworkList query={`student=${studentId}&upcoming=true`} canMarkDone={hasRole("student") && !hasRole("parent")} />}
        {tab === "fees" && <FeeStatement studentId={studentId} isAdmin={hasRole("admin")} />}
      </Enter>
    </View>
  );
}

/** The colours for each attendance mark on a calendar day. */
export function useAttendanceColors(): Record<AttendanceStatus, DayLook & { dot: string; label: string }> {
  const { dark } = useTheme();
  return dark ? {
    present: { bg: "#052e1680", border: "#14532d99", fg: "#bbf7d0", dot: "#22c55e", label: "Present" },
    absent: { bg: "#450a0a80", border: "#7f1d1d99", fg: "#fecaca", dot: "#ef4444", label: "Absent" },
    late: { bg: "#451a0380", border: "#78350f99", fg: "#fde68a", dot: "#f59e0b", label: "Late" },
    leave: { bg: "#1e293b99", border: "#334155", fg: "#e2e8f0", dot: "#94a3b8", label: "On leave" },
  } : {
    present: { bg: "#f0fdf4", border: "#bbf7d0", fg: "#14532d", dot: "#22c55e", label: "Present" },
    absent: { bg: "#fef2f2", border: "#fecaca", fg: "#7f1d1d", dot: "#ef4444", label: "Absent" },
    late: { bg: "#fffbeb", border: "#fde68a", fg: "#78350f", dot: "#f59e0b", label: "Late" },
    leave: { bg: "#f1f5f9", border: "#e2e8f0", fg: "#1e293b", dot: "#94a3b8", label: "On leave" },
  };
}

function tone(p: number | null | undefined) {
  return p == null ? undefined : p < 75 ? "bad" : p < 90 ? "warn" : "good";
}

export function AttendanceCalendar({ studentId }: { studentId: string }) {
  const colors = useAttendanceColors();
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const [picked, setPicked] = useState<string | null>(null);
  const data = useApi<StudentAttendance>(`attendance/students/${studentId}?month=${month}`);
  const d = data.data?.month === month ? data.data : null;
  const byDate = new Map((d?.days ?? []).map((x) => [x.date, x]));
  const rec = picked ? byDate.get(picked) : undefined;

  return (
    <Stack gap={18}>
      {data.data && (
        <Grid cols={{ base: 2, lg: 4 }} gap={12}>
          <Stat label="This month" value={pct(data.data.month_summary.percentage)} tone={tone(data.data.month_summary.percentage)} progress={data.data.month_summary.percentage} hint={`${data.data.month_summary.attended} of ${data.data.month_summary.marked_days} days`} />
          <Stat label="Absent this month" value={data.data.month_summary.absent} tone={data.data.month_summary.absent ? "bad" : undefined} />
          <Stat label={`Year ${data.data.academic_year ?? ""}`} value={pct(data.data.year_summary.percentage)} tone={tone(data.data.year_summary.percentage)} progress={data.data.year_summary.percentage} hint={`${data.data.year_summary.attended} of ${data.data.year_summary.marked_days} days`} />
          <Stat label="Late this year" value={data.data.year_summary.late} />
        </Grid>
      )}
      <Grid cols={{ base: 1, lg: 3 }} gap={16}>
        <Span span={2}>
          <Card title="Calendar" icon={ClipboardCheck} actions={<MonthNav month={month} onChange={(m) => { setMonth(m); setPicked(null); }} max={todayIso().slice(0, 7)} />}>
            {data.error && !data.data ? <Async state={data}>{() => null}</Async> : !d ? <Loading variant="text" rows={6} /> : (
              <>
                <MonthGrid
                  month={month}
                  selected={picked}
                  onSelect={(iso) => setPicked(iso === picked ? null : iso)}
                  dayStyle={(iso) => { const r = byDate.get(iso); return r ? colors[r.status] : undefined; }}
                  dayNote={(iso) => { const r = byDate.get(iso); return r ? colors[r.status].label : null; }}
                />
                {picked && (
                  <Enter from={4}>
                    <Txt size="sm" style={{ marginTop: 12 }}>
                      <Txt size="sm" weight="semibold">{new Date(`${picked}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}: </Txt>
                      {rec ? `${colors[rec.status].label}${rec.remark ? ` · ${rec.remark}` : ""}` : "Not marked"}
                    </Txt>
                  </Enter>
                )}
                <View style={{ marginTop: 14 }}><Legend items={Object.values(colors).map((x) => ({ label: x.label, color: x.dot }))} /></View>
              </>
            )}
          </Card>
        </Span>
        <Stack gap={16}>
          {d && (
            <Card title="This month">
              <Donut size={110}
                segments={[
                  { label: "Present", value: d.month_summary.present, tone: "good" },
                  { label: "Late", value: d.month_summary.late, tone: "warn" },
                  { label: "Absent", value: d.month_summary.absent, tone: "bad" },
                  { label: "On leave", value: d.month_summary.leave, tone: "neutral" },
                ]}
                centre={<Txt weight="bold" tabular>{pct(d.month_summary.percentage)}</Txt>} />
            </Card>
          )}
          <AttendanceTrend studentId={studentId} />
        </Stack>
      </Grid>
    </Stack>
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
    <Card title="Last six months" icon={TrendingUp} description="The dashed line is 75%.">
      {!points ? <Loading variant="text" /> : points.every((p) => p.value == null) ? <Empty>No attendance marked yet.</Empty> : <TrendLine points={points} threshold={75} />}
    </Card>
  );
}

export function Results({ studentId }: { studentId: string }) {
  const data = useApi<{ terms: TermResult[] }>(`results/students/${studentId}`);
  return (
    <Async state={data} loading={<Loading variant="cards" rows={2} />}
      isEmpty={(r) => r.terms.every((t) => t.subjects.length === 0 && !t.report_card_published)}
      empty={<Empty icon={TrendingUp} title="No results yet">Results show here once the school publishes them.</Empty>}>
      {(r) => (
        <Stagger gap={16}>
          {r.terms.filter((t) => t.subjects.length > 0 || t.report_card_published).map((t) => (
            <Card key={t.exam_term} title={t.exam_term_name} icon={Award} description={`Total ${num(t.total)} / ${num(t.total_max)}`}
              actions={
                <Row gap={8}>
                  {t.percentage != null && <Txt size="lg" weight="bold" tabular>{pct(t.percentage)}</Txt>}
                  {t.grade && <Badge tone="good">{t.grade}</Badge>}
                  {t.report_card_published && <Button size="sm" variant="soft" onPress={() => go(`/app/report-cards/${studentId}/${t.exam_term}`)}>Report card</Button>}
                </Row>
              }>
              <Grid cols={{ base: 1, lg: 2 }} gap={20}>
                <BarList valueLabel="Score" compareLabel="Class average"
                  items={t.subjects.map((s) => ({
                    label: s.subject_name,
                    value: s.is_absent ? null : s.percentage,
                    compare: s.class_average != null && Number(s.max_marks) ? (s.class_average / Number(s.max_marks)) * 100 : null,
                    note: s.is_absent ? "Absent" : undefined,
                  }))} />
                <DataTable rows={t.subjects} rowKey={(s) => s.exam}
                  columns={[
                    { header: "Subject", flex: 2, cell: (s) => <Row gap={6} wrap><Txt size="sm" weight="medium">{s.subject_name}</Txt>{s.status === "draft" && <Badge tone="warn">Not published</Badge>}</Row> },
                    { header: "Marks", align: "right", cell: (s) => s.is_absent ? "Absent" : `${num(s.marks_obtained)} / ${num(s.max_marks)}` },
                    { header: "Grade", cell: (s) => <Txt size="sm" weight="semibold">{s.grade ?? "-"}</Txt> },
                    { header: "Class avg.", align: "right", cell: (s) => String(s.class_average ?? "-") },
                  ]} />
              </Grid>
              {t.report_card_published && (
                <View style={{ marginTop: 14 }}><LinkText href={`/app/report-cards/${studentId}/${t.exam_term}`}>Open the report card to print or save as PDF</LinkText></View>
              )}
            </Card>
          ))}
        </Stagger>
      )}
    </Async>
  );
}
