"use client";

import { ArrowRight, Check, Clock, GraduationCap, Layers, Plus, Wallet, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Modal } from "@/components/dialog";
import { useToast } from "@/components/toast";
import { Alert, Button, Checkbox, Field, cx } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { AcademicYear, SchoolClass, Section, Subject, Teacher } from "@/lib/types";

type Data = {
  year: AcademicYear | null;
  classes: SchoolClass[];
  subjects: Subject[];
  sections: Section[];
  teachers: Teacher[];
  reload: () => void;
};

function message(e: unknown) {
  return e instanceof ApiError ? e.message : "Could not reach the server. Check your connection and try again.";
}

/** The next class to add, following the school's naming: Grade 1, Grade 2…
 * It fills a gap first, so a deleted Grade 3 is offered again. */
export function nextClass(classes: SchoolClass[]) {
  const named = classes.map((c) => c.name.match(/^(.*?)\s*(\d+)$/)).filter((m): m is RegExpMatchArray => !!m);
  const prefix = named[0]?.[1].trim() || "Grade";
  const taken = new Set(named.filter((m) => m[1].trim() === prefix).map((m) => Number(m[2])));
  let n = 1;
  while (taken.has(n)) n++;
  return { name: `${prefix} ${n}`, order: n, prefix };
}

const DEFAULT_SECTIONS = ["A", "B", "C"].map((name) => ({ name, teacher: "" }));

