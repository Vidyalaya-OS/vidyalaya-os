"use client";

import { BookMarked, CalendarRange, ChevronLeft, ChevronRight, Layers, Pencil, Plus, Sparkles, Trash2, UserCheck, X } from "lucide-react";
import { useRef, useState } from "react";
import { Modal, useDialog } from "@/components/dialog";
import { NewClassWizard, NewSubjectWizard, nextClass } from "@/components/SetupWizards";
import { useToast } from "@/components/toast";
import { Alert, Button, Card, Checkbox, cx, DataTable, Empty, Field, IconButton, PageHeader, Select } from "@/components/ui";
import { api, Page } from "@/lib/api";
import { AcademicYear, SchoolClass, Section, SectionSubject, Subject, Teacher } from "@/lib/types";
import { rows, useApi } from "@/lib/useApi";
import { compact } from "@/lib/useForm";

/** Hover-only controls on a pointer screen, always shown on touch screens. */
const REVEAL = "transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100";

export default function SetupPage() {
  const years = useApi<Page<AcademicYear>>("academic-years/");
  const classes = useApi<Page<SchoolClass>>("classes/");
  const subjects = useApi<Page<Subject>>("subjects/");
  const sections = useApi<Page<Section>>("sections/");
  const teachers = useApi<Page<Teacher>>("teachers/?status=active");
  const [wizard, setWizard] = useState<"class" | "subject" | "quick" | null>(null);
  const [assignVersion, setAssignVersion] = useState(0);
  const year = rows(years.data).find((y) => y.is_current) ?? null;
  const reload = () => { classes.reload(); subjects.reload(); sections.reload(); setAssignVersion((v) => v + 1); };
  const data = {
    year,
    classes: rows(classes.data),
    subjects: rows(subjects.data),
    sections: rows(sections.data),
    teachers: rows(teachers.data),
    reload,
  };

  return (
    <>
      <PageHeader
        title="Classes & subjects"
        subtitle="Hover a card to edit or delete it."
        actions={<>
          <Button onClick={() => setWizard("class")} disabled={!year}><Layers aria-hidden /> Add class</Button>
          <Button variant="secondary" onClick={() => setWizard("subject")}><BookMarked aria-hidden /> Add subject</Button>
        </>}
      />
      <YearBar years={rows(years.data)} reload={() => { years.reload(); sections.reload(); }} />
      <div className="mt-5 space-y-5">
        <ClassCarousel {...data} onQuick={() => setWizard("quick")} />
        <SubjectStrip subjects={data.subjects} reload={reload} />
        <AssignmentsCard key={assignVersion} sections={data.sections} subjects={data.subjects} teachers={data.teachers} />
      </div>
      {wizard === "class" && <NewClassWizard open onClose={() => setWizard(null)} data={data} />}
      <NewSubjectWizard open={wizard === "subject"} onClose={() => setWizard(null)} data={data} />
      {wizard === "quick" && <QuickSetup open onClose={() => setWizard(null)} year={year} classes={data.classes} sections={data.sections} reload={reload} />}
    </>
  );
}

function formatDate(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

/** The school's years as pills. The current one is highlighted; tap any to edit. */
function YearBar({ years, reload }: { years: AcademicYear[]; reload: () => void }) {
  const [editing, setEditing] = useState<AcademicYear | "new" | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-3">
      <span className="flex items-center gap-2 px-1 text-sm font-semibold text-soft"><CalendarRange className="size-4" aria-hidden /> Academic year</span>
      {years.length === 0 && <span className="text-sm text-soft">Add this year to begin.</span>}
      {years.map((y) => (
        <button
          key={y.id}
          onClick={() => setEditing(y)}
          title="Edit year"
          className={cx(
            "group flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition hover:-translate-y-0.5 hover:shadow-md",
            y.is_current ? "border-brand bg-brand-soft font-semibold text-brand" : "border-line text-soft hover:border-brand hover:text-ink",
          )}
        >
          {y.is_current && <span className="size-2 rounded-full bg-current" aria-hidden />}
          {y.name}
          <span className="hidden text-xs font-normal opacity-70 sm:inline">{formatDate(y.start_date)} to {formatDate(y.end_date)}</span>
          <Pencil className={cx("size-3.5", REVEAL)} aria-hidden />
        </button>
      ))}
      <button onClick={() => setEditing("new")} className="flex items-center gap-1 rounded-full border border-dashed border-line px-3 py-1.5 text-sm text-soft transition hover:border-brand hover:text-brand">
        <Plus className="size-4" aria-hidden /> Year
      </button>
      {editing && <YearModal year={editing === "new" ? null : editing} first={years.length === 0} onClose={() => setEditing(null)} reload={reload} />}
    </div>
  );
}

