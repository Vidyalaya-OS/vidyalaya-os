import {
  ArrowRight, BookMarked, BookOpen, CalendarDays, CalendarRange, Check, CircleCheck, ClipboardCheck, Clock, FileSpreadsheet,
  GraduationCap, HeartHandshake, Layers, Lightbulb, Link2, Lock, Phone, Route, Rows3, TriangleAlert, Upload, UserCheck,
  UserPlus, UserRoundCheck, Users, Wallet,
} from "lucide-react-native";
import { Linking, Pressable, View } from "react-native";
import { useTeacherRegister } from "./AdminReminders";
import { Aurora } from "./brand";
import { BarList, Donut, SplitBars } from "./charts";
import { Schedule } from "./Schedule";
import {
  Async, Badge, Button, Card, Divider, Empty, Enter, Grid, LinkText, Loading, Ping, Press, Progress, Pulse, Row, Stack, Stagger, Stat, Txt, go, useLayout,
} from "./ui";
import type { Page } from "@/lib/api";
import { formatDateTime, money, pct } from "@/lib/format";
import type { Icon } from "@/lib/nav";
import { useTheme } from "@/lib/theme";
import type { AttendanceSummary, BalanceRow, Exam, FeeTotals, Homework, Quiz, SetupStatus, Teacher, TimetableEntry } from "@/lib/types";
import { rows, useApi } from "@/lib/useApi";

export type QuickAction = { href: string; label: string; icon: Icon; hint?: string };

export function QuickActions({ actions }: { actions: QuickAction[] }) {
  const { c, card } = useTheme();
  return (
    <Grid cols={{ base: 2, sm: 3, lg: 6 }} gap={12}>
      {actions.map((a, i) => (
        <Enter key={a.href + a.label} delay={i * 40}>
          <Press onPress={() => go(a.href)} scale={0.96} accessibilityRole="link"
            style={[{ minHeight: 100, justifyContent: "space-between", gap: 12, borderRadius: 18, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, padding: 14 }, card]}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.brandSoft, alignItems: "center", justifyContent: "center" }}>
              <a.icon size={20} color={c.brand} />
            </View>
            <View>
              <Txt size="sm" weight="semibold" style={{ lineHeight: 18 }}>{a.label}</Txt>
              {a.hint && <Txt size="xs" soft>{a.hint}</Txt>}
            </View>
          </Press>
        </Enter>
      ))}
    </Grid>
  );
}

type Summary = {
  academic_year: string; currency: string; collected_today: string; collected_this_month: string; collected_this_year: string;
  totals: FeeTotals; by_class: (FeeTotals & { school_class: string | null; class_name: string })[];
};
type Daily = { sections: (AttendanceSummary & { section: string; section_name: string; students: number; marked: boolean })[]; total: AttendanceSummary; unmarked_sections: number };
type Defaulter = BalanceRow & { parents: { name: string; email: string | null; phone: string | null }[] };

/** The school admin's first screen: today's attendance, fee collection,
 * who is overdue, and setup steps still to do. */