/** Numbered steps across the top of a wizard. */
function Stepper({ steps, at }: { steps: string[]; at: number }) {
  return (
    <ol className="mb-5 flex items-center gap-1.5" aria-label="Steps">
      {steps.map((s, i) => (
        <li key={s} className="flex min-w-0 flex-1 items-center gap-1.5" aria-current={i === at ? "step" : undefined}>
          <span className={cx(
            "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition",
            i < at ? "bg-green-600 text-white" : i === at ? "pulse-ring bg-brand text-white dark:text-slate-950" : "bg-muted text-soft",
          )}>
            {i < at ? <Check className="size-3.5" aria-hidden /> : i + 1}
          </span>
          <span className={cx("hidden truncate text-xs font-medium sm:block", i === at ? "text-ink" : "text-soft")}>{s}</span>
          {i < steps.length - 1 && <span className={cx("h-px min-w-3 flex-1", i < at ? "bg-green-600" : "bg-line")} aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

/** A short "good to know" box inside a wizard step. */
function Guideline({ children }: { children: React.ReactNode }) {
  return <div className="mb-4 rounded-xl border border-brand/20 bg-brand-soft/60 px-3.5 py-2.5 text-sm text-ink">{children}</div>;
}

function TeacherSelect({ value, onChange, teachers, label }: { value: string; onChange: (v: string) => void; teachers: Teacher[]; label: string }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="select-chevron min-h-10 w-full cursor-pointer appearance-none rounded-xl border border-line bg-surface py-1.5 pl-3 pr-9 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-[var(--ring)]"
    >
      <option value="">Not allocated yet</option>
      {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
    </select>
  );
}

function NextLinks({ links }: { links: { href: string; label: string; hint: string; icon: React.ReactNode }[] }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-3">
      {links.map((l) => (
        <li key={l.href}>
          <Link href={l.href} className="group flex h-full flex-col gap-2 rounded-xl border border-line p-3 transition hover:-translate-y-px hover:border-brand/40 hover:bg-brand-soft/30">
            <span className="flex size-8 items-center justify-center rounded-lg bg-brand-soft text-brand [&_svg]:size-4">{l.icon}</span>
            <span className="text-sm font-semibold">{l.label}</span>
            <span className="text-xs text-soft">{l.hint}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------- new class */

const CLASS_STEPS = ["Name", "Sections", "Subjects", "Teachers", "Done"];

/** Walks an admin through a new class: name it, add its sections with a
 * class teacher, choose its subjects and allocate a teacher to each. Each
 * step saves before moving on, so a mistake shows where it was made. */
export function NewClassWizard({ open, onClose, data }: { open: boolean; onClose: () => void; data: Data }) {
  const [at, setAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suggested = nextClass(data.classes);
  const [name, setName] = useState(suggested.name);
  const [order, setOrder] = useState(String(suggested.order));
  const [created, setCreated] = useState<SchoolClass | null>(null);
  const [sectionRows, setSectionRows] = useState<{ name: string; teacher: string }[]>(DEFAULT_SECTIONS);
  const [madeSections, setMadeSections] = useState<Section[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [allocation, setAllocation] = useState<Record<string, string>>({});
  const toast = useToast();

  const reset = () => {
    setAt(0); setError(null); setCreated(null);
    setSectionRows(DEFAULT_SECTIONS); setMadeSections([]); setChosen([]); setAllocation({});
  };
  const close = () => {
    if (created) data.reload();
    reset();
    onClose();
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const saveName = () => run(async () => {
    const c = await api<SchoolClass>("classes/", { method: "POST", body: { name: name.trim(), order: Number(order || data.classes.length + 1) } });
    setCreated(c);
    setAt(1);
  });
  const saveSections = () => run(async () => {
    if (!data.year || !created) return;
    const made: Section[] = [...madeSections];
    for (const row of sectionRows.filter((r) => r.name.trim())) {
      if (made.some((m) => m.name === row.name.trim())) continue;
      made.push(await api<Section>("sections/", {
        method: "POST",
        body: { school_class: created.id, academic_year: data.year.id, name: row.name.trim(), ...(row.teacher ? { class_teacher: row.teacher } : {}) },
      }));
      setMadeSections([...made]);
    }
    if (made.length === 0) throw new ApiError(400, "Add at least one section, such as A.");
    setAt(2);
  });
  const saveTeachers = () => run(async () => {
    for (const section of madeSections) {
      for (const subject of chosen) {
        await api("section-subjects/", { method: "POST", body: { section: section.id, subject, ...(allocation[subject] ? { teacher: allocation[subject] } : {}) } });
      }
    }
    toast.success(`${created?.name} is set up with ${madeSections.length} section${madeSections.length === 1 ? "" : "s"} and ${chosen.length} subject${chosen.length === 1 ? "" : "s"}.`);
    setAt(4);
  });

  const subjectName = (id: string) => data.subjects.find((s) => s.id === id)?.name ?? "";

  return (
    <Modal open={open} onClose={close} size="lg" title="Onboard a new class" description="Five short steps. Each one is saved as you go.">
      <Stepper steps={CLASS_STEPS} at={at} />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      {at === 0 && (
        <form onSubmit={(e) => { e.preventDefault(); saveName(); }} className="space-y-4">
          <p className="text-sm text-soft">We picked the next class for you. Change it if needed.</p>
          {!data.year && <Alert tone="warn" title="Set the academic year first">Sections belong to a year. Add the current year in Step 1 on this page, then come back.</Alert>}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Class name" placeholder="Grade 6" required value={name} onChange={(e) => setName(e.target.value)} className="sm:col-span-2" autoFocus />
            <Field label="Order" type="number" min={0} placeholder={String(data.classes.length + 1)} value={order} onChange={(e) => setOrder(e.target.value)} />
          </div>
          <div className="flex justify-end"><Button type="submit" busy={busy} disabled={!name.trim() || !data.year}>Create class <ArrowRight aria-hidden /></Button></div>
        </form>
      )}

      {at === 1 && (
        <div className="space-y-4">
          <Guideline>
            <p className="font-semibold">Sections hold the students</p>
            <p className="text-soft">Add one section per classroom: A, B, C. The class teacher takes the daily roll call, so choose one now if you can. You can change it later.</p>
          </Guideline>
          <ul className="space-y-2">
            {sectionRows.map((row, i) => {
              const saved = madeSections.some((m) => m.name === row.name.trim());
              return (
                <li key={i} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2">
                  <input aria-label="Section name" value={row.name} disabled={saved} onChange={(e) => setSectionRows((r) => r.map((x, j) => (j === i ? { ...x, name: e.target.value.toUpperCase() } : x)))}
                    className="min-h-10 rounded-xl border border-line bg-surface px-3 text-sm font-semibold outline-none focus:border-brand focus:ring-4 focus:ring-[var(--ring)] disabled:opacity-60" placeholder="A" />
                  <TeacherSelect label={`Class teacher for ${created?.name}-${row.name}`} teachers={data.teachers} value={row.teacher} onChange={(v) => setSectionRows((r) => r.map((x, j) => (j === i ? { ...x, teacher: v } : x)))} />
                  {saved ? <span className="flex size-10 items-center justify-center text-green-600"><Check className="size-4" aria-label="Saved" /></span> : (
                    <button type="button" aria-label="Remove section" className="flex size-10 items-center justify-center rounded-xl text-soft hover:bg-muted hover:text-ink" onClick={() => setSectionRows((r) => r.filter((_, j) => j !== i))}><X className="size-4" /></button>
                  )}
                </li>
              );
            })}
          </ul>
          <Button variant="ghost" size="sm" onClick={() => setSectionRows((r) => [...r, { name: String.fromCharCode(65 + r.length), teacher: "" }])}><Plus aria-hidden /> Another section</Button>
          {data.teachers.length === 0 && <p className="text-xs text-soft">No teachers yet. Leave class teacher empty and set it after adding teachers.</p>}
          <div className="flex justify-end"><Button onClick={saveSections} busy={busy}>Save sections <ArrowRight aria-hidden /></Button></div>
        </div>
      )}

      {at === 2 && (
        <div className="space-y-4">
          <Guideline>
            <p className="font-semibold">Which subjects does {created?.name} study?</p>
            <p className="text-soft">Every section of the class gets these subjects. Only subjects on a section can go on its timetable, tests and report card.</p>
          </Guideline>
          {data.subjects.length === 0 ? (
            <Alert tone="warn" title="No subjects yet">Add subjects with the New subject guide (or Step 4 on this page), then give them to this class from Who teaches what.</Alert>
          ) : (
            <div className="grid gap-x-4 sm:grid-cols-2">
              {data.subjects.map((s) => (
                <Checkbox key={s.id} label={<>{s.name}{s.code && <span className="text-soft"> ({s.code})</span>}</>} checked={chosen.includes(s.id)}
                  onChange={(e) => setChosen((c) => (e.target.checked ? [...c, s.id] : c.filter((x) => x !== s.id)))} />
              ))}
            </div>
          )}
          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="ghost" onClick={() => setChosen(chosen.length === data.subjects.length ? [] : data.subjects.map((s) => s.id))} disabled={data.subjects.length === 0}>
              {chosen.length === data.subjects.length && chosen.length > 0 ? "Clear all" : "Select all"}
            </Button>
            <Button onClick={() => setAt(chosen.length ? 3 : 4)}>{chosen.length ? <>Next: teachers <ArrowRight aria-hidden /></> : "Skip for now"}</Button>
          </div>
        </div>
      )}

      {at === 3 && (
        <div className="space-y-4">
          <Guideline>
            <p className="font-semibold">Allocate a teacher to each subject</p>
            <p className="text-soft">The teacher you choose teaches it in every section of {created?.name}, marks those students&apos; attendance and enters their marks. You can change any section later in Who teaches what.</p>
          </Guideline>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {chosen.map((id) => (
              <li key={id} className="grid items-center gap-2 px-3 py-2.5 sm:grid-cols-[1fr_16rem]">
                <span className="text-sm font-medium">{subjectName(id)}</span>
                <TeacherSelect label={`Teacher for ${subjectName(id)}`} teachers={data.teachers} value={allocation[id] ?? ""} onChange={(v) => setAllocation((a) => ({ ...a, [id]: v }))} />
              </li>
            ))}
          </ul>
          <div className="flex justify-between gap-2">
            <Button variant="ghost" onClick={() => setAt(2)}>Back</Button>
            <Button onClick={saveTeachers} busy={busy}>Save subjects and teachers <ArrowRight aria-hidden /></Button>
          </div>
        </div>
      )}

      {at === 4 && (
        <div className="space-y-4">
          <Alert tone="success" title={`${created?.name} is ready`}>
            {madeSections.map((s) => s.display_name).join(", ")} {madeSections.length === 1 ? "has" : "have"} been created{chosen.length ? ` with ${chosen.length} subject${chosen.length === 1 ? "" : "s"}` : ""}.
            {chosen.some((id) => !allocation[id]) && " Some subjects still need a teacher; allocate them in Who teaches what."}
          </Alert>
          <p className="text-sm font-semibold">What to do next</p>
          <NextLinks links={[
            { href: "/app/timetable", label: "Build its timetable", hint: "Put its subjects into periods.", icon: <Clock aria-hidden /> },
            { href: "/app/students", label: "Enroll students", hint: "Add them to the new sections.", icon: <GraduationCap aria-hidden /> },
            { href: "/app/fees", label: "Set its fees", hint: "What this class pays this year.", icon: <Wallet aria-hidden /> },
          ]} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { data.reload(); reset(); }}>Onboard another class</Button>
            <Button onClick={close}>Done</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ----------------------------------------------------------- new subject */

const SUBJECT_STEPS = ["Name", "Sections", "Teachers", "Done"];

/** Walks an admin through a new subject: name it, choose the sections that
 * study it, and allocate a teacher in each. */
export function NewSubjectWizard({ open, onClose, data }: { open: boolean; onClose: () => void; data: Data }) {
  const [at, setAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [created, setCreated] = useState<Subject | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [allocation, setAllocation] = useState<Record<string, string>>({});
  const [everywhere, setEverywhere] = useState("");
  const toast = useToast();

  const reset = () => {
    setAt(0); setError(null); setName(""); setCode(""); setCreated(null); setChosen([]); setAllocation({}); setEverywhere("");
  };
  const close = () => {
    if (created) data.reload();
    reset();
    onClose();
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const saveName = () => run(async () => {
    setCreated(await api<Subject>("subjects/", { method: "POST", body: { name: name.trim(), ...(code.trim() ? { code: code.trim().toUpperCase() } : {}) } }));
    setAt(1);
  });
  const saveTeachers = () => run(async () => {
    if (!created) return;
    for (const section of chosen) {
      const teacher = allocation[section] || everywhere;
      await api("section-subjects/", { method: "POST", body: { section, subject: created.id, ...(teacher ? { teacher } : {}) } });
    }
    toast.success(`${created.name} added to ${chosen.length} section${chosen.length === 1 ? "" : "s"}.`);
    setAt(3);
  });

  const byClass = new Map<string, Section[]>();
  for (const s of data.sections) byClass.set(s.class_name, [...(byClass.get(s.class_name) ?? []), s]);
  const sectionName = (id: string) => data.sections.find((s) => s.id === id)?.display_name ?? "";

  return (
    <Modal open={open} onClose={close} size="lg" title="Onboard a new subject" description="Four short steps. Each one is saved as you go.">
      <Stepper steps={SUBJECT_STEPS} at={at} />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      {at === 0 && (
        <form onSubmit={(e) => { e.preventDefault(); saveName(); }} className="space-y-4">
          <Guideline>
            <p className="font-semibold">Guidelines for adding a subject</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-soft">
              <li>Add each subject once for the whole school. Maths is one subject, even if every class studies it.</li>
              <li>Use the name that goes on report cards, such as <b className="text-ink">Social Studies</b>.</li>
              <li>A short code (SST, MATH) keeps timetables and mark sheets tidy. It is optional.</li>
            </ul>
          </Guideline>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Subject" placeholder="Computer Science" required value={name} onChange={(e) => setName(e.target.value)} className="sm:col-span-2" autoFocus />
            <Field label="Code" placeholder="CS" value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <div className="flex justify-end"><Button type="submit" busy={busy} disabled={!name.trim()}>Create subject <ArrowRight aria-hidden /></Button></div>
        </form>
      )}

      {at === 1 && (
        <div className="space-y-4">
          <Guideline>
            <p className="font-semibold">Which sections study {created?.name}?</p>
            <p className="text-soft">Tick whole classes or single sections. Only these sections will see it on their timetable, tests and report cards.</p>
          </Guideline>
          {data.sections.length === 0 ? (
            <Alert tone="warn" title="No sections yet">Create a class and its sections first (use the New class guide). The subject is saved; you can give it to sections later.</Alert>
          ) : (
            <div className="space-y-3">
              {[...byClass].map(([cls, list]) => {
                const all = list.every((s) => chosen.includes(s.id));
                return (
                  <div key={cls} className="rounded-xl border border-line p-3">
                    <Checkbox label={<span className="font-semibold">{cls} <span className="font-normal text-soft">· all sections</span></span>} checked={all}
                      onChange={(e) => setChosen((c) => (e.target.checked ? [...new Set([...c, ...list.map((s) => s.id)])] : c.filter((x) => !list.some((s) => s.id === x))))} />
                    <div className="flex flex-wrap gap-x-4 pl-7">
                      {list.map((s) => (
                        <Checkbox key={s.id} label={s.display_name} checked={chosen.includes(s.id)}
                          onChange={(e) => setChosen((c) => (e.target.checked ? [...c, s.id] : c.filter((x) => x !== s.id)))} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex justify-end"><Button onClick={() => setAt(chosen.length ? 2 : 3)}>{chosen.length ? <>Next: teachers <ArrowRight aria-hidden /></> : "Skip for now"}</Button></div>
        </div>
      )}

      {at === 2 && (
        <div className="space-y-4">
          <Guideline>
            <p className="font-semibold">Allocate a teacher in each section</p>
            <p className="text-soft">Pick one teacher for all of them, or a different teacher per section. That teacher marks the section&apos;s attendance and enters its {created?.name} marks.</p>
          </Guideline>
          <div className="max-w-sm">
            <p className="mb-1.5 text-sm font-medium">Same teacher everywhere</p>
            <TeacherSelect label="Teacher for every section" teachers={data.teachers} value={everywhere} onChange={setEverywhere} />
          </div>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {chosen.map((id) => (
              <li key={id} className="grid items-center gap-2 px-3 py-2.5 sm:grid-cols-[1fr_16rem]">
                <span className="text-sm font-medium">{sectionName(id)}</span>
                <TeacherSelect label={`Teacher for ${sectionName(id)}`} teachers={data.teachers} value={allocation[id] ?? everywhere} onChange={(v) => setAllocation((a) => ({ ...a, [id]: v }))} />
              </li>
            ))}
          </ul>
          <div className="flex justify-between gap-2">
            <Button variant="ghost" onClick={() => setAt(1)}>Back</Button>
            <Button onClick={saveTeachers} busy={busy}>Save <ArrowRight aria-hidden /></Button>
          </div>
        </div>
      )}

      {at === 3 && (
        <div className="space-y-4">
          <Alert tone="success" title={`${created?.name} is ready`}>
            {chosen.length ? `It is now taught in ${chosen.map(sectionName).join(", ")}.` : "It is on the school's subject list. Give it to sections from Who teaches what."}
          </Alert>
          <p className="text-sm font-semibold">What to do next</p>
          <NextLinks links={[
            { href: "/app/timetable", label: "Add it to the timetable", hint: "Give it periods in each section.", icon: <Clock aria-hidden /> },
            { href: "/app/exams", label: "Plan its tests", hint: "Add tests for the term.", icon: <Layers aria-hidden /> },
            { href: "/app/setup#assign", label: "Review who teaches what", hint: "Check every section has a teacher.", icon: <GraduationCap aria-hidden /> },
          ]} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { data.reload(); reset(); }}>Onboard another subject</Button>
            <Button onClick={close}>Done</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