function YearModal({ year, first, onClose, reload }: { year: AcademicYear | null; first: boolean; onClose: () => void; reload: () => void }) {
  const toast = useToast();
  const [values, setValues] = useState({ name: year?.name ?? "", start_date: year?.start_date ?? "", end_date: year?.end_date ?? "" });
  const [current, setCurrent] = useState(year ? year.is_current : first);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => setValues({ ...values, [k]: e.target.value });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = { ...values, ...(current && !year?.is_current ? { is_current: true } : {}) };
      if (year) await api(`academic-years/${year.id}/`, { method: "PATCH", body });
      else await api("academic-years/", { method: "POST", body: { ...values, is_current: current } });
      toast.success(`${values.name} saved.`);
      reload();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the year.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={year ? "Edit year" : "New academic year"} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="year-form" busy={busy}>Save</Button></>}>
      <form id="year-form" onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" placeholder="2026-27" required value={values.name} onChange={set("name")} className="sm:col-span-2" />
        <Field label="Starts" type="date" required value={values.start_date} onChange={set("start_date")} />
        <Field label="Ends" type="date" required value={values.end_date} onChange={set("end_date")} />
        {!year?.is_current && <Checkbox label="This is the current year" checked={current} onChange={(e) => setCurrent(e.target.checked)} className="sm:col-span-2" />}
        {error && <div className="sm:col-span-2"><Alert>{error}</Alert></div>}
      </form>
    </Modal>
  );
}

