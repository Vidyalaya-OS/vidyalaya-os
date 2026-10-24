import { CalendarClock, Clock, Plus, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { DateField } from "@/components/Calendar";
import { useDialog } from "@/components/dialog";
import { useNow, useSubjectColor } from "@/components/Schedule";
import { useToast } from "@/components/toast";
import { Alert, Button, Card, Checkbox, Empty, Enter, ErrorState, Field, Grid as Cols, Loading, PageHeader, Press, Row, Screen, Segmented, Select, Sheet, Stack, Stagger, Txt, useLayout } from "@/components/ui";
import { api, ApiError, Page } from "@/lib/api";
import { DAYS, shortTime } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import type { Period, Section, SectionSubject, Teacher, TimetableEntry } from "@/lib/types";
import { rows, useApi } from "@/lib/useApi";
import { useForm } from "@/lib/useForm";

export default function TimetablePage() {
  const { hasRole } = useSession();
  const isAdmin = hasRole("admin");
  const isTeacher = hasRole("teacher");
  const periods = useApi<Period[]>("periods/");
  const sections = useApi<Page<Section>>("sections/");
  const [view, setView] = useState<string>(isTeacher && !isAdmin ? "mine" : "");
  const sectionList = rows(sections.data);
  const chosen = view || sectionList[0]?.id || "";
  const entries = useApi<TimetableEntry[]>(chosen ? (chosen === "mine" ? "timetable/?mine=true" : `timetable/?section=${chosen}`) : null);
  const [editing, setEditing] = useState<{ day: number; period: Period; entry?: TimetableEntry } | null>(null);
  const [mode, setMode] = useState<"week" | "day">("week");
  const { md } = useLayout();

  return (
    <Screen>
      <PageHeader title="Timetable" subtitle={isAdmin ? "Set the periods of the day, then fill each section's week." : "The weekly class schedule."} />
      <Stack gap={16}>
        {isAdmin && <PeriodsCard periods={periods.data ?? []} reload={periods.reload} />}
        <Card title="Weekly timetable" icon={CalendarClock} description={isAdmin && chosen !== "mine" ? "Tap a slot to set its subject, teacher and room." : undefined}>
          <Row wrap gap={12} align="flex-end" style={{ marginBottom: 16 }}>
            {md && <Segmented value={mode} onChange={setMode} options={[{ key: "week", label: "Week" }, { key: "day", label: "By day" }]} />}
            {(isAdmin || isTeacher || sectionList.length > 1) && (
              <Select label="Show" value={chosen} onChange={(v) => { setView(v); setEditing(null); }} style={{ minWidth: 200, flexGrow: 1, maxWidth: 360 }}
                options={[...(isTeacher ? [{ value: "mine", label: "My classes" }] : []), ...sectionList.map((s) => ({ value: s.id, label: s.display_name }))]} />
            )}
          </Row>
          {(periods.error && !periods.data) || (entries.error && !entries.data) ? (
            <ErrorState message={periods.error ?? entries.error} onRetry={() => { periods.reload(); entries.reload(); }} />
          ) : !periods.data || (entries.loading && !entries.data) ? <Loading variant="table" rows={6} /> : periods.data.length === 0 ? (
            <Empty>{isAdmin ? "Add the periods of the school day first." : "The timetable is not set up yet."}</Empty>
          ) : (
            <WeekGrid mode={md ? mode : "day"} periods={periods.data} entries={entries.data ?? []} showSection={chosen === "mine"}
              onPick={isAdmin && chosen !== "mine" ? (day, period, entry) => setEditing({ day, period, entry }) : undefined} />
          )}
        </Card>
      </Stack>
      <Sheet open={Boolean(editing && chosen !== "mine")} onClose={() => setEditing(null)} title={editing ? `${DAYS[editing.day - 1]}, ${editing.period.name}` : ""}
        description={editing ? `${shortTime(editing.period.start_time)}–${shortTime(editing.period.end_time)} · ${sectionList.find((s) => s.id === chosen)?.display_name ?? ""}` : undefined}>
        {editing && chosen !== "mine" && (
          <SlotEditor key={`${editing.day}-${editing.period.id}`} section={chosen} {...editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); entries.reload(); }} />
        )}
      </Sheet>
    </Screen>
  );
}

