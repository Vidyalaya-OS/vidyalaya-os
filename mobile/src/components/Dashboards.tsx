import { Award, BookOpen, CalendarDays, CircleCheck, ClipboardCheck, Clock, Lightbulb, TrendingUp, Wallet } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { useChildren } from "@/lib/children";
import { formatDate, formatDateTime, money, num, pct } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import type { AttendanceStatus, ChildSummary, DashAttendance, DashHomework, DashQuizzes, DashTests, StudentDashboard as StudentData } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { BarList, Ring } from "./charts";
import { scoreText } from "./QuizList";
import { Schedule } from "./Schedule";
import { QuickActions } from "./StaffHome";
import { Async, Avatar, Badge, Button, Card, Divider, Empty, Enter, Facts, Grid, LinkText, Loading, Press, Progress, Row, Span, Stack, Stat, Txt, go } from "./ui";

export const ATTENDANCE: Record<AttendanceStatus, { label: string; tone: "good" | "warn" | "bad" | "neutral" }> = {
  present: { label: "Present", tone: "good" },
  late: { label: "Late", tone: "warn" },
  absent: { label: "Absent", tone: "bad" },
  leave: { label: "On leave", tone: "neutral" },
};

export function attendanceTone(p: number | null) {
  return p == null ? undefined : p < 75 ? "bad" : p < 90 ? "warn" : "good";
}

const DashLoading = () => <Stack gap={18}><Loading variant="stats" /><Loading variant="cards" /></Stack>;

/** The student's first screen: today's classes, quizzes to take, homework due and latest results. */
export function StudentDashboard() {
  const dash = useApi<StudentData>("dashboard/student");
  return (
    <Async state={dash} loading={<DashLoading />}>
      {(d) => (
        <Stack gap={20}>
          <Grid cols={{ base: 2, lg: 4 }} gap={12}>
            <Stat label="Quizzes to take" value={d.quizzes.pending.length} icon={Lightbulb} tone={d.quizzes.pending.length ? "warn" : undefined} href="/app/quizzes" />
            <Stat label="Homework pending" value={d.homework.pending + d.homework.overdue} icon={BookOpen} tone={d.homework.overdue ? "bad" : undefined} hint={d.homework.overdue ? `${d.homework.overdue} overdue` : "On track"} href="/app/homework" />
            <Stat label="Attendance this month" value={pct(d.attendance.month_summary.percentage)} icon={ClipboardCheck} tone={attendanceTone(d.attendance.month_summary.percentage)} progress={d.attendance.month_summary.percentage} href="/app/my/attendance" />
            <Stat label="Attendance this year" value={pct(d.attendance.year_summary.percentage)} icon={CalendarDays} tone={attendanceTone(d.attendance.year_summary.percentage)} progress={d.attendance.year_summary.percentage} href="/app/my/attendance" />
          </Grid>

          <Grid cols={{ base: 1, lg: 2 }} gap={16}>
            <Card title={`Today, ${d.day_name}`} icon={Clock}
              actions={d.attendance.today ? <Badge tone={ATTENDANCE[d.attendance.today].tone} dot>{ATTENDANCE[d.attendance.today].label}</Badge> : <LinkText href="/app/timetable">Week</LinkText>}>
              {d.timetable.length === 0 ? <Empty icon={CalendarDays}>No classes today.</Empty> : (
                <Schedule slots={d.timetable.map((t) => ({ id: t.id, start: t.start_time, end: t.end_time, title: t.subject_name, detail: [t.period_name, t.teacher_name, t.room && `Room ${t.room}`].filter(Boolean).join(" · ") }))} />
              )}
            </Card>
            <QuizzesCard quizzes={d.quizzes} canTake />
            <HomeworkCard homework={d.homework} href="/app/homework" />
            <TestsCard tests={d.tests} studentId={d.student.id} />
          </Grid>

          <QuickActions actions={[
            { href: "/app/calendar", label: "Calendar", icon: CalendarDays, hint: "Due dates and tests" },
            { href: "/app/timetable", label: "Timetable", icon: Clock },
            { href: "/app/my/attendance", label: "Attendance", icon: ClipboardCheck },
            { href: "/app/my/results", label: "Results", icon: TrendingUp },
            { href: "/app/my/fees", label: "Fees", icon: Wallet },
            { href: "/app/quizzes", label: "Quizzes", icon: Lightbulb },
          ]} />
        </Stack>
      )}
    </Async>
  );
}

