"use client";

import { CalendarClock, Clock, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Modal, useDialog } from "@/components/dialog";
import { subjectColor, useNow } from "@/components/Schedule";
import { useToast } from "@/components/toast";
import { Alert, Button, Card, Checkbox, Empty, ErrorState, Field, Loading, PageHeader, Segmented, Select, cx } from "@/components/ui";
import { api, ApiError, Page } from "@/lib/api";
import { DAYS, shortTime } from "@/lib/format";
import { useSession } from "@/lib/session";
import { Period, Section, SectionSubject, Teacher, TimetableEntry } from "@/lib/types";
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

  return (
    <>
      <PageHeader title="Timetable" subtitle={isAdmin ? "Set the periods of the day, then fill each section's week." : "The weekly class schedule."} />
      <div className="grid gap-5">
        {isAdmin && <PeriodsCard periods={periods.data ?? []} reload={periods.reload} />}
        <Card
          title="Weekly timetable"
          icon={<CalendarClock aria-hidden />}
          description={isAdmin && chosen !== "mine" ? "Tap a slot to set its subject, teacher and room." : undefined}
          actions={
            <div className="flex flex-wrap items-end gap-3">
              <Segmented label="View" value={mode} onChange={setMode} options={[{ key: "week", label: "Week" }, { key: "day", label: "By day" }]} />
              {(isAdmin || isTeacher || sectionList.length > 1) && (
                <Select label="Show" value={chosen} onChange={(e) => { setView(e.target.value); setEditing(null); }} className="min-w-48">
                  {isTeacher && <option value="mine">My classes</option>}
                  {sectionList.map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
                </Select>
              )}
            </div>
          }
        >
          {(periods.error && !periods.data) || (entries.error && !entries.data) ? (
            <ErrorState message={periods.error ?? entries.error} onRetry={() => { periods.reload(); entries.reload(); }} />
          ) : !periods.data || entries.loading && !entries.data ? <Loading variant="table" rows={6} /> : periods.data.length === 0 ? (
            <Empty>{isAdmin ? "Add the periods of the school day first." : "The timetable is not set up yet."}</Empty>
          ) : (
            <Grid
              mode={mode}
              periods={periods.data}
              entries={entries.data ?? []}
              showSection={chosen === "mine"}
              onPick={isAdmin && chosen !== "mine" ? (day, period, entry) => setEditing({ day, period, entry }) : undefined}
            />
          )}
          <Modal open={Boolean(editing && chosen !== "mine")} onClose={() => setEditing(null)} title={editing ? `${DAYS[editing.day - 1]}, ${editing.period.name}` : ""}
            description={editing ? `${shortTime(editing.period.start_time)}–${shortTime(editing.period.end_time)} · ${sectionList.find((s) => s.id === chosen)?.display_name ?? ""}` : undefined}>
            {editing && chosen !== "mine" && (
              <SlotEditor
                key={`${editing.day}-${editing.period.id}`}
                section={chosen}
                {...editing}
                onClose={() => setEditing(null)}
                onSaved={() => { setEditing(null); entries.reload(); }}
              />
            )}
          </Modal>
        </Card>
      </div>
    </>
  );
}

