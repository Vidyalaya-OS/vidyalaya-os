"use client";

import { useMemo, useState } from "react";
import { Alert, Button, Card, Empty, Field, Loading, PageHeader, Select, cx } from "@/components/ui";
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

  return (
    <>
      <PageHeader title="Timetable" subtitle={isAdmin ? "Set the periods of the day, then fill each section's week." : "The weekly class schedule."} />
      <div className="grid gap-5">
        {isAdmin && <PeriodsCard periods={periods.data ?? []} reload={periods.reload} />}
        <Card
          title="Week"
          actions={
            <Select label="Show" value={chosen} onChange={(e) => { setView(e.target.value); setEditing(null); }} className="min-w-48">
              {isTeacher && <option value="mine">My classes</option>}
              {sectionList.map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
            </Select>
          }
        >
          {!periods.data || entries.loading && !entries.data ? <Loading /> : periods.data.length === 0 ? (
            <Empty>{isAdmin ? "Add the periods of the school day first." : "The timetable is not set up yet."}</Empty>
          ) : (
            <Grid
              periods={periods.data}
              entries={entries.data ?? []}
              showSection={chosen === "mine"}
              onPick={isAdmin && chosen !== "mine" ? (day, period, entry) => setEditing({ day, period, entry }) : undefined}
            />
          )}
          {editing && chosen !== "mine" && (
            <SlotEditor
              key={`${editing.day}-${editing.period.id}`}
              section={chosen}
              {...editing}
              onClose={() => setEditing(null)}
              onSaved={() => { setEditing(null); entries.reload(); }}
            />
          )}
        </Card>
      </div>
    </>
  );
}

function Grid({ periods, entries, showSection, onPick }: {
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

  const cell = (day: number, p: Period) => {
    if (p.is_break) return <span className="text-xs text-soft">{p.name}</span>;
    const list = at.get(`${day}-${p.id}`) ?? [];
    const body = list.length === 0 ? <span className="text-soft">{onPick ? "+ Add" : "-"}</span> : list.map((e) => (
      <span key={e.id} className="block">
        <span className="font-medium">{e.subject_name}</span>
        <span className="block text-xs text-soft">{showSection ? e.section_name : e.teacher_name ?? "No teacher"}{e.room ? ` · ${e.room}` : ""}</span>
      </span>
    ));
    return onPick ? (
      <button className="w-full rounded-md p-1 text-left hover:bg-muted" onClick={() => onPick(day, p, list[0])}>{body}</button>
    ) : body;
  };

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full table-fixed text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wide text-soft">
              <th className="w-28 px-2 py-2 font-medium">Period</th>
              {days.map((d) => <th key={d} className={cx("px-2 py-2 font-medium", d === today && "text-brand")}>{DAYS[d - 1]}</th>)}
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => (
              <tr key={p.id} className={cx("border-b border-line last:border-0", p.is_break && "bg-muted/50")}>
                <td className="px-2 py-2 align-top"><div className="font-medium">{p.name}</div><div className="text-xs text-soft">{shortTime(p.start_time)}–{shortTime(p.end_time)}</div></td>
                {days.map((d) => <td key={d} className="px-2 py-2 align-top">{cell(d, p)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* On phones: one day at a time, today first. */}
      <div className="space-y-4 md:hidden">
        {[...days.filter((d) => d >= today), ...days.filter((d) => d < today)].map((d) => (
          <div key={d}>
            <h3 className={cx("mb-1 text-sm font-semibold", d === today && "text-brand")}>{DAYS[d - 1]}{d === today ? " (today)" : ""}</h3>
            <ul className="divide-y divide-line rounded-lg border border-line text-sm">
              {periods.map((p) => (
                <li key={p.id} className="flex gap-3 px-3 py-2">
                  <span className="w-20 shrink-0 text-xs text-soft">{shortTime(p.start_time)}–{shortTime(p.end_time)}</span>
                  <span className="min-w-0 flex-1">{cell(d, p)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
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

  const save = async (allowClash = false) => {
    const link = rows(links.data).find((l) => l.subject === form.values.subject);
    const body = {
      section, day_of_week: day, period: period.id, subject: form.values.subject, room: form.values.room,
      teacher: form.values.teacher || link?.teacher || null, allow_clash: allowClash,
    };
    try {
      if (entry) await api(`timetable/${entry.id}/`, { method: "PATCH", body });
      else await api("timetable/", { method: "POST", body });
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.fields.clashes) setClash(e.fields.teacher);
      else setError(e instanceof ApiError ? e.message : "Could not save.");
    }
  };

  const remove = async () => {
    if (!entry) return;
    await api(`timetable/${entry.id}/`, { method: "DELETE" });
    onSaved();
  };

  return (
    <div className="mt-4 rounded-lg border border-line p-4">
      <h3 className="mb-3 text-sm font-semibold">{DAYS[day - 1]}, {period.name} ({shortTime(period.start_time)}–{shortTime(period.end_time)})</h3>
      {error && <div className="mb-3"><Alert>{error}</Alert></div>}
      {clash && (
        <div className="mb-3 space-y-2">
          <Alert tone="info">{clash}</Alert>
          <Button variant="secondary" onClick={() => save(true)}>Save anyway</Button>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
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
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => save()} disabled={!form.values.subject}>Save</Button>
        {entry && <Button variant="danger" onClick={remove}>Clear slot</Button>}
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}

function PeriodsCard({ periods, reload }: { periods: Period[]; reload: () => void }) {
  const form = useForm({ name: "", start_time: "", end_time: "", order: "", is_break: false as boolean });
  const [error, setError] = useState<string | null>(null);
  const remove = async (p: Period) => {
    try {
      await api(`periods/${p.id}/`, { method: "DELETE" });
      reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not remove.");
    }
  };
  return (
    <Card title="Periods of the day">
      {error && <div className="mb-3"><Alert>{error}</Alert></div>}
      {periods.length > 0 && (
        <ul className="mb-4 flex flex-wrap gap-2 text-sm">
          {periods.map((p) => (
            <li key={p.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5">
              <span className="font-medium">{p.name}</span>
              <span className="text-soft">{shortTime(p.start_time)}–{shortTime(p.end_time)}</span>
              <button className="text-xs text-red-600" onClick={() => remove(p)} aria-label={`Remove ${p.name}`}>✕</button>
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
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input type="checkbox" checked={Boolean(form.values.is_break)} onChange={(e) => form.setValues((v) => ({ ...v, is_break: e.target.checked }))} />
          It&apos;s a break
        </label>
        <div className="flex items-end"><Button type="submit" busy={form.busy} variant="secondary">Add period</Button></div>
      </form>
    </Card>
  );
}