function QuizzesCard({ quizzes, canTake, student }: { quizzes: DashQuizzes; canTake?: boolean; student?: string }) {
  const { dark } = useTheme();
  const suffix = student ? `?student=${student}` : "";
  return (
    <Card title="Quizzes" icon={Lightbulb} actions={<LinkText href="/app/quizzes">See all</LinkText>}>
      {quizzes.pending.length > 0 && (
        <Stack gap={8} style={{ marginBottom: 14 }}>
          {quizzes.pending.map((q) => (
            <Row key={q.id} justify="space-between" gap={12} style={{ borderRadius: 12, borderWidth: 1, borderColor: dark ? "#92400e" : "#fcd34d", backgroundColor: dark ? "#451a034d" : "#fffbeb99", padding: 12 }}>
              <View style={{ flex: 1 }}>
                <Txt weight="medium" numberOfLines={1}>{q.title}</Txt>
                <Txt size="xs" soft>{q.subject_name} · {q.question_count} questions · closes {formatDateTime(q.closes_at)}</Txt>
              </View>
              {canTake ? <Button size="sm" onPress={() => go(`/app/quizzes/${q.id}`)}>Take quiz</Button> : <Badge tone="warn">Not taken yet</Badge>}
            </Row>
          ))}
        </Stack>
      )}
      {quizzes.recent_scores.length > 0 ? (
        <>
          <Txt size="xxs" weight="semibold" soft upper style={{ marginBottom: 6 }}>Recent scores</Txt>
          {quizzes.recent_scores.map((q) => {
            const p = q.max_score ? (q.score / q.max_score) * 100 : 0;
            return (
              <Pressable key={q.id} onPress={() => go(`/app/quizzes/${q.id}${suffix}`)} style={({ pressed }) => ({ paddingVertical: 8, paddingHorizontal: 4, borderRadius: 10, opacity: pressed ? 0.6 : 1 })}>
                <Row justify="space-between" gap={12}>
                  <Txt size="sm" numberOfLines={1} style={{ flex: 1 }}>{q.title} <Txt size="sm" soft>· {q.subject_name}</Txt></Txt>
                  <Txt size="sm" weight="semibold" tabular>{scoreText(q.score, q.max_score)}</Txt>
                </Row>
                <Progress value={p} tone={p >= 75 ? "good" : p >= 40 ? "warn" : "bad"} height={6} style={{ marginTop: 6 }} />
              </Pressable>
            );
          })}
        </>
      ) : quizzes.pending.length === 0 ? <Empty icon={Lightbulb}>No quizzes yet.</Empty> : null}
      {quizzes.upcoming.length > 0 && (
        <Txt size="xs" soft style={{ marginTop: 10 }}>Coming up: {quizzes.upcoming.map((q) => `${q.title} (opens ${formatDateTime(q.opens_at)})`).join(", ")}</Txt>
      )}
    </Card>
  );
}

function HomeworkCard({ homework, href }: { homework: DashHomework; href: string }) {
  return (
    <Card title="Homework due" icon={BookOpen} actions={<LinkText href={href}>See all</LinkText>}>
      {homework.items.length === 0 ? <Empty icon={CircleCheck}>Nothing due this week.</Empty> : (
        <View>
          {homework.items.map((h, i) => (
            <View key={h.id}>
              {i > 0 && <Divider />}
              <Row justify="space-between" gap={12} style={{ paddingVertical: 10 }}>
                <View style={{ flex: 1 }}>
                  <Txt weight="medium" numberOfLines={1}>{h.title}</Txt>
                  <Txt size="xs" soft>{h.subject_name}</Txt>
                </View>
                <Badge tone={h.overdue ? "bad" : "neutral"}>{`${h.overdue ? "Overdue" : "Due"} ${formatDate(h.due_date)}`}</Badge>
              </Row>
            </View>
          ))}
        </View>
      )}
      {homework.pending > homework.items.filter((h) => !h.overdue).length && <Txt size="xs" soft style={{ marginTop: 6 }}>{homework.pending} not done in all.</Txt>}
    </Card>
  );
}