function Grid({ mode, periods, entries, showSection, onPick }: {
  mode: "week" | "day";
  periods: Period[];
  entries: TimetableEntry[];
  showSection: boolean;
  onPick?: (day: number, period: Period, entry?: TimetableEntry) => void;
}) {
  const days = entries.some((e) => e.day_of_week === 6) || onPick ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];
  const at = useMemo(() => {
    const map = new Map<string, TimetableEntry[]>();
    for (const e of entries) map.set(`${e.day_of_week}-${e.period}`, [...(map.get(`${e.day_of_week}-${e.period}`) ?? []), e]);
    return map;
  }, [entries]);
  const today = ((new Date().getDay() + 6) % 7) + 1;
  const [pickedDay, setPickedDay] = useState(days.includes(today) ? today : days[0]);
  const now = useNow();
  const isNow = (day: number, p: Period) => day === today && now != null && now >= shortTime(p.start_time) && now < shortTime(p.end_time);

  const cell = (day: number, p: Period) => {
    if (p.is_break) return <span className="block py-1 text-center text-xs font-medium uppercase tracking-wide text-soft">{p.name}</span>;
    const list = at.get(`${day}-${p.id}`) ?? [];
    const body = list.length === 0 ? (
      <span className={cx("flex min-h-14 items-center justify-center rounded-xl border border-dashed border-line text-xs text-soft", onPick && "transition group-hover:border-brand group-hover:text-brand")}>
        {onPick ? <><Plus className="mr-1 size-3.5" aria-hidden /> Add</> : "Free"}
      </span>
    ) : list.map((e) => (
      <span key={e.id} className={cx("block min-h-14 rounded-xl border-l-4 px-2.5 py-2 transition", subjectColor(e.subject_name), isNow(day, p) && "ring-2 ring-brand", onPick && "group-hover:brightness-95")}>
        <span className="block truncate font-semibold">{e.subject_name}</span>
        <span className="block truncate text-xs text-soft">{showSection ? e.section_name : e.teacher_name ?? "No teacher"}{e.room ? ` · ${e.room}` : ""}</span>
      </span>
    ));
    return onPick ? (
      <button className="group block w-full text-left" onClick={() => onPick(day, p, list[0])} aria-label={`${DAYS[day - 1]} ${p.name}: ${list[0]?.subject_name ?? "empty, add a class"}`}>{body}</button>
    ) : body;
  };

  const dayList = (d: number) => (
    <ul className="stagger space-y-2">
      {periods.map((p) => (
        <li key={p.id} className="flex items-stretch gap-3">
          <span className="w-14 shrink-0 pt-2 text-right text-xs tabular-nums text-soft"><span className="block font-semibold text-ink">{shortTime(p.start_time)}</span>{shortTime(p.end_time)}</span>
          <span className="min-w-0 flex-1">{cell(d, p)}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <div className={cx("-mx-1 overflow-x-auto px-1", mode === "week" ? "hidden md:block" : "hidden")}>
        <table className="w-full min-w-[46rem] table-fixed border-separate border-spacing-1.5 text-left text-sm">
          <thead>
            <tr className="text-xs font-semibold uppercase tracking-wide text-soft">
              <th className="w-24 px-1 py-1">Period</th>
              {days.map((d) => (
                <th key={d} className={cx("rounded-lg px-2 py-1.5", d === today && "bg-brand-soft text-brand")}>{DAYS[d - 1].slice(0, 3)}<span className="hidden lg:inline">{DAYS[d - 1].slice(3)}</span></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => (
              <tr key={p.id} className={cx(p.is_break && "bg-muted/50")}>
                <td className="px-1 align-top"><div className="font-semibold">{p.name}</div><div className="text-xs tabular-nums text-soft">{shortTime(p.start_time)}–{shortTime(p.end_time)}</div></td>
                {days.map((d) => <td key={d} className="align-top">{cell(d, p)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* One day at a time: always on phones, and in the By day view. */}
      <div className={mode === "week" ? "md:hidden" : undefined}>
        <div role="tablist" aria-label="Day" className="scrollbar-none -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1">
          {days.map((d) => (
            <button key={d} role="tab" aria-selected={pickedDay === d} onClick={() => setPickedDay(d)}
              className={cx("flex min-h-12 min-w-14 shrink-0 flex-col items-center justify-center rounded-xl border px-3 text-xs font-semibold transition", pickedDay === d ? "border-brand bg-brand text-white shadow-sm dark:text-slate-950" : "border-line bg-surface text-soft hover:text-ink")}>
              {DAYS[d - 1].slice(0, 3)}
              {d === today && <span className={cx("mt-0.5 size-1.5 rounded-full", pickedDay === d ? "bg-white" : "bg-brand")} aria-label="today" />}
            </button>
          ))}
        </div>
        <div key={pickedDay} className="animate-enter">{dayList(pickedDay)}</div>
      </div>
    </>
  );
}

function SlotEditor({ section, day, period, entry, onClose, onSaved }: {
  section: string;
  day: number;
  period: Period;
  entry?: TimetableEntry;
  onClose: () => void;
  onSaved: () => void;
}) {
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
    const body = {
      section, day_of_week: day, period: period.id, subject: form.values.subject, room: form.values.room,
      teacher: form.values.teacher || link?.teacher || null, allow_clash: allowClash,
    };
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
    <div>
      {error && <div className="mb-3"><Alert>{error}</Alert></div>}
      {clash && (
        <div className="mb-3 space-y-2">
          <Alert tone="warn" title="Teacher already booked">{clash}</Alert>
          <Button variant="secondary" size="sm" onClick={() => save(true)}>Save anyway</Button>
        </div>
      )}
      <div className="grid gap-3">
        <Select label="Subject" required {...form.bind("subject")}>
          <option value="">Choose…</option>
          {rows(links.data).map((l) => <option key={l.subject} value={l.subject}>{l.subject_name}</option>)}
        </Select>
        <Select label="Teacher" {...form.bind("teacher")}>
          <option value="">The subject&apos;s teacher</option>
          {rows(teachers.data).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        <Field label="Room" {...form.bind("room")} />
      </div>
      {rows(links.data).length === 0 && links.data && <p className="mt-2 text-xs text-soft">Assign subjects to this section under Classes &amp; subjects first.</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <Button onClick={() => save()} busy={busy} disabled={!form.values.subject}>Save</Button>
        {entry && <Button variant="danger" onClick={remove}>Clear slot</Button>}
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}

function PeriodsCard({ periods, reload }: { periods: Period[]; reload: () => void }) {
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
    <Card title="Periods of the day" icon={<Clock aria-hidden />}>
      {periods.length > 0 && (
        <ul className="mb-4 flex flex-wrap gap-2 text-sm">
          {periods.map((p) => (
            <li key={p.id} className={cx("flex items-center gap-2 rounded-xl border border-line py-1 pl-3 pr-1", p.is_break && "bg-muted")}>
              <span className="font-medium">{p.name}</span>
              <span className="tabular-nums text-soft">{shortTime(p.start_time)}–{shortTime(p.end_time)}</span>
              <button className="rounded-lg p-1.5 text-soft hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950" onClick={() => remove(p)} aria-label={`Remove ${p.name}`}><X className="size-3.5" aria-hidden /></button>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={form.submit((v) => api("periods/", { method: "POST", body: { ...v, order: Number(v.order || periods.length + 1) } }), reload)}
        className="grid gap-3 sm:grid-cols-5"
      >
        {form.error && <div className="sm:col-span-5"><Alert>{form.error}</Alert></div>}
        <Field label="Name" placeholder="Period 1" required {...form.bind("name")} />
        <Field label="Starts" type="time" required {...form.bind("start_time")} />
        <Field label="Ends" type="time" required {...form.bind("end_time")} />
        <Checkbox className="self-end" label="It's a break" checked={Boolean(form.values.is_break)} onChange={(e) => form.setValues((v) => ({ ...v, is_break: e.target.checked }))} />
        <div className="flex items-end"><Button type="submit" busy={form.busy} variant="secondary">Add period</Button></div>
      </form>
    </Card>
  );
}