export function AdminHome() {
  const { c: col, tone } = useTheme();
  const setup = useApi<SetupStatus>("setup-status");
  const fees = useApi<Summary>("fees/summary");
  const daily = useApi<Daily>("attendance/reports/daily");
  const overdue = useApi<{ students: Defaulter[] }>("fees/defaulters");
  const count = (key: string) => setup.data?.steps.find((s) => s.key === key)?.count;
  const c = fees.data?.currency ?? "INR";
  const t = daily.data?.total;
  const overdueTotal = fees.data ? Number(fees.data.totals.overdue) : 0;
  const billed = fees.data ? Number(fees.data.totals.due) - Number(fees.data.totals.discount) : 0;
  const incomplete = setup.data && !setup.data.complete;

  return (
    <Stack gap={20}>
      <Grid cols={incomplete ? { base: 1, lg: 2 } : 1} gap={16}>
        {incomplete && <NextStepHero setup={setup.data!} />}
        <TeacherRegisterCard />
      </Grid>

      {incomplete && <SetupPath setup={setup.data!} />}

      <Grid cols={{ base: 2, lg: 4 }} gap={12}>
        <Stat label="Students" value={count("students") ?? "-"} icon={GraduationCap} href="/app/students" hint={count("teachers") != null ? `${count("teachers")} teacher${count("teachers") === 1 ? "" : "s"}` : undefined} />
        <Stat
          label="Attendance today"
          value={t ? pct(t.percentage) : "-"}
          icon={ClipboardCheck}
          tone={t?.percentage == null ? undefined : t.percentage < 75 ? "bad" : t.percentage < 90 ? "warn" : "good"}
          progress={t?.percentage ?? null}
          hint={daily.data ? (daily.data.unmarked_sections ? `${daily.data.unmarked_sections} section${daily.data.unmarked_sections === 1 ? "" : "s"} not marked yet` : "All sections marked") : undefined}
          href="/app/attendance"
        />
        <Stat label="Collected this month" value={fees.data ? money(fees.data.collected_this_month, c) : "-"} icon={Wallet} tone="good" hint={fees.data ? `${money(fees.data.collected_today, c)} today` : undefined} href="/app/fees" />
        <Stat label="Overdue fees" value={fees.data ? money(fees.data.totals.overdue, c) : "-"} icon={TriangleAlert} tone={overdueTotal > 0 ? "bad" : "good"} hint={overdue.data ? `${overdue.data.students.length} student${overdue.data.students.length === 1 ? "" : "s"}` : undefined} href="/app/fees" />
      </Grid>

      <QuickActions actions={[
        { href: "/app/students", label: "Add a student", icon: UserPlus },
        { href: "/app/attendance", label: "Teacher attendance", icon: UserRoundCheck, hint: "Mark every day" },
        { href: "/app/fees", label: "Record a payment", icon: Wallet },
        { href: "/app/timetable", label: "Timetable", icon: Clock },
        { href: "/app/exams", label: "Tests & marks", icon: FileSpreadsheet },
        { href: "/app/import", label: "Import from Excel", icon: Upload },
      ]} />

      <Grid cols={{ base: 1, lg: 2 }} gap={16}>
        <Card title="Students in class today" description="Marked by each section's teachers" icon={ClipboardCheck} actions={<LinkText href="/app/attendance">Reports</LinkText>}>
          <Async state={daily} loading={<Loading variant="text" />}>
            {(d) => (
              <Stack gap={18}>
                <Donut
                  segments={[
                    { label: "Present", value: d.total.present, tone: "good" },
                    { label: "Late", value: d.total.late, tone: "warn" },
                    { label: "Absent", value: d.total.absent, tone: "bad" },
                    { label: "On leave", value: d.total.leave, tone: "neutral" },
                  ]}
                  centre={<View style={{ alignItems: "center" }}><Txt size="xl" weight="bold" tabular>{pct(d.total.percentage)}</Txt><Txt size="xxs" soft>in class</Txt></View>}
                />
                {d.sections.filter((s) => !s.marked).length > 0 && (
                  <View>
                    <Txt size="xxs" weight="semibold" soft upper style={{ marginBottom: 8 }}>Not marked yet</Txt>
                    <Row wrap gap={6}>{d.sections.filter((s) => !s.marked).map((s) => <Badge key={s.section} tone="warn">{s.section_name}</Badge>)}</Row>
                  </View>
                )}
              </Stack>
            )}
          </Async>
        </Card>

        <Card title="Fee collection by class" icon={Wallet} description={fees.data ? `${money(fees.data.totals.paid, c)} of ${money(billed, c)} collected in ${fees.data.academic_year}` : undefined}>
          <Async state={fees} loading={<Loading variant="text" />} isEmpty={(f) => f.by_class.length === 0} empty={<Empty>No fees billed yet. Set up the fee structure, then bill students.</Empty>}>
            {(f) => <SplitBars labels={["Collected", "Still due"]} format={(n) => money(n, c)} items={f.by_class.map((r) => ({ label: r.class_name, a: Number(r.paid), b: Number(r.remaining) }))} />}
          </Async>
        </Card>
      </Grid>

      <Card title="Overdue fees" icon={TriangleAlert} description="Largest first, with parents' phone numbers to call." actions={<Button variant="secondary" size="sm" onPress={() => go("/app/fees")}>All fees</Button>}>
        <Async state={overdue} isEmpty={(o) => o.students.length === 0} empty={<Empty icon={CircleCheck} title="Nobody is overdue">Every due date so far has been paid.</Empty>}>
          {(o) => (
            <Stagger gap={0}>
              {o.students.slice(0, 6).map((s, i) => {
                const phone = s.parents.find((p) => p.phone)?.phone;
                return (
                  <View key={s.student}>
                    {i > 0 && <Divider />}
                    <Row justify="space-between" gap={12} style={{ paddingVertical: 12 }}>
                      <Pressable style={{ flex: 1 }} onPress={() => go(`/app/fees/students/${s.student}`)}>
                        <Txt weight="medium" numberOfLines={1}>{s.name}</Txt>
                        <Txt size="xs" soft numberOfLines={1}>{s.section_name}{s.parents[0] ? ` · ${s.parents[0].name}` : ""}</Txt>
                      </Pressable>
                      <Row gap={8}>
                        <Txt size="sm" weight="semibold" tabular color={tone.bad.fg}>{money(s.overdue, c)}</Txt>
                        {phone && (
                          <Press onPress={() => Linking.openURL(`tel:${phone}`)} accessibilityLabel={`Call ${s.parents[0]?.name ?? "parent"}`}
                            style={{ width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: col.line, alignItems: "center", justifyContent: "center" }}>
                            <Phone size={16} color={col.brand} />
                          </Press>
                        )}
                      </Row>
                    </Row>
                  </View>
                );
              })}
            </Stagger>
          )}
        </Async>
      </Card>

      {setup.data?.complete && (
        <Row gap={8} wrap>
          <CircleCheck size={16} color={tone.good.solid} />
          <Txt size="sm" soft>School setup is complete ({setup.data.done} of {setup.data.steps.length} steps).</Txt>
          <LinkText href="/app/setup">Classes &amp; subjects</LinkText>
        </Row>
      )}
    </Stack>
  );
}