function TestsCard({ tests, studentId, resultsHref = "/app/my/results" }: { tests: DashTests; studentId: string; resultsHref?: string }) {
  const { c } = useTheme();
  return (
    <Card title="Latest test results" icon={TrendingUp} actions={<LinkText href={resultsHref}>See all</LinkText>}>
      {tests.latest.length === 0 ? <Empty icon={TrendingUp}>No results are published yet.</Empty> : (
        <BarList valueLabel="Score" compareLabel="Class average"
          items={tests.latest.map((t) => ({
            label: `${t.subject_name} · ${t.exam_term_name}`,
            value: t.is_absent ? null : t.percentage,
            compare: t.class_average != null && Number(t.max_marks) ? (t.class_average / Number(t.max_marks)) * 100 : null,
            note: t.is_absent ? "Absent" : `${num(t.marks_obtained)} / ${num(t.max_marks)}${t.grade ? ` · ${t.grade}` : ""}`,
          }))} />
      )}
      {tests.report_cards.length > 0 && (
        <Row wrap gap={8} style={{ marginTop: 14 }}>
          {tests.report_cards.map((rc) => (
            <Press key={rc.exam_term} onPress={() => go(`/app/report-cards/${studentId}/${rc.exam_term}`)} style={{ minHeight: 36, flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 12, borderWidth: 1, borderColor: c.line, paddingHorizontal: 12 }}>
              <Award size={15} color={c.brand} />
              <Txt size="sm" weight="medium" color={c.brand}>Report card: {rc.exam_term_name}</Txt>
            </Press>
          ))}
        </Row>
      )}
    </Card>
  );
}

/** Chips with each child's name, to choose whose details are shown. */
export function ChildSwitcher({ items, value, onChange }: { items: { id: string; name: string; detail?: string | null }[]; value: string; onChange: (id: string) => void }) {
  const { c, card } = useTheme();
  if (items.length < 2) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }} style={{ marginBottom: 18, flexGrow: 0 }} accessibilityRole="radiogroup">
      {items.map((ch) => {
        const active = ch.id === value;
        return (
          <Press key={ch.id} onPress={() => onChange(ch.id)} accessibilityRole="radio" accessibilityState={{ checked: active }}
            style={[{ flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 18, borderWidth: 1, paddingVertical: 8, paddingLeft: 8, paddingRight: 16, borderColor: active ? c.brand : c.line, backgroundColor: active ? c.brandSoft : c.surface }, active && card]}>
            <Avatar name={ch.name} size="sm" />
            <View>
              <Txt size="sm" weight="semibold" color={active ? c.brand : undefined}>{ch.name}</Txt>
              {ch.detail ? <Txt size="xs" soft>{ch.detail}</Txt> : null}
            </View>
          </Press>
        );
      })}
    </ScrollView>
  );
}

/** The parent's first screen: for the chosen child, attendance, homework, marks, quizzes and fees. */
export function ParentDashboard() {
  const dash = useApi<{ children: ChildSummary[] }>("dashboard/parent");
  const { chosen, choose } = useChildren();
  return (
    <Async state={dash} loading={<DashLoading />} isEmpty={(d) => d.children.length === 0} empty={<Empty title="No children linked yet">Ask the school office to link your child to your account.</Empty>}>
      {(d) => {
        const child = d.children.find((x) => x.student.id === chosen?.id) ?? d.children[0];
        return (
          <View>
            <ChildSwitcher items={d.children.map((x) => ({ id: x.student.id, name: x.student.name, detail: x.student.section_name }))} value={child.student.id} onChange={choose} />
            <ChildPanel key={child.student.id} child={child} />
          </View>
        );
      }}
    </Async>
  );
}

function AttendanceHero({ a, name }: { a: DashAttendance; name: string }) {
  const today = a.today ? ATTENDANCE[a.today] : null;
  return (
    <Row gap={16}>
      <Ring value={a.month_summary.percentage} label="this month" tone={attendanceTone(a.month_summary.percentage)} />
      <View style={{ flex: 1 }}>
        <Txt size="sm" weight="semibold">{today ? `${name.split(" ")[0]} is ${today.label.toLowerCase()} today` : "Today's attendance is not marked yet"}</Txt>
        <Txt size="sm" soft style={{ marginTop: 4 }}>{a.month_summary.absent} absent and {a.month_summary.late} late this month</Txt>
        <Txt size="sm" soft>This year: {pct(a.year_summary.percentage)}</Txt>
      </View>
    </Row>
  );
}

