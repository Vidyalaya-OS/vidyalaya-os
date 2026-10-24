import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, X } from "lucide-react-native";
import { useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { formatDate, formatDateTime, todayIso } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { Button, IconButton, Row, Sheet, Txt, useLayout } from "./ui";

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type CalendarEvent = { id: string; date: string; title: string; kind: EventKind; detail?: string; href?: string };
export type EventKind = "homework" | "test" | "quiz" | "fee" | "overdue";

const EVENT_LIGHT: Record<EventKind, { label: string; dot: string; bg: string; fg: string }> = {
  homework: { label: "Homework", dot: "#3b82f6", bg: "#eff6ff", fg: "#1e40af" },
  test: { label: "Test", dot: "#8b5cf6", bg: "#f5f3ff", fg: "#5b21b6" },
  quiz: { label: "Quiz closes", dot: "#14b8a6", bg: "#f0fdfa", fg: "#115e59" },
  fee: { label: "Fee due", dot: "#f59e0b", bg: "#fffbeb", fg: "#78350f" },
  overdue: { label: "Overdue fee", dot: "#ef4444", bg: "#fef2f2", fg: "#991b1b" },
};
const EVENT_DARK: typeof EVENT_LIGHT = {
  homework: { ...EVENT_LIGHT.homework, bg: "#172554b3", fg: "#bfdbfe" },
  test: { ...EVENT_LIGHT.test, bg: "#2e1065b3", fg: "#ddd6fe" },
  quiz: { ...EVENT_LIGHT.quiz, bg: "#042f2eb3", fg: "#99f6e4" },
  fee: { ...EVENT_LIGHT.fee, bg: "#451a03b3", fg: "#fde68a" },
  overdue: { ...EVENT_LIGHT.overdue, bg: "#450a0ab3", fg: "#fecaca" },
};

export function useEventStyle() {
  return useTheme().dark ? EVENT_DARK : EVENT_LIGHT;
}

export function shiftMonth(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthTitle(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** The first and last day of a month, as YYYY-MM-DD. */
export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  return { first: `${month}-01`, last: `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}` };
}

export function MonthNav({ month, onChange, min, max }: { month: string; onChange: (m: string) => void; min?: string; max?: string }) {
  const { c } = useTheme();
  const current = todayIso().slice(0, 7);
  return (
    <Row gap={2}>
      <IconButton icon={ChevronLeft} label="Previous month" onPress={() => onChange(shiftMonth(month, -1))} disabled={min != null && month <= min} color={c.ink} />
      <Txt size="sm" weight="semibold" center style={{ minWidth: 128 }}>{monthTitle(month)}</Txt>
      <IconButton icon={ChevronRight} label="Next month" onPress={() => onChange(shiftMonth(month, 1))} disabled={max != null && month >= max} color={c.ink} />
      {month !== current && (
        <Pressable onPress={() => onChange(current)} hitSlop={6} style={{ paddingHorizontal: 8, paddingVertical: 6, borderRadius: 10, backgroundColor: c.brandSoft }}>
          <Txt size="xs" weight="semibold" color={c.brand}>Today</Txt>
        </Pressable>
      )}
    </Row>
  );
}

export type DayLook = { bg?: string; border?: string; fg?: string };

/** A Monday-first month grid. Each day can be coloured (attendance) and carry
 * event dots or chips (due dates). Days can be tapped when onSelect is given. */
export function MonthGrid({ month, events = [], dayStyle, dayNote, selected, onSelect }: {
  month: string; events?: CalendarEvent[]; dayStyle?: (iso: string) => DayLook | undefined; dayNote?: (iso: string) => string | null | undefined;
  selected?: string | null; onSelect?: (iso: string) => void;
}) {
  const { c } = useTheme();
  const { md } = useLayout();
  const styles = useEventStyle();
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const today = todayIso();
  const byDate = new Map<string, CalendarEvent[]>();
  for (const e of events) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", gap: 4 }}>
        {WEEKDAYS.map((w) => <Txt key={w} size="xxs" weight="semibold" soft upper center style={{ flex: 1, paddingVertical: 4 }}>{md ? w : w[0]}</Txt>)}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={{ flexDirection: "row", gap: 4 }}>
          {week.map((day, di) => {
            if (day == null) return <View key={`e${di}`} style={{ flex: 1, minHeight: md ? 88 : 50 }} />;
            const iso = `${month}-${String(day).padStart(2, "0")}`;
            const list = byDate.get(iso) ?? [];
            const isToday = iso === today;
            const isSelected = selected === iso;
            const weekend = di >= 5;
            const look = dayStyle?.(iso);
            const note = dayNote?.(iso);
            const label = `${new Date(y, m - 1, day).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}${list.length ? `, ${list.length} item${list.length === 1 ? "" : "s"}` : ""}`;
            const body = (
              <View style={{
                flex: 1, minHeight: md ? 88 : 50, borderRadius: 12, borderWidth: isSelected ? 2 : 1, padding: md ? 6 : 3,
                alignItems: md ? "stretch" : "center",
                borderColor: isSelected ? c.brand : look?.border ?? (weekend ? "transparent" : c.line),
                backgroundColor: look?.bg ?? (weekend ? c.muted + "88" : c.surface),
              }}>
                <View style={{ alignSelf: md ? "flex-start" : "center", width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: isToday ? c.brand : "transparent" }}>
                  <Txt size="xs" weight="semibold" tabular color={isToday ? c.onBrand : look?.fg}>{day}</Txt>
                </View>
                {note ? <Txt size="xxs" numberOfLines={1} color={look?.fg} soft={!look?.fg} center={!md} style={{ fontSize: 10, lineHeight: 13 }}>{note}</Txt> : null}
                {list.length > 0 && (md ? (
                  <View style={{ gap: 2, marginTop: 2 }}>
                    {list.slice(0, 2).map((e) => (
                      <View key={e.id} style={{ borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1, backgroundColor: styles[e.kind].bg }}>
                        <Txt size="xxs" weight="medium" numberOfLines={1} color={styles[e.kind].fg} style={{ fontSize: 11, lineHeight: 15 }}>{e.title}</Txt>
                      </View>
                    ))}
                    {list.length > 2 && <Txt size="xxs" soft style={{ fontSize: 11, paddingHorizontal: 5 }}>+{list.length - 2} more</Txt>}
                  </View>
                ) : (
                  <Row gap={2} justify="center" style={{ marginTop: 3 }}>
                    {list.slice(0, 3).map((e) => <View key={e.id} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: styles[e.kind].dot }} />)}
                  </Row>
                ))}
              </View>
            );
            return onSelect ? (
              <Pressable key={iso} style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.7 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] })} onPress={() => onSelect(iso)} accessibilityLabel={label} accessibilityState={{ selected: isSelected }}>
                {body}
              </Pressable>
            ) : <View key={iso} style={{ flex: 1 }} accessibilityLabel={label}>{body}</View>;
          })}
        </View>
      ))}
    </View>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <Row wrap gap={14}>
      {items.map((i) => (
        <Row key={i.label} gap={6}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: i.color }} />
          <Txt size="xs" soft>{i.label}</Txt>
        </Row>
      ))}
    </Row>
  );
}