const STEP_ICONS: Record<string, Icon> = {
  academic_year: CalendarRange, classes: Layers, sections: Rows3, subjects: BookMarked, class_subjects: Link2,
  teachers: Users, subject_teachers: UserCheck, class_teachers: UserRoundCheck, timetable: Clock,
  students: GraduationCap, parents: HeartHandshake, fees: Wallet,
};
const STEP_WHY: Record<string, string> = {
  academic_year: "Classes, fees and reports all belong to a year, so the year comes first.",
  classes: "Classes are the frame every student, subject and fee hangs on.",
  sections: "Students sit in sections, and attendance is taken section by section.",
  subjects: "Make one list of the school's subjects before giving them to sections.",
  class_subjects: "Each section needs its subjects before teachers can be allocated to them.",
  teachers: "Teachers need accounts before they can be allocated to subjects.",
  subject_teachers: "A subject's teacher marks that section's attendance and enters its marks.",
  class_teachers: "The class teacher takes the section's daily roll call.",
  timetable: "With subjects and teachers in place, the week can be planned.",
  students: "Sections are ready, so students can be enrolled into them.",
  parents: "Linked parents follow attendance, results and fees from home.",
  fees: "What each class pays, so you can bill students and take payments.",
};

/** The one next thing to do to finish setting up the school. */
function NextStepHero({ setup }: { setup: SetupStatus }) {
  const { lift } = useTheme();
  const { sm } = useLayout();
  const step = setup.steps.find((s) => s.key === setup.next) ?? setup.steps.find((s) => !s.done)!;
  const index = setup.steps.indexOf(step);
  const IconC = STEP_ICONS[step.key] ?? Layers;
  return (
    <View style={[{ borderRadius: 18 }, lift]}>
      <Aurora radius={18} style={{ padding: sm ? 22 : 18 }}>
        <View style={{ position: "absolute", right: -30, top: -30, width: 150, height: 150, borderRadius: 75, backgroundColor: "rgba(255,255,255,0.08)" }} />
        <Row gap={16} align="center">
          <View style={{ flex: 1 }}>
            <Txt size="xxs" weight="semibold" upper color="rgba(255,255,255,0.75)">Next step · {index + 1} of {setup.steps.length}</Txt>
            <Txt size="xl" weight="bold" color="#fff" style={{ marginTop: 4 }}>{step.label}</Txt>
            <Txt size="sm" color="rgba(255,255,255,0.85)" style={{ marginTop: 6 }}>{step.detail}</Txt>
            <Txt size="sm" color="rgba(255,255,255,0.7)" style={{ marginTop: 2 }}>{STEP_WHY[step.key]}</Txt>
            <Row gap={12} wrap style={{ marginTop: 14 }}>
              <Press onPress={() => go(step.href)} style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, backgroundColor: "#fff", paddingHorizontal: 16 }}>
                <IconC size={16} color="#0f172a" />
                <Txt size="sm" weight="semibold" color="#0f172a">Do this now</Txt>
                <ArrowRight size={16} color="#0f172a" />
              </Press>
              <Txt size="sm" color="rgba(255,255,255,0.8)">{setup.done} of {setup.steps.length} done</Txt>
            </Row>
            <Progress value={(setup.done / setup.steps.length) * 100} height={6} color="#fff" style={{ marginTop: 14, backgroundColor: "rgba(255,255,255,0.2)" }} />
          </View>
          {sm && (
            <Pulse>
              <View style={{ width: 84, height: 84, borderRadius: 26, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", transform: [{ rotate: "-8deg" }] }}>
                <IconC size={38} color="#fff" />
              </View>
            </Pulse>
          )}
        </Row>
      </Aurora>
    </View>
  );
}