function ChildPanel({ child }: { child: ChildSummary }) {
  const { c, tone, card, dark } = useTheme();
  const s = child.student;
  const fees = child.fees;
  const billed = fees ? Number(fees.due) - Number(fees.discount) : 0;
  const paidPct = fees && billed > 0 ? (Number(fees.paid) / billed) * 100 : null;
  return (
    <Stack gap={20}>
      <Enter>
        <View style={[{ flexDirection: "row", alignItems: "center", gap: 16, borderRadius: 18, borderWidth: 1, borderColor: c.line, backgroundColor: c.brandSoft, padding: 16 }, card]}>
          <Avatar name={s.name} size="lg" />
          <View style={{ flex: 1 }}>
            <Txt size="xl" weight="bold" numberOfLines={1}>{s.name}</Txt>
            <Txt size="sm" soft>{s.section_name ?? "No class yet"}{s.roll_no != null ? ` · Roll ${s.roll_no}` : ""} · Adm. {s.admission_no}</Txt>
            {s.class_teacher ? <Txt size="sm" soft>Class teacher: {s.class_teacher}</Txt> : null}
          </View>
        </View>
      </Enter>

      <Grid cols={{ base: 2, lg: 4 }} gap={12}>
        <Stat label="Homework pending" value={child.homework.pending + child.homework.overdue} icon={BookOpen} tone={child.homework.overdue ? "bad" : undefined} hint={child.homework.overdue ? `${child.homework.overdue} overdue` : undefined} href="/app/homework" />
        <Stat label="Quizzes not taken" value={child.quizzes.pending.length} icon={Lightbulb} tone={child.quizzes.pending.length ? "warn" : undefined} href="/app/quizzes" />
        <Stat label="Fees paid" value={fees ? money(fees.paid, child.currency) : "-"} icon={Wallet} tone={fees ? "good" : undefined} progress={paidPct} hint={fees ? `of ${money(billed, child.currency)}` : undefined} href="/app/my/fees" />
        <Stat label="Fees remaining" value={fees ? money(fees.remaining, child.currency) : "-"} icon={Wallet}
          tone={fees && Number(fees.overdue) > 0 ? "bad" : fees && Number(fees.remaining) > 0 ? "warn" : fees ? "good" : undefined}
          hint={fees && Number(fees.overdue) > 0 ? `${money(fees.overdue, child.currency)} overdue` : fees?.next_due ? `Next: ${money(fees.next_due.remaining, child.currency)} by ${formatDate(fees.next_due.due_date)}` : undefined}
          href="/app/my/fees" />
      </Grid>

      <Grid cols={{ base: 1, lg: 2 }} gap={16}>
        <Card title="Attendance" icon={ClipboardCheck} actions={<LinkText href="/app/my/attendance">Calendar</LinkText>}>
          <AttendanceHero a={child.attendance} name={s.name} />
        </Card>
        <HomeworkCard homework={child.homework} href="/app/homework" />
        <TestsCard tests={child.tests} studentId={s.id} />
        <QuizzesCard quizzes={child.quizzes} student={s.id} />
        <Span span={2}>
          <Card title="Fees" icon={Wallet} actions={<LinkText href="/app/my/fees">Statement and receipts</LinkText>}>
            {!fees ? <Empty>Fees for this year are not set up yet.</Empty> : (
              <Stack gap={14}>
                <View>
                  <Row justify="space-between" style={{ marginBottom: 6 }}>
                    <Txt size="sm" soft>Paid for {fees.academic_year_name}</Txt>
                    <Txt size="sm" weight="semibold" tabular>{paidPct == null ? "-" : `${Math.round(paidPct)}%`}</Txt>
                  </Row>
                  <Progress value={paidPct ?? 0} tone={Number(fees.overdue) > 0 ? "bad" : "good"} height={12} />
                </View>
                <Facts items={[
                  { label: "Total", value: money(fees.due, child.currency) },
                  { label: "Paid", value: money(fees.paid, child.currency), color: tone.good.fg },
                  { label: "Remaining", value: money(fees.remaining, child.currency) },
                  { label: "Overdue", value: money(fees.overdue, child.currency), color: Number(fees.overdue) > 0 ? tone.bad.fg : undefined },
                ]} />
                {fees.next_due && (
                  <View style={{ borderRadius: 12, backgroundColor: dark ? "#451a0380" : "#fffbeb", paddingHorizontal: 12, paddingVertical: 8 }}>
                    <Txt size="sm" color={dark ? "#fef3c7" : "#78350f"}>Next due: <Txt size="sm" weight="bold" color={dark ? "#fef3c7" : "#78350f"}>{fees.next_due.name}</Txt>, {money(fees.next_due.remaining, child.currency)} by {formatDate(fees.next_due.due_date)}.</Txt>
                  </View>
                )}
              </Stack>
            )}
          </Card>
        </Span>
      </Grid>
    </Stack>
  );
}