function WeekGrid({ mode, periods, entries, showSection, onPick }: {
  mode: "week" | "day"; periods: Period[]; entries: TimetableEntry[]; showSection: boolean; onPick?: (day: number, period: Period, entry?: TimetableEntry) => void;
}) {
  const { c } = useTheme();
  const color = useSubjectColor();
  const days = entries.some((e) => e.day_of_week === 6) || onPick ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];
  const at = useMemo(() => {
    const map = new Map<string, TimetableEntry[]>();
    for (const e of entries) map.set(`${e.day_of_week}-${e.period}`, [...(map.get(`${e.day_of_week}-${e.period}`) ?? []), e]);
    return map;
  }, [entries]);
  const today = ((new Date().getDay() + 6) % 7) + 1;
  const [pickedDay, setPickedDay] = useState(days.includes(today) ? today : days[0]);
  const now = useNow();
  const isNow = (day: number, p: Period) => day === today && now >= shortTime(p.start_time) && now < shortTime(p.end_time);

  const cell = (day: number, p: Period) => {
    if (p.is_break) return <Txt size="xs" weight="medium" soft upper center style={{ paddingVertical: 6 }}>{p.name}</Txt>;
    const list = at.get(`${day}-${p.id}`) ?? [];
    const body = list.length === 0 ? (
      <View style={{ minHeight: 56, borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: c.line, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4 }}>
        {onPick && <Plus size={14} color={c.soft} />}
        <Txt size="xs" soft>{onPick ? "Add" : "Free"}</Txt>
      </View>
    ) : (
      <View style={{ gap: 4 }}>
        {list.map((e) => {
          const h = color(e.subject_name);
          return (
            <View key={e.id} style={{ minHeight: 56, borderRadius: 12, borderLeftWidth: 4, borderLeftColor: h.bar, backgroundColor: h.tint, paddingHorizontal: 10, paddingVertical: 8, borderWidth: isNow(day, p) ? 2 : 0, borderColor: c.brand }}>
              <Txt size="sm" weight="semibold" numberOfLines={1}>{e.subject_name}</Txt>
              <Txt size="xs" soft numberOfLines={1}>{showSection ? e.section_name : e.teacher_name ?? "No teacher"}{e.room ? ` · ${e.room}` : ""}</Txt>
            </View>
          );
        })}
      </View>
    );
    return onPick ? (
      <Press onPress={() => onPick(day, p, list[0])} scale={0.97} accessibilityLabel={`${DAYS[day - 1]} ${p.name}: ${list[0]?.subject_name ?? "empty, add a class"}`}>{body}</Press>
    ) : body;
  };

  if (mode === "week") {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ minWidth: 760, gap: 6 }}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <Txt size="xxs" weight="semibold" soft upper style={{ width: 96, padding: 4 }}>Period</Txt>
            {days.map((d) => (
              <View key={d} style={{ flex: 1, minWidth: 110, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: d === today ? c.brandSoft : "transparent" }}>
                <Txt size="xxs" weight="semibold" upper color={d === today ? c.brand : c.soft}>{DAYS[d - 1]}</Txt>
              </View>
            ))}
          </View>
          {periods.map((p) => (
            <View key={p.id} style={{ flexDirection: "row", gap: 6, borderRadius: 10, backgroundColor: p.is_break ? c.muted + "80" : "transparent" }}>
              <View style={{ width: 96, padding: 4 }}>
                <Txt size="sm" weight="semibold">{p.name}</Txt>
                <Txt size="xs" soft tabular>{shortTime(p.start_time)}–{shortTime(p.end_time)}</Txt>
              </View>
              {days.map((d) => <View key={d} style={{ flex: 1, minWidth: 110 }}>{cell(d, p)}</View>)}
            </View>
          ))}
        </View>
      </ScrollView>
    );
  }

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 4 }} style={{ marginBottom: 14 }}>
        {days.map((d) => {
          const on = pickedDay === d;
          return (
            <Pressable key={d} onPress={() => setPickedDay(d)} accessibilityRole="tab" accessibilityState={{ selected: on }}
              style={{ minHeight: 50, minWidth: 58, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", borderColor: on ? c.brand : c.line, backgroundColor: on ? c.brand : c.surface }}>
              <Txt size="xs" weight="semibold" color={on ? c.onBrand : c.soft}>{DAYS[d - 1].slice(0, 3)}</Txt>
              {d === today && <View style={{ marginTop: 3, width: 6, height: 6, borderRadius: 3, backgroundColor: on ? c.onBrand : c.brand }} />}
            </Pressable>
          );
        })}
      </ScrollView>
      <Stagger key={pickedDay} gap={8}>
        {periods.map((p) => (
          <Row key={p.id} gap={12} align="stretch">
            <View style={{ width: 52, paddingTop: 8, alignItems: "flex-end" }}>
              <Txt size="xs" weight="semibold" tabular>{shortTime(p.start_time)}</Txt>
              <Txt size="xs" soft tabular>{shortTime(p.end_time)}</Txt>
            </View>
            <View style={{ flex: 1 }}>{cell(pickedDay, p)}</View>
          </Row>
        ))}
      </Stagger>
    </View>
  );
}