/** Every setup step in order: done, next, ready, or waiting on an earlier step. */
function SetupPath({ setup }: { setup: SetupStatus }) {
  const { c, tone } = useTheme();
  const labels = Object.fromEntries(setup.steps.map((s) => [s.key, s.label]));
  const done = new Set(setup.steps.filter((s) => s.done).map((s) => s.key));
  return (
    <Card title="Your setup path" icon={Route} description="Follow it top to bottom: each step builds on the ones before it.">
      <Grid cols={{ base: 1, sm: 2, lg: 3 }} gap={10}>
        {setup.steps.map((s, i) => {
          const IconC = STEP_ICONS[s.key] ?? Layers;
          const isNext = s.key === setup.next;
          const waitingOn = s.requires.find((r) => !done.has(r));
          const dot = (
            <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: s.done ? tone.good.solid : isNext ? c.brand : s.ready ? c.brandSoft : c.muted }}>
              {s.done ? <Check size={16} color="#fff" /> : !s.ready ? <Lock size={14} color={c.soft} /> : <Txt size="sm" weight="bold" color={isNext ? c.onBrand : c.brand}>{i + 1}</Txt>}
            </View>
          );
          const body = (
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, borderRadius: 14, borderWidth: 1, padding: 12, borderColor: isNext ? c.brand + "80" : c.line, backgroundColor: isNext ? c.brandSoft + "66" : c.surface, opacity: !s.ready && !s.done ? 0.7 : 1, minHeight: 72 }}>
              {isNext ? <View>{dot}<View style={{ position: "absolute", top: -2, right: -2 }}><Ping color={c.brand} size={8} /></View></View> : dot}
              <View style={{ flex: 1 }}>
                <Row gap={6}><IconC size={15} color={c.soft} /><Txt size="sm" weight="semibold" style={{ flex: 1 }}>{s.label}</Txt></Row>
                <Txt size="xs" soft style={{ marginTop: 2 }}>{!s.done && !s.ready && waitingOn ? `After: ${labels[waitingOn]}` : s.detail}</Txt>
              </View>
              {isNext && <Badge tone="info">Next</Badge>}
            </View>
          );
          return s.ready || s.done ? <Press key={s.key} onPress={() => go(s.href)} scale={0.98}>{body}</Press> : <View key={s.key}>{body}</View>;
        })}
      </Grid>
    </Card>
  );
}

/** Today's teacher register on the admin's home. Stays loud until saved. */
function TeacherRegisterCard() {
  const { dark } = useTheme();
  const sheet = useTeacherRegister();
  const d = sheet.data;
  if (!d) return <Card title="Teacher attendance" icon={UserRoundCheck}><Loading variant="text" /></Card>;
  if (d.teachers.length === 0) {
    return (
      <Card title="Teacher attendance" icon={UserRoundCheck}>
        <Empty title="No teachers yet" action={<Button size="sm" onPress={() => go("/app/teachers")}>Add teachers</Button>}>Once teachers are added, you mark their attendance here every day.</Empty>
      </Card>
    );
  }
  if (!d.marked) {
    return (
      <View style={{ borderRadius: 18, borderWidth: 1, borderColor: dark ? "#92400e" : "#fcd34d", backgroundColor: dark ? "#451a0366" : "#fffbeb", padding: 18 }}>
        <Row gap={12} align="flex-start">
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: "#f59e0b", alignItems: "center", justifyContent: "center" }}>
            <UserRoundCheck size={20} color="#fff" />
            <View style={{ position: "absolute", top: -3, right: -3 }}><Ping color="#ef4444" size={11} /></View>
          </View>
          <View style={{ flex: 1 }}>
            <Txt size="xxs" weight="semibold" upper color={dark ? "#fcd34d" : "#92400e"}>Required today</Txt>
            <Txt size="lg" weight="semibold" color={dark ? "#fffbeb" : "#451a03"}>Mark teacher attendance</Txt>
            <Txt size="sm" color={dark ? "#fef3c7cc" : "#78350fd9"} style={{ marginTop: 4 }}>{d.unmarked.length} of {d.teachers.length} teachers not marked yet. It takes a minute: everyone starts present.</Txt>
          </View>
        </Row>
        <Row wrap gap={6} style={{ marginTop: 12 }}>
          {d.unmarked.slice(0, 6).map((n) => <Badge key={n} tone="warn">{n}</Badge>)}
          {d.unmarked.length > 6 && <Badge tone="neutral">+{d.unmarked.length - 6} more</Badge>}
        </Row>
        <Button icon={UserRoundCheck} style={{ marginTop: 14 }} onPress={() => go("/app/attendance")}>Mark teachers now</Button>
      </View>
    );
  }
  return (
    <Card title="Teachers marked today" icon={UserRoundCheck} description={`By ${d.marked_by}`} actions={<LinkText href="/app/attendance">Change</LinkText>}>
      <Donut
        size={100}
        segments={[
          { label: "Present", value: d.summary.present, tone: "good" },
          { label: "Late", value: d.summary.late, tone: "warn" },
          { label: "Absent", value: d.summary.absent, tone: "bad" },
          { label: "On leave", value: d.summary.leave, tone: "neutral" },
        ]}
        centre={<Txt weight="bold" tabular>{d.summary.present + d.summary.late}/{d.teachers.length}</Txt>}
      />
    </Card>
  );
}