/** Classes in order as a sliding row of cards, each with its sections. */
function ClassCarousel({ year, classes, sections, teachers, reload, onQuick }: {
  year: AcademicYear | null; classes: SchoolClass[]; sections: Section[]; teachers: Teacher[]; reload: () => void; onQuick: () => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [section, setSection] = useState<Section | null>(null);
  const toast = useToast();
  const dialog = useDialog();
  const ordered = [...classes].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, undefined, { numeric: true }));
  const slide = (dir: number) => track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.8, behavior: "smooth" });

  const rename = async (c: SchoolClass) => {
    const v = await dialog.prompt({
      title: `Edit ${c.name}`,
      fields: [
        { name: "name", label: "Class name", initial: c.name, required: true },
        { name: "order", label: "Position", type: "number", min: "0", initial: String(c.order), hint: "Grade 1 is 1, Grade 12 is 12." },
      ],
      confirmLabel: "Save",
    });
    if (!v) return;
    try {
      await api(`classes/${c.id}/`, { method: "PATCH", body: { name: v.name, order: Number(v.order || c.order) } });
      toast.success(`${v.name} saved.`);
      reload();
    } catch (e) {
      toast.error(e);
    }
  };

  const remove = async (c: SchoolClass, own: Section[]) => {
    const ok = await dialog.confirm({
      title: `Delete ${c.name}?`,
      body: own.length ? `Its ${own.length === 1 ? "section" : `${own.length} sections`} will be deleted too.` : undefined,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`classes/${c.id}/`, { method: "DELETE" });
      toast.success(`${c.name} deleted.`);
      reload();
    } catch (e) {
      toast.error(e);
    }
  };

  const addSection = async (c: SchoolClass, own: Section[]) => {
    if (!year) return;
    const next = String.fromCharCode(65 + own.length);
    const v = await dialog.prompt({
      title: `New section in ${c.name}`,
      fields: [{ name: "name", label: "Section", initial: next, required: true }],
      confirmLabel: "Add",
    });
    if (!v) return;
    try {
      await api("sections/", { method: "POST", body: { school_class: c.id, academic_year: year.id, name: v.name.trim().toUpperCase() } });
      toast.success(`${c.name} ${v.name.toUpperCase()} added.`);
      reload();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Card
      title="Classes"
      icon={<Layers aria-hidden />}
      actions={ordered.length > 3 && <div className="flex gap-1">
        <IconButton label="Previous classes" onClick={() => slide(-1)}><ChevronLeft aria-hidden /></IconButton>
        <IconButton label="More classes" onClick={() => slide(1)}><ChevronRight aria-hidden /></IconButton>
      </div>}
    >
      {!year ? <Empty icon={<CalendarRange aria-hidden />}>Add the academic year above first.</Empty>
        : ordered.length === 0 ? (
          <Empty title="No classes yet" icon={<Layers aria-hidden />} action={<Button onClick={onQuick}><Sparkles aria-hidden /> Set up Grade 1 to 12</Button>}>
            Create all your classes and sections in one go.
          </Empty>
        ) : (
          <div ref={track} className="scrollbar-none -mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-1 pb-3 pt-1">
            {ordered.map((c, i) => {
              const own = sections.filter((s) => s.school_class === c.id);
              const students = own.reduce((n, s) => n + (s.student_count ?? 0), 0);
              return (
                <article
                  key={c.id}
                  className="group relative flex w-60 shrink-0 snap-start flex-col rounded-2xl border border-line bg-surface p-4 transition duration-200 hover:-translate-y-1 hover:border-brand hover:shadow-lg"
                >
                  <div className={cx("absolute right-2 top-2 flex", REVEAL)}>
                    <IconButton label={`Edit ${c.name}`} className="size-8" onClick={() => rename(c)}><Pencil aria-hidden /></IconButton>
                    <IconButton label={`Delete ${c.name}`} className="size-8 hover:text-red-600" onClick={() => remove(c, own)}><Trash2 aria-hidden /></IconButton>
                  </div>
                  <span
                    className="mb-3 flex size-11 items-center justify-center rounded-xl text-lg font-bold text-white"
                    style={{ background: `hsl(${(i * 29 + 210) % 360} 65% 52%)` }}
                    aria-hidden
                  >
                    {c.name.match(/\d+/)?.[0] ?? c.name.slice(0, 2)}
                  </span>
                  <h3 className="truncate pr-12 font-semibold text-ink">{c.name}</h3>
                  <p className="mb-3 text-xs text-soft">{students} {students === 1 ? "student" : "students"}</p>
                  <div className="mt-auto flex flex-wrap gap-1.5">
                    {own.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setSection(s)}
                        title={s.class_teacher_name ? `Class teacher: ${s.class_teacher_name}` : "No class teacher yet"}
                        className={cx(
                          "min-w-9 rounded-lg border px-2.5 py-1 text-sm font-semibold transition hover:border-brand hover:text-brand",
                          s.class_teacher ? "border-line text-ink" : "border-dashed border-amber-400 text-ink",
                        )}
                      >
                        {s.display_name.replace(/\s+/g, "")}
                      </button>
                    ))}
                    <button onClick={() => addSection(c, own)} className="rounded-lg border border-dashed border-line px-2 py-1 text-soft transition hover:border-brand hover:text-brand" aria-label={`Add a section to ${c.name}`} title="Add section">
                      <Plus className="size-4" aria-hidden />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      {section && <SectionModal section={section} teachers={teachers} onClose={() => setSection(null)} reload={reload} />}
    </Card>
  );
}

function SectionModal({ section, teachers, onClose, reload }: { section: Section; teachers: Teacher[]; onClose: () => void; reload: () => void }) {
  const toast = useToast();
  const dialog = useDialog();
  const [teacher, setTeacher] = useState(section.class_teacher ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api(`sections/${section.id}/`, { method: "PATCH", body: { class_teacher: teacher || null } });
      toast.success(`${section.display_name} saved.`);
      reload();
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await dialog.confirm({ title: `Delete ${section.display_name}?`, confirmLabel: "Delete", danger: true });
    if (!ok) return;
    try {
      await api(`sections/${section.id}/`, { method: "DELETE" });
      toast.success(`${section.display_name} deleted.`);
      reload();
      onClose();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Modal open onClose={onClose} title={section.display_name} description={`${section.student_count ?? 0} students`} size="sm"
      footer={<>
        <Button variant="danger" onClick={remove} className="mr-auto"><Trash2 aria-hidden /> Delete</Button>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={save} busy={busy}>Save</Button>
      </>}>
      <Select label="Class teacher" value={teacher} onChange={(e) => setTeacher(e.target.value)}>
        <option value="">None</option>
        {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </Select>
    </Modal>
  );
}

/** One list of subjects for the whole school. */
function SubjectStrip({ subjects, reload }: { subjects: Subject[]; reload: () => void }) {
  const toast = useToast();
  const dialog = useDialog();

  const edit = async (s: Subject) => {
    const v = await dialog.prompt({
      title: `Edit ${s.name}`,
      fields: [
        { name: "name", label: "Subject", initial: s.name, required: true },
        { name: "code", label: "Code", initial: s.code ?? "" },
      ],
      confirmLabel: "Save",
    });
    if (!v) return;
    try {
      await api(`subjects/${s.id}/`, { method: "PATCH", body: { name: v.name, code: v.code } });
      toast.success(`${v.name} saved.`);
      reload();
    } catch (e) {
      toast.error(e);
    }
  };

  const remove = async (s: Subject) => {
    const ok = await dialog.confirm({ title: `Delete ${s.name}?`, body: "It is also taken off every section that studies it.", confirmLabel: "Delete", danger: true });
    if (!ok) return;
    try {
      await api(`subjects/${s.id}/`, { method: "DELETE" });
      toast.success(`${s.name} deleted.`);
      reload();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Card title="Subjects" icon={<BookMarked aria-hidden />}>
      {subjects.length === 0 ? <Empty icon={<BookMarked aria-hidden />}>No subjects yet. Use Add subject above.</Empty> : (
        <div className="flex flex-wrap gap-2">
          {subjects.map((s) => (
            <span key={s.id} className="group flex items-center rounded-full border border-line bg-surface pl-3.5 pr-1 text-sm transition hover:-translate-y-0.5 hover:border-brand hover:shadow-md">
              <button onClick={() => edit(s)} className="py-1.5 font-medium text-ink" title="Edit subject">
                {s.name}{s.code && <span className="ml-1.5 text-xs text-soft">{s.code}</span>}
              </button>
              <button onClick={() => remove(s)} aria-label={`Delete ${s.name}`} title="Delete" className={cx("ml-1 rounded-full p-1 text-soft hover:bg-muted hover:text-red-600", REVEAL)}>
                <X className="size-3.5" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

/** Creates Grade 1 to 12 (or any range) and their sections in one go. */
function QuickSetup({ open, onClose, year, classes, sections, reload }: {
  open: boolean; onClose: () => void; year: AcademicYear | null; classes: SchoolClass[]; sections: Section[]; reload: () => void;
}) {
  const toast = useToast();
  const [v, setV] = useState({ prefix: nextClass(classes).prefix, from: "1", to: "12", letters: "A, B, C" });
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState("");
  const from = Number(v.from), to = Number(v.to);
  const letters = [...new Set(v.letters.split(/[\s,]+/).map((l) => l.trim().toUpperCase()).filter(Boolean))];
  const total = to >= from ? to - from + 1 : 0;
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });

  const run = async () => {
    if (!year || !total) return;
    setError("");
    setDone(0);
    try {
      for (let n = from; n <= to; n++) {
        const name = `${v.prefix.trim()} ${n}`.trim();
        let c = classes.find((x) => x.name.toLowerCase() === name.toLowerCase());
        if (!c) c = await api<SchoolClass>("classes/", { method: "POST", body: { name, order: n } });
        for (const letter of letters) {
          if (sections.some((s) => s.school_class === c.id && s.name.toUpperCase() === letter)) continue;
          await api("sections/", { method: "POST", body: { school_class: c.id, academic_year: year.id, name: letter } });
        }
        setDone(n - from + 1);
      }
      toast.success(`${total} classes are ready.`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. What was made so far is kept.");
    } finally {
      setDone(null);
      reload();
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Set up classes" size="sm"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={run} busy={done !== null} disabled={!total || !year}>
          {done !== null ? `${done} of ${total}` : `Create ${total} classes`}
        </Button>
      </>}>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Name" value={v.prefix} onChange={set("prefix")} />
        <Field label="From" type="number" min={0} value={v.from} onChange={set("from")} />
        <Field label="To" type="number" min={0} value={v.to} onChange={set("to")} />
        <Field label="Sections in each" value={v.letters} onChange={set("letters")} placeholder="A, B, C" className="col-span-3" />
      </div>
      {total > 0 && (
        <p className="mt-3 text-sm text-soft">
          {v.prefix} {from}{total > 1 && ` to ${v.prefix} ${to}`}{letters.length > 0 && `, each with ${letters.join(", ")}`}. Ones you already have are skipped.
        </p>
      )}
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
    </Modal>
  );
}

function AssignmentsCard({ sections, subjects, teachers }: { sections: Section[]; subjects: Subject[]; teachers: Teacher[] }) {
  const [sectionId, setSectionId] = useState("");
  const current = sectionId || sections[0]?.id || "";
  const assignments = useApi<Page<SectionSubject>>(current ? `section-subjects/?section=${current}` : null);
  const [adding, setAdding] = useState({ subject: "", teacher: "" });
  const [busy, setBusy] = useState(false);
  const list = rows(assignments.data);
  const toast = useToast();
  const missing = subjects.filter((s) => !list.some((r) => r.subject === s.id));

  const changeTeacher = async (row: SectionSubject, teacher: string) => {
    try {
      await api(`section-subjects/${row.id}/`, { method: "PATCH", body: { teacher: teacher || null } });
      toast.success(`Teacher saved for ${row.subject_name}.`);
    } catch (e) {
      toast.error(e);
    }
    assignments.reload();
  };

  const remove = async (row: SectionSubject) => {
    try {
      await api(`section-subjects/${row.id}/`, { method: "DELETE" });
      toast.success(`${row.subject_name} removed.`);
    } catch (e) {
      toast.error(e);
    }
    assignments.reload();
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("section-subjects/", { method: "POST", body: compact({ ...adding, section: current }) });
      setAdding({ subject: "", teacher: "" });
      assignments.reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const teacherSelect = (value: string, onChange: (v: string) => void, label: string) => (
    <select className="select-chevron min-h-10 w-full cursor-pointer appearance-none rounded-xl border border-line bg-surface py-1.5 pl-3 pr-9 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-[var(--ring)]" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      <option value="">Not assigned</option>
      {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
    </select>
  );

  return (
    <div id="assign" className="scroll-mt-20"><Card title="Who teaches what" icon={<UserCheck aria-hidden />}>
      <span id="sections" className="block scroll-mt-20" />
      {sections.length === 0 ? <Empty icon={<UserCheck aria-hidden />}>Add a class with sections first.</Empty> : (
        <>
          <div className="scrollbar-none -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Section">
            {sections.map((s) => (
              <button key={s.id} role="tab" aria-selected={s.id === current} onClick={() => setSectionId(s.id)}
                className={cx("shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition", s.id === current ? "bg-brand text-white" : "bg-muted text-soft hover:text-ink")}>
                {s.display_name}
              </button>
            ))}
          </div>
          {list.length > 0 && (
            <DataTable
              rows={list}
              rowKey={(r) => r.id}
              columns={[
                { header: "Subject", cell: (r) => <span className="font-medium">{r.subject_name}</span> },
                { header: "Teacher", cell: (r) => teacherSelect(r.teacher ?? "", (t) => changeTeacher(r, t), `Teacher for ${r.subject_name}`) },
                { header: "", cell: (r) => <IconButton label={`Remove ${r.subject_name}`} className="size-8 hover:text-red-600" onClick={() => remove(r)}><X aria-hidden /></IconButton> },
              ]}
            />
          )}
          {missing.length > 0 && (
            <form onSubmit={add} className="mt-3 flex flex-wrap items-center gap-2">
              <select className="select-chevron min-h-10 cursor-pointer appearance-none rounded-xl border border-line bg-surface py-1.5 pl-3 pr-9 text-sm outline-none transition focus:border-brand" value={adding.subject} onChange={(e) => setAdding({ ...adding, subject: e.target.value })} required aria-label="Subject to add">
                <option value="">Add a subject…</option>
                {missing.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <div className="min-w-44">{teacherSelect(adding.teacher, (t) => setAdding({ ...adding, teacher: t }), "Teacher for the new subject")}</div>
              <Button type="submit" size="sm" variant="soft" busy={busy} disabled={!adding.subject}><Plus aria-hidden /> Add</Button>
            </form>
          )}
        </>
      )}
    </Card></div>
  );
}