function SlotEditor({ section, day, period, entry, onClose, onSaved }: { section: string; day: number; period: Period; entry?: TimetableEntry; onClose: () => void; onSaved: () => void }) {
  const links = useApi<Page<SectionSubject>>(`section-subjects/?section=${section}`);
  const teachers = useApi<Page<Teacher>>("teachers/?status=active");
  const form = useForm({ subject: entry?.subject ?? "", teacher: entry?.teacher ?? "", room: entry?.room ?? "" });
  const [clash, setClash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const dialog = useDialog();

  const save = async (allowClash = false) => {
    const link = rows(links.data).find((l) => l.subject === form.values.subject);
    const body = { section, day_of_week: day, period: period.id, subject: form.values.subject, room: form.values.room, teacher: form.values.teacher || link?.teacher || null, allow_clash: allowClash };
    setBusy(true);
    setError(null);
    try {
      if (entry) await api(`timetable/${entry.id}/`, { method: "PATCH", body });
      else await api("timetable/", { method: "POST", body });
      toast.success(`${DAYS[day - 1]}, ${period.name} saved.`);
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.fields.clashes) setClash(e.fields.teacher);
      else setError(e instanceof ApiError ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!entry) return;
    if (!(await dialog.confirm({ title: "Clear this slot?", body: `${entry.subject_name} will be removed from ${DAYS[day - 1]}, ${period.name}.`, confirmLabel: "Clear slot", danger: true }))) return;
    try {
      await api(`timetable/${entry.id}/`, { method: "DELETE" });
      toast.success("Slot cleared.");
      onSaved();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Stack gap={12}>
      {error && <Alert>{error}</Alert>}
      {clash && (
        <Stack gap={8}>
          <Alert tone="warn" title="Teacher already booked">{clash}</Alert>
          <Button variant="secondary" size="sm" onPress={() => save(true)}>Save anyway</Button>
        </Stack>
      )}
      <Select label="Subject" {...form.bind("subject")} options={rows(links.data).map((l) => ({ value: l.subject, label: l.subject_name, detail: l.teacher_name ?? undefined }))} />
      <Select label="Teacher" {...form.bind("teacher")} options={[{ value: "", label: "The subject's teacher" }, ...rows(teachers.data).map((t) => ({ value: t.id, label: t.name }))]} />
      <Field label="Room" {...form.bind("room")} />
      {rows(links.data).length === 0 && links.data && <Txt size="xs" soft>Assign subjects to this section under Classes &amp; subjects first.</Txt>}
      <Row wrap gap={8} style={{ marginTop: 6 }}>
        <Button onPress={() => save()} busy={busy} disabled={!form.values.subject}>Save</Button>
        {entry && <Button variant="danger" onPress={remove}>Clear slot</Button>}
        <Button variant="ghost" onPress={onClose}>Cancel</Button>
      </Row>
    </Stack>
  );
}

function PeriodsCard({ periods, reload }: { periods: Period[]; reload: () => void }) {
  const { c, tone } = useTheme();
  const form = useForm({ name: "", start_time: "", end_time: "", order: "", is_break: false as boolean });
  const toast = useToast();
  const remove = async (p: Period) => {
    try {
      await api(`periods/${p.id}/`, { method: "DELETE" });
      toast.success(`${p.name} removed.`);
      reload();
    } catch (e) {
      toast.error(e, "Could not remove the period.");
    }
  };
  return (
    <Card title="Periods of the day" icon={Clock}>
      {periods.length > 0 && (
        <Row wrap gap={8} style={{ marginBottom: 16 }}>
          {periods.map((p) => (
            <Enter key={p.id}>
              <Row gap={8} style={{ borderRadius: 12, borderWidth: 1, borderColor: c.line, paddingLeft: 12, paddingRight: 2, paddingVertical: 2, backgroundColor: p.is_break ? c.muted : c.surface }}>
                <Txt size="sm" weight="medium">{p.name}</Txt>
                <Txt size="sm" soft tabular>{shortTime(p.start_time)}–{shortTime(p.end_time)}</Txt>
                <Pressable onPress={() => remove(p)} hitSlop={6} accessibilityLabel={`Remove ${p.name}`} style={({ pressed }) => ({ padding: 7, borderRadius: 9, backgroundColor: pressed ? tone.bad.bg : "transparent" })}>
                  <X size={14} color={c.soft} />
                </Pressable>
              </Row>
            </Enter>
          ))}
        </Row>
      )}
      <Stack gap={12}>
        {form.error && <Alert>{form.error}</Alert>}
        <Cols cols={{ base: 1, sm: 3 }} gap={12}>
          <Field label="Name" placeholder="Period 1" {...form.bind("name")} />
          <DateField mode="time" label="Starts" value={String(form.values.start_time)} onChange={(v) => form.set("start_time", v)} error={form.errors.start_time} />
          <DateField mode="time" label="Ends" value={String(form.values.end_time)} onChange={(v) => form.set("end_time", v)} error={form.errors.end_time} />
        </Cols>
        <Row wrap gap={12} justify="space-between">
          <Checkbox label="It's a break" checked={Boolean(form.values.is_break)} onChange={(v) => form.set("is_break", v)} />
          <Button variant="secondary" busy={form.busy} onPress={form.submit((v) => api("periods/", { method: "POST", body: { ...v, order: Number(v.order || periods.length + 1) } }), reload)}>Add period</Button>
        </Row>
      </Stack>
    </Card>
  );
}