/** The teacher's first screen: today's classes, what to mark, open quizzes,
 * homework due and marks still to enter. */
export function TeacherHome() {
  const { c } = useTheme();
  const me = useApi<Page<Teacher>>("teachers/?mine=true");
  const today = useApi<TimetableEntry[]>("timetable/?mine=true&day=today");
  const pending = useApi<{ date: string; sections: { section: string; section_name: string; marked: boolean }[] }>("attendance/pending");
  const quizzes = useApi<Page<Quiz>>("quizzes/?mine=true&state=open");
  const exams = useApi<Exam[]>("exams/?mine=true&status=draft");
  const homework = useApi<Page<Homework>>("homework/?upcoming=true");
  const teacher = rows(me.data)[0];
  const toMark = (pending.data?.sections ?? []).filter((s) => !s.marked);
  const marksDue = (exams.data ?? []).filter((e) => e.marks_entered < e.students);
  const openQuizzes = rows(quizzes.data);

  return (
    <Stack gap={20}>
      <Grid cols={{ base: 2, lg: 4 }} gap={12}>
        <Stat label="Classes today" value={today.data ? today.data.length : "-"} icon={CalendarDays} href="/app/timetable" />
        <Stat label="Attendance to mark" value={pending.data ? toMark.length : "-"} icon={ClipboardCheck} tone={toMark.length ? "warn" : pending.data ? "good" : undefined} hint={pending.data && !toMark.length ? "All done for today" : undefined} href="/app/attendance" />
        <Stat label="Open quizzes" value={quizzes.data ? openQuizzes.length : "-"} icon={Lightbulb} href="/app/quizzes" />
        <Stat label="Marks to enter" value={exams.data ? marksDue.length : "-"} icon={FileSpreadsheet} tone={marksDue.length ? "warn" : undefined} href="/app/exams" />
      </Grid>

      <QuickActions actions={[
        { href: "/app/attendance", label: "Mark attendance", icon: ClipboardCheck },
        { href: "/app/homework", label: "Post homework", icon: BookOpen },
        { href: "/app/quizzes", label: "Set a quiz", icon: Lightbulb },
        { href: "/app/exams", label: "Enter marks", icon: FileSpreadsheet },
        { href: "/app/students", label: "Your students", icon: Users },
        { href: "/app/calendar", label: "Calendar", icon: CalendarDays },
      ]} />

      <Grid cols={{ base: 1, lg: 2 }} gap={16}>
        <Card title="Today's classes" icon={Clock} actions={<LinkText href="/app/timetable">Week</LinkText>}>
          <Async state={today} isEmpty={(d) => d.length === 0} empty={<Empty icon={CalendarDays}>No classes on your timetable today.</Empty>}>
            {(d) => <Schedule slots={d.map((e) => ({ id: e.id, start: e.start_time, end: e.end_time, title: e.subject_name, detail: [e.section_name, e.period_name, e.room && `Room ${e.room}`].filter(Boolean).join(" · ") }))} />}
          </Async>
        </Card>

        <Stack gap={16}>
          <Card title="Attendance" icon={ClipboardCheck} description="Sections you mark today">
            <Async state={pending} loading={<Loading variant="text" />} isEmpty={(p) => p.sections.length === 0} empty={<Empty>You have no sections to mark.</Empty>}>
              {(p) => (
                <Stagger gap={8}>
                  {p.sections.map((s) => (
                    <Row key={s.section} justify="space-between" gap={12} style={{ borderRadius: 12, borderWidth: 1, borderColor: c.line, paddingHorizontal: 12, paddingVertical: 8, minHeight: 52 }}>
                      <Txt weight="medium">{s.section_name}</Txt>
                      {s.marked ? <Badge tone="good" dot>Marked</Badge> : <Button size="sm" onPress={() => go("/app/attendance")}>Mark now</Button>}
                    </Row>
                  ))}
                </Stagger>
              )}
            </Async>
          </Card>

          <Card title="Open quizzes" icon={Lightbulb} actions={<LinkText href="/app/quizzes">All</LinkText>}>
            <Async state={quizzes} loading={<Loading variant="text" />} isEmpty={(q) => rows(q).length === 0} empty={<Empty>No quiz is open. Set one on today&apos;s lesson.</Empty>}>
              {(q) => (
                <Stagger gap={10}>
                  {rows(q).map((z) => (
                    <Press key={z.id} onPress={() => go(`/app/quizzes/${z.id}`)} scale={0.98} style={{ borderRadius: 12, borderWidth: 1, borderColor: c.line, padding: 12 }}>
                      <Row justify="space-between" gap={8}>
                        <Txt weight="medium" numberOfLines={1} style={{ flex: 1 }}>{z.title}</Txt>
                        <Txt size="xs" soft>closes {formatDateTime(z.closes_at)}</Txt>
                      </Row>
                      <Txt size="xs" soft style={{ marginTop: 2 }}>{z.section_name} · {z.attempt_count ?? 0} of {z.student_count ?? 0} taken</Txt>
                      <Progress value={z.student_count ? ((z.attempt_count ?? 0) / z.student_count) * 100 : 0} style={{ marginTop: 8 }} />
                    </Press>
                  ))}
                </Stagger>
              )}
            </Async>
          </Card>
        </Stack>

        <Card title="Marks to enter" icon={FileSpreadsheet} actions={<LinkText href="/app/exams">All tests</LinkText>}>
          <Async state={exams} loading={<Loading variant="text" />} isEmpty={() => marksDue.length === 0} empty={<Empty icon={CircleCheck}>All marks are in.</Empty>}>
            {() => (
              <BarList valueLabel="Entered" format={(n) => `${Math.round(n)}%`}
                items={marksDue.slice(0, 6).map((e) => ({ label: `${e.section_name} · ${e.subject_name} (${e.exam_term_name})`, value: e.students ? (e.marks_entered / e.students) * 100 : 0, note: `${e.marks_entered} / ${e.students}` }))} />
            )}
          </Async>
        </Card>

        <Card title="Homework due soon" icon={BookOpen} actions={<LinkText href="/app/homework">All</LinkText>}>
          <Async state={homework} loading={<Loading variant="text" />} isEmpty={(h) => rows(h).length === 0} empty={<Empty>Nothing due. Post homework from the Homework screen.</Empty>}>
            {(h) => (
              <View>
                {rows(h).slice(0, 5).map((x, i) => (
                  <View key={x.id}>
                    {i > 0 && <Divider />}
                    <Row justify="space-between" gap={12} style={{ paddingVertical: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Txt weight="medium" numberOfLines={1}>{x.title}</Txt>
                        <Txt size="xs" soft>{x.section_name} · {x.subject_name}</Txt>
                      </View>
                      {x.done_count != null && <Badge tone="info">{`${x.done_count} done`}</Badge>}
                    </Row>
                  </View>
                ))}
              </View>
            )}
          </Async>
        </Card>
      </Grid>

      {teacher && (teacher.teaches.length > 0 || teacher.class_teacher_of.length > 0) && (
        <Card title="Your classes" icon={Users}>
          <Row wrap gap={6}>
            {teacher.class_teacher_of.map((x) => <Badge key={x.section} tone="good">{`${x.section_name} · Class teacher`}</Badge>)}
            {teacher.teaches.map((x) => <Badge key={`${x.section}-${x.subject}`}>{`${x.section_name} · ${x.subject_name}`}</Badge>)}
          </Row>
        </Card>
      )}
      {me.data && !teacher && <Empty>Your teacher profile is not set up yet. Ask your school admin.</Empty>}
    </Stack>
  );
}
