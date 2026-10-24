import { CalendarDays, Clock } from "lucide-react-native";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { CalendarEvent, EventKind, MonthGrid, MonthNav, monthRange, useEventStyle } from "@/components/Calendar";
import { ChildSwitcher } from "@/components/Dashboards";
import { Schedule } from "@/components/Schedule";
import { Card, Empty, ErrorState, Grid, LinkText, PageHeader, Press, Row, Screen, Span, Stack, Stagger, Txt, go } from "@/components/ui";
import type { Page } from "@/lib/api";
import { useChildren } from "@/lib/children";
import { formatDate, money, todayIso } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import type { Exam, FeeStatement, FeeStructure, Homework, Quiz, TimetableEntry } from "@/lib/types";
import { rows, useApi } from "@/lib/useApi";

/** One month of due dates: homework, tests, quizzes closing and fees, with the
 * chosen day's classes and items beside it. */
export default function CalendarPage() {
  const { hasRole } = useSession();
  const { c } = useTheme();
  const styles = useEventStyle();
  const isAdmin = hasRole("admin");
  const isTeacher = hasRole("teacher");
  const isFamily = hasRole("student", "parent") && !isAdmin && !isTeacher;
  const { list, chosen, choose } = useChildren();
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const [day, setDay] = useState<string>(todayIso());
  const [hidden, setHidden] = useState<Set<EventKind>>(new Set());
  const { first, last } = monthRange(month);

  const studentQ = isFamily && hasRole("parent") && chosen ? `&student=${chosen.id}` : "";
  const sectionId = isFamily ? chosen?.current_enrollment?.section : undefined;
  const waiting = isFamily && !chosen;

  const homework = useApi<Page<Homework>>(waiting ? null : `homework/?due_from=${first}&due_to=${last}${studentQ}`);
  const exams = useApi<Exam[]>(waiting ? null : `exams/${sectionId ? `?section=${sectionId}` : isTeacher && !isAdmin ? "?mine=true" : ""}`);
  const quizzes = useApi<Page<Quiz>>(waiting ? null : `quizzes/?${isTeacher && !isAdmin ? "mine=true" : studentQ.slice(1)}`);
  const fees = useApi<FeeStatement>(isFamily && chosen ? `fees/students/${chosen.id}` : null);
  const structures = useApi<FeeStructure[]>(isAdmin ? "fee-structures/" : null);
  const timetable = useApi<TimetableEntry[]>(sectionId ? `timetable/?section=${sectionId}` : isTeacher ? "timetable/?mine=true" : null);

  const events = useMemo<CalendarEvent[]>(() => {
    const out: CalendarEvent[] = [];
    for (const h of rows(homework.data)) out.push({ id: `h${h.id}`, date: h.due_date, title: h.title, kind: "homework", detail: `${h.subject_name} · ${h.section_name}`, href: "/app/homework" });
    for (const e of exams.data ?? []) {
      if (e.date) out.push({ id: `e${e.id}`, date: e.date, title: `${e.subject_name} test`, kind: "test", detail: `${e.exam_term_name} · ${e.section_name}`, href: isAdmin || isTeacher ? `/app/exams/${e.id}` : "/app/my/results" });
    }
    for (const q of rows(quizzes.data)) {
      out.push({ id: `q${q.id}`, date: q.closes_at.slice(0, 10), title: q.title, kind: "quiz", detail: `${q.subject_name} · closes ${new Date(q.closes_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`, href: `/app/quizzes/${q.id}${studentQ ? `?student=${chosen?.id}` : ""}` });
    }
    if (fees.data) {
      for (const d of fees.data.dues) if (Number(d.remaining) > 0) out.push({ id: `f${d.id}`, date: d.due_date, title: d.name, kind: d.is_overdue ? "overdue" : "fee", detail: `${money(d.remaining, fees.data.currency)} to pay`, href: "/app/my/fees" });
    }
    if (structures.data) {
      const byDate = new Map<string, string[]>();
      for (const s of structures.data) for (const i of s.installments) byDate.set(i.due_date, [...(byDate.get(i.due_date) ?? []), `${s.fee_head_name} ${i.name} (${s.class_name})`]);
      for (const [date, names] of byDate) out.push({ id: `s${date}`, date, title: `${names.length} fee installment${names.length === 1 ? "" : "s"}`, kind: "fee", detail: names.join(", "), href: "/app/fees" });
    }
    return out.filter((e) => e.date >= first && e.date <= last);
  }, [homework.data, exams.data, quizzes.data, fees.data, structures.data, first, last, isAdmin, isTeacher, studentQ, chosen]);

  const shown = events.filter((e) => !hidden.has(e.kind));
  const kinds = (Object.keys(styles) as EventKind[]).filter((k) => events.some((e) => e.kind === k));
  const dayEvents = shown.filter((e) => e.date === day);
  const weekday = new Date(`${day}T00:00:00`).getDay() || 7;
  const classes = (timetable.data ?? []).filter((t) => t.day_of_week === weekday).sort((a, b) => a.start_time.localeCompare(b.start_time));
  const failed = [homework, exams, quizzes].find((s) => s.error && !s.data);

  return (
    <Screen>
      <PageHeader title="Calendar" subtitle="Homework, tests, quizzes and fee due dates in one place. Pick a day to see its classes." />
      {isFamily && <ChildSwitcher items={list.map((x) => ({ id: x.id, name: x.name, detail: x.current_enrollment?.section_name }))} value={chosen?.id ?? ""} onChange={choose} />}
      {failed && <View style={{ marginBottom: 16 }}><ErrorState compact message={failed.error} onRetry={() => { homework.reload(); exams.reload(); quizzes.reload(); }} /></View>}
      <Grid cols={{ base: 1, lg: 3 }} gap={16}>
        <Span span={2}>
          <Card title={<MonthNav month={month} onChange={(m) => { setMonth(m); setDay(m === todayIso().slice(0, 7) ? todayIso() : `${m}-01`); }} />}>
            {kinds.length > 0 && (
              <Row wrap gap={6} style={{ marginBottom: 12 }}>
                {kinds.map((k) => {
                  const off = hidden.has(k);
                  return (
                    <Press key={k} onPress={() => setHidden((h) => { const n = new Set(h); if (off) n.delete(k); else n.add(k); return n; })} accessibilityRole="switch" accessibilityState={{ checked: !off }}
                      style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 32, borderRadius: 999, borderWidth: 1, borderColor: c.line, paddingHorizontal: 10, opacity: off ? 0.5 : 1, backgroundColor: c.surface }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: styles[k].dot }} />
                      <Txt size="xs" weight="medium" style={off ? { textDecorationLine: "line-through" } : undefined}>{styles[k].label}</Txt>
                    </Press>
                  );
                })}
              </Row>
            )}
            <MonthGrid month={month} events={shown} selected={day} onSelect={setDay} />
          </Card>
        </Span>
        <Stack gap={16}>
          <Card title={new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })} icon={CalendarDays}>
            {dayEvents.length === 0 ? <Txt size="sm" soft>Nothing due on this day.</Txt> : (
              <Stagger key={day} gap={8}>
                {dayEvents.map((e) => (
                  <Press key={e.id} onPress={() => e.href && go(e.href)} scale={0.98} style={{ borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: styles[e.kind].bg }}>
                    <Txt size="xxs" weight="semibold" upper color={styles[e.kind].fg} style={{ opacity: 0.8 }}>{styles[e.kind].label}</Txt>
                    <Txt weight="semibold" color={styles[e.kind].fg}>{e.title}</Txt>
                    {e.detail ? <Txt size="xs" color={styles[e.kind].fg} style={{ opacity: 0.8 }}>{e.detail}</Txt> : null}
                  </Press>
                ))}
              </Stagger>
            )}
          </Card>
          {timetable.data && (
            <Card title="Classes" icon={Clock} actions={<LinkText href="/app/timetable">Week</LinkText>}>
              {classes.length === 0 ? <Empty>No classes on {formatDate(day)}.</Empty> : (
                <Schedule live={day === todayIso()} slots={classes.map((t) => ({ id: t.id, start: t.start_time, end: t.end_time, title: t.subject_name, detail: [isTeacher ? t.section_name : t.teacher_name, t.room && `Room ${t.room}`].filter(Boolean).join(" · ") }))} />
              )}
            </Card>
          )}
        </Stack>
      </Grid>
    </Screen>
  );
}