/* ------------------------------------------------------------ date fields */

function toIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function toLocal(d: Date) {
  return `${toIso(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function toTime(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function parse(value: string, mode: "date" | "datetime" | "time") {
  if (!value) return new Date();
  if (mode === "time") {
    const [h, m] = value.split(":").map(Number);
    const d = new Date();
    d.setHours(h || 0, m || 0, 0, 0);
    return d;
  }
  if (mode === "date") {
    const [y, mo, d] = value.slice(0, 10).split("-").map(Number);
    return new Date(y, (mo || 1) - 1, d || 1);
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** A date (YYYY-MM-DD), a local date and time (YYYY-MM-DDTHH:mm) or a time
 * (HH:mm), chosen with the phone's own picker. */
export function DateField({ label, value, onChange, mode = "date", min, max, error, hint, optional, clearable, placeholder, style }: {
  label?: string; value: string; onChange: (v: string) => void; mode?: "date" | "datetime" | "time"; min?: string; max?: string;
  error?: string | null; hint?: string; optional?: boolean; clearable?: boolean; placeholder?: string; style?: object;
}) {
  const { c, tone, dark } = useTheme();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(() => parse(value, mode));
  const minDate = min ? parse(min, mode === "time" ? "time" : mode) : undefined;
  const maxDate = max ? parse(max, mode === "time" ? "time" : mode) : undefined;
  const out = (d: Date) => (mode === "date" ? toIso(d) : mode === "time" ? toTime(d) : toLocal(d));
  const shown = !value ? null : mode === "date" ? formatDate(value) : mode === "time" ? value : formatDateTime(value);

  const show = () => {
    const start = parse(value, mode);
    if (Platform.OS === "android") {
      const first = mode === "time" ? "time" : "date";
      DateTimePickerAndroid.open({
        value: start, mode: first, minimumDate: minDate, maximumDate: maxDate, is24Hour: true,
        onChange: (e, d) => {
          if (e.type !== "set" || !d) return;
          if (mode !== "datetime") return onChange(out(d));
          DateTimePickerAndroid.open({
            value: d, mode: "time", is24Hour: true,
            onChange: (e2, t) => {
              if (e2.type !== "set" || !t) return;
              const both = new Date(d);
              both.setHours(t.getHours(), t.getMinutes(), 0, 0);
              onChange(out(both));
            },
          });
        },
      });
      return;
    }
    setDraft(start);
    setOpen(true);
  };

  const IconC = mode === "time" ? Clock : CalendarDays;
  return (
    <View style={style}>
      {label != null && (
        <Row justify="space-between" style={{ marginBottom: 6 }}>
          <Txt size="sm" weight="medium">{label}</Txt>
          {optional && <Txt size="xs" soft>Optional</Txt>}
        </Row>
      )}
      <Pressable onPress={show} accessibilityRole="button" accessibilityLabel={`${label ?? "Date"}: ${shown ?? "not set"}`}>
        <View style={{ minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: error ? tone.bad.solid : c.line, backgroundColor: c.surface, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <IconC size={17} color={c.soft} />
          <Txt style={{ flex: 1 }} color={shown ? c.ink : c.soft} numberOfLines={1}>{shown ?? placeholder ?? "Choose"}</Txt>
          {clearable && value ? <IconButton icon={X} label="Clear" size={30} onPress={() => onChange("")} /> : null}
        </View>
      </Pressable>
      {hint && !error ? <Txt size="xs" soft style={{ marginTop: 6 }}>{hint}</Txt> : null}
      {error ? <Txt size="xs" weight="medium" color={tone.bad.fg} style={{ marginTop: 6 }}>{error}</Txt> : null}
      {Platform.OS !== "android" && (
        <Sheet open={open} onClose={() => setOpen(false)} title={label ?? "Choose"}>
          <View style={{ alignItems: "center" }}>
            <DateTimePicker
              value={draft}
              mode={mode}
              display={mode === "time" ? "spinner" : "inline"}
              minimumDate={minDate}
              maximumDate={maxDate}
              themeVariant={dark ? "dark" : "light"}
              accentColor={c.brand}
              onChange={(_, d) => d && setDraft(d)}
            />
          </View>
          <Row justify="flex-end" gap={8} style={{ marginTop: 10 }}>
            <Button variant="secondary" onPress={() => setOpen(false)}>Cancel</Button>
            <Button onPress={() => { onChange(out(draft)); setOpen(false); }}>Done</Button>
          </Row>
        </Sheet>
      )}
    </View>
  );
}
