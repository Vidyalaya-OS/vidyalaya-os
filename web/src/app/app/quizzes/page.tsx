"use client";

import { ArrowDown, ArrowUp, Check, CirclePlus, Copy, Library, Lightbulb, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { ChildSwitcher } from "@/components/Dashboards";
import { QuizList } from "@/components/QuizList";
import { useStaffSections } from "@/components/sections";
import { useToast } from "@/components/toast";
import { Alert, Button, Card, Empty, Field, IconButton, PageHeader, Select, StickyBar, Tabs, TextArea, cx } from "@/components/ui";
import { useChildren } from "@/lib/children";
import { api, ApiError, Page } from "@/lib/api";
import { toLocalInput, todayIso } from "@/lib/format";
import { useSession } from "@/lib/session";
import { BankQuestion, Teacher } from "@/lib/types";
import { rows, useApi, useDebounced } from "@/lib/useApi";

export default function QuizzesPage() {
  const { hasRole } = useSession();
  return (
    <>
      <PageHeader
        title="Quizzes"
        subtitle={hasRole("teacher") ? "Set a short quiz on what you taught today, and see who got what wrong." : "Short quizzes on the day's lesson, to take at home."}
      />
      <div className="space-y-5">
        {hasRole("teacher") && <TeacherQuizzes />}
        {hasRole("student") && <StudentQuizzes />}
        {hasRole("parent") && <ParentQuizzes />}
        {hasRole("admin") && !hasRole("teacher") && <AdminQuizzes />}
      </div>
    </>
  );
}

function StudentQuizzes() {
  const [tab, setTab] = useState<"pending" | "upcoming" | "closed">("pending");
  return (
    <Card title="Your quizzes" icon={<Lightbulb aria-hidden />}>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "pending", label: "To take" }, { key: "upcoming", label: "Coming up" }, { key: "closed", label: "Finished" }]} />
      <QuizList
        key={tab}
        query={`state=${tab}`}
        empty={tab === "pending" ? "Nothing to take right now. Well done!" : tab === "upcoming" ? "No quizzes coming up." : "No finished quizzes yet."}
      />
    </Card>
  );
}

function ParentQuizzes() {
  const { list, chosen, choose, loading } = useChildren();
  if (loading) return null;
  if (!chosen) return <Empty title="No children linked yet">Ask the school office to link your child to your account.</Empty>;
  return (
    <>
      <ChildSwitcher items={list.map((c) => ({ id: c.id, name: c.name, detail: c.current_enrollment?.section_name }))} value={chosen.id} onChange={choose} />
      <Card title={`${chosen.name}'s quizzes`} icon={<Lightbulb aria-hidden />} description="Scores show as soon as a quiz is handed in.">
        <QuizList key={chosen.id} query={`student=${chosen.id}`} student={chosen.id} empty="No quizzes yet." />
      </Card>
    </>
  );
}

function AdminQuizzes() {
  const sections = useStaffSections();
  const [section, setSection] = useState("");
  return (
    <Card title="All quizzes" icon={<Lightbulb aria-hidden />} actions={
      <Select label="Section" value={section} onChange={(e) => setSection(e.target.value)}>
        <option value="">All sections</option>
        {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </Select>
    }>
      <QuizList key={section} query={section ? `section=${section}` : ""} />
    </Card>
  );
}

function TeacherQuizzes() {
  const me = useApi<Page<Teacher>>("teachers/?mine=true");
  const pairs = rows(me.data)[0]?.teaches ?? [];
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState<"open" | "upcoming" | "closed">("open");
  return (
    <>
      <NewQuiz pairs={pairs} onCreated={() => setVersion((v) => v + 1)} />
      <Card title="Your quizzes" icon={<Lightbulb aria-hidden />}>
        <Tabs value={tab} onChange={setTab} tabs={[{ key: "open", label: "Open" }, { key: "upcoming", label: "Coming up" }, { key: "closed", label: "Closed" }]} />
        <QuizList key={`${tab}-${version}`} query={`mine=true&state=${tab}`} />
      </Card>
    </>
  );
}

type Draft = { key: number; type: "mcq" | "true_false"; text: string; options: string[]; correct: number; marks: string; bank?: BankQuestion };

let nextKey = 1;
const blank = (type: Draft["type"]): Draft => ({ key: nextKey++, type, text: "", options: type === "mcq" ? ["", "", "", ""] : ["True", "False"], correct: 0, marks: "1" });

function defaultClose() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(20, 0, 0, 0);
  return toLocalInput(d);
}

const LETTERS = ["A", "B", "C", "D", "E", "F"];

/** What is wrong with one question, or null. Checked before saving so the
 * teacher sees the problem beside the question, not as one long message. */
function draftProblem(d: Draft): string | null {
  const marks = Number(d.marks);
  if (!Number.isInteger(marks) || marks < 1 || marks > 100) return "Marks must be a whole number from 1 to 100.";
  if (d.bank) return null;
  if (!d.text.trim()) return "Write the question.";
  if (d.type === "mcq") {
    const filled = d.options.filter((o) => o.trim());
    if (filled.length < 2) return "Give at least two choices.";
    if (!d.options[d.correct].trim()) return "The choice ticked as right is empty.";
    if (new Set(filled.map((o) => o.trim().toLowerCase())).size !== filled.length) return "Two choices are the same.";
  }
  return null;
}

/** Checks on the quiz as a whole: what to call it, and when it is open. */
function quizProblems(f: { pair: string; title: string; taughtOn: string; opensAt: string; closesAt: string }) {
  const out: Record<string, string> = {};
  if (!f.pair) out.pair = "Choose the class and subject.";
  if (!f.title.trim()) out.title = "Give the quiz a title.";
  if (!f.taughtOn) out.taughtOn = "Choose the day you taught it.";
  if (!f.closesAt) out.closesAt = "Choose when it closes.";
  else {
    const closes = new Date(f.closesAt).getTime();
    if (closes <= Date.now()) out.closesAt = "The closing time must be in the future.";
    else if (f.opensAt && closes <= new Date(f.opensAt).getTime()) out.closesAt = "It must close after it opens.";
  }
  return out;
}

function NewQuiz({ pairs, onCreated }: { pairs: Teacher["teaches"]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [pair, setPair] = useState("");
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [taughtOn, setTaughtOn] = useState(todayIso());
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState(defaultClose);
  const [items, setItems] = useState<Draft[]>([blank("mcq")]);
  const [showBank, setShowBank] = useState(false);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const subject = pair.split("|")[1] ?? "";

  const update = (key: number, change: Partial<Draft>) => setItems((list) => list.map((d) => (d.key === key ? { ...d, ...change } : d)));
  const remove = (key: number) => setItems((list) => list.filter((d) => d.key !== key));
  const move = (i: number, by: number) => setItems((list) => {
    const next = [...list];
    const [d] = next.splice(i, 1);
    next.splice(i + by, 0, d);
    return next;
  });
  const duplicate = (i: number) => setItems((list) => [...list.slice(0, i + 1), { ...list[i], key: nextKey++, options: [...list[i].options] }, ...list.slice(i + 1)]);
  const total = items.reduce((sum, d) => sum + (Number(d.marks) || 0), 0);

  // Problems only show once the teacher has tried to save.
  const fieldErrors = checked ? quizProblems({ pair, title, taughtOn, opensAt, closesAt }) : {};
  const itemErrors = checked ? items.map(draftProblem) : items.map(() => null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setChecked(true);
    const problems = quizProblems({ pair, title, taughtOn, opensAt, closesAt });
    const bad = items.findIndex((d) => draftProblem(d));
    if (Object.keys(problems).length || bad >= 0) {
      setError(bad >= 0 && !Object.keys(problems).length ? `Question ${bad + 1} needs another look.` : "Some details need another look. They are highlighted.");
      document.getElementById(Object.keys(problems).length ? "new-quiz" : `q-${items[bad].key}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    const [section, subjectId] = pair.split("|");
    const questions = items.map((d) =>
      d.bank
        ? { question: d.bank.id, marks: Number(d.marks) || 1 }
        : { type: d.type, text: d.text.trim(), options: d.type === "mcq" ? d.options.map((o) => o.trim()).filter(Boolean) : undefined, correct_option: d.type === "mcq" ? d.options.slice(0, d.correct).filter((o) => o.trim()).length : d.correct, marks: Number(d.marks) || 1 },
    );
    setBusy(true);
    setError(null);
    try {
      await api("quizzes/", {
        method: "POST",
        body: {
          section, subject: subjectId, title: title.trim(), topic: topic.trim(), taught_on: taughtOn, questions,
          ...(opensAt ? { opens_at: new Date(opensAt).toISOString() } : {}),
          closes_at: new Date(closesAt).toISOString(),
        },
      });
      setTitle(""); setTopic(""); setItems([blank("mcq")]); setOpensAt(""); setClosesAt(defaultClose()); setOpen(false); setChecked(false);
      toast.success("Quiz saved. Students can take it from their home screen once it opens.");
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the quiz. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (pairs.length === 0) return <Alert tone="info">You are not assigned to teach any subject yet, so you can&apos;t set quizzes.</Alert>;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="group flex w-full items-center gap-4 rounded-2xl border-2 border-dashed border-line bg-surface p-5 text-left transition hover:border-brand/50 hover:bg-brand-soft/30">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-violet-500 text-white shadow-lg shadow-brand/30 transition group-hover:scale-105"><CirclePlus className="size-6" aria-hidden /></span>
        <span>
          <span className="block font-semibold">New quiz</span>
          <span className="block text-sm text-soft">A short check on today&apos;s lesson. It marks itself and shows you who got what wrong.</span>
        </span>
      </button>
    );
  }
  return (
    <Card title="New quiz" icon={<CirclePlus aria-hidden />} className="animate-enter" actions={<Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>}>
      <form id="new-quiz" onSubmit={submit} noValidate className="space-y-5">
        {error && <Alert>{error}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Class and subject" value={pair} error={fieldErrors.pair} onChange={(e) => setPair(e.target.value)}>
            <option value="">Choose…</option>
            {pairs.map((p) => <option key={`${p.section}|${p.subject}`} value={`${p.section}|${p.subject}`}>{p.section_name} · {p.subject_name}</option>)}
          </Select>
          <Field label="Topic taught (optional)" placeholder="For example: Adding fractions" maxLength={200} value={topic} onChange={(e) => setTopic(e.target.value)} />
          <Field label="Title" maxLength={200} value={title} error={fieldErrors.title} onChange={(e) => setTitle(e.target.value)} placeholder="For example: Fractions quick check" />
          <Field label="Taught on" type="date" max={todayIso()} value={taughtOn} error={fieldErrors.taughtOn} onChange={(e) => setTaughtOn(e.target.value)} />
          <Field label="Opens (optional)" type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} hint="Leave empty to open it now." />
          <Field label="Closes" type="datetime-local" min={opensAt || undefined} value={closesAt} error={fieldErrors.closesAt} onChange={(e) => setClosesAt(e.target.value)} hint="Students see the right answers after this." />
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="font-semibold">Questions</span>
            <span className="text-soft">Tick the right answer for each one</span>
          </div>
          <ol className="space-y-3">
            {items.map((d, i) => (
              <li key={d.key} id={`q-${d.key}`} className={cx("animate-enter rounded-2xl border bg-muted/30 p-4 transition", itemErrors[i] ? "border-red-400 dark:border-red-700" : "border-line")}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2 font-semibold">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-brand text-xs text-white dark:text-slate-950">{i + 1}</span>
                    {d.bank ? "From your bank" : d.type === "mcq" ? "Multiple choice" : "True or false"}
                  </span>
                  <div className="flex items-center gap-1">
                    <label className="mr-2 flex items-center gap-1.5 text-xs text-soft">Marks
                      <input type="number" inputMode="numeric" min={1} max={100} value={d.marks} onChange={(e) => update(d.key, { marks: e.target.value })} className="h-9 w-16 rounded-lg border border-line bg-surface px-2 text-ink outline-none focus:border-brand focus:ring-4 focus:ring-[var(--ring)]" />
                    </label>
                    <IconButton label={`Move question ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)} className="size-8 disabled:opacity-30 [&_svg]:size-4"><ArrowUp aria-hidden /></IconButton>
                    <IconButton label={`Move question ${i + 1} down`} disabled={i === items.length - 1} onClick={() => move(i, 1)} className="size-8 disabled:opacity-30 [&_svg]:size-4"><ArrowDown aria-hidden /></IconButton>
                    {!d.bank && <IconButton label={`Copy question ${i + 1}`} onClick={() => duplicate(i)} className="size-8 [&_svg]:size-4"><Copy aria-hidden /></IconButton>}
                    {items.length > 1 && <IconButton label={`Remove question ${i + 1}`} onClick={() => remove(d.key)} className="size-8 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950 [&_svg]:size-4"><Trash2 aria-hidden /></IconButton>}
                  </div>
                </div>
                {d.bank ? (
                  <div className="text-sm">
                    <p>{d.bank.text}</p>
                    <p className="mt-1 text-xs text-soft">Answer: {d.bank.options[d.bank.correct_option]}</p>
                  </div>
                ) : (
                  <QuestionEditor draft={d} onChange={(c) => update(d.key, c)} />
                )}
                {itemErrors[i] && <p className="mt-2 flex animate-fade items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400" role="alert">{itemErrors[i]}</p>}
              </li>
            ))}
          </ol>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setItems((l) => [...l, blank("mcq")])}><Plus aria-hidden /> Multiple choice</Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setItems((l) => [...l, blank("true_false")])}><Plus aria-hidden /> True or false</Button>
            <Button type="button" variant="ghost" size="sm" disabled={!subject} onClick={() => setShowBank(!showBank)} title={subject ? undefined : "Choose the class and subject first"}>
              <Library aria-hidden /> {showBank ? "Hide your question bank" : "Reuse from your question bank"}
            </Button>
          </div>
          {showBank && subject && (
            <QuestionBank
              subject={subject}
              chosen={new Set(items.filter((d) => d.bank).map((d) => d.bank!.id))}
              onPick={(q) => setItems((l) => [...l.filter((d) => d.bank || d.text.trim()), { ...blank(q.type), bank: q }])}
            />
          )}
        </div>
        <StickyBar className="justify-between">
          <span className="text-sm text-soft"><strong className="text-ink">{items.length}</strong> question{items.length === 1 ? "" : "s"} · <strong className="text-ink">{total}</strong> mark{total === 1 ? "" : "s"}</span>
          <Button type="submit" busy={busy}>Save quiz</Button>
        </StickyBar>
      </form>
    </Card>
  );
}

function QuestionEditor({ draft, onChange }: { draft: Draft; onChange: (c: Partial<Draft>) => void }) {
  return (
    <div className="space-y-3">
      <TextArea label="Question" value={draft.text} onChange={(e) => onChange({ text: e.target.value })} rows={2} placeholder="For example: What is 1/2 + 1/4?" />
      <fieldset>
        <legend className="mb-1.5 text-xs text-soft">Choices: tap the letter of the right one</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {draft.options.map((o, i) => {
            const right = draft.correct === i;
            return (
              <div key={i} className={cx("flex items-center gap-2.5 rounded-xl border bg-surface px-2 py-1 transition", right ? "border-green-500 ring-2 ring-green-500/20" : "border-line focus-within:border-brand")}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={right}
                  aria-label={`Choice ${LETTERS[i]} is right`}
                  onClick={() => onChange({ correct: i })}
                  className={cx("flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition", right ? "bg-green-600 text-white" : "bg-muted text-soft hover:text-ink")}
                >
                  {right ? <Check className="size-4" aria-hidden /> : LETTERS[i]}
                </button>
                {draft.type === "mcq" ? (
                  <input
                    className="min-h-9 w-full bg-transparent text-base outline-none sm:text-sm"
                    placeholder={`Choice ${LETTERS[i]}${i >= 2 ? " (optional)" : ""}`}
                    aria-label={`Choice ${LETTERS[i]}`}
                    maxLength={300}
                    value={o}
                    onChange={(e) => onChange({ options: draft.options.map((x, j) => (j === i ? e.target.value : x)) })}
                  />
                ) : (
                  <span className="text-sm">{o}</span>
                )}
              </div>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

function QuestionBank({ subject, chosen, onPick }: { subject: string; chosen: Set<string>; onPick: (q: BankQuestion) => void }) {
  const [search, setSearch] = useState("");
  const term = useDebounced(search);
  const bank = useApi<Page<BankQuestion>>(`question-bank/?subject=${subject}${term ? `&search=${encodeURIComponent(term)}` : ""}`);
  const list = rows(bank.data);
  return (
    <div className="mt-3 animate-enter rounded-xl border border-line p-3">
      <Field label="Search your questions" type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
      {bank.data && list.length === 0 && <p className="mt-2 text-sm text-soft">Questions you write for this subject are saved here to reuse.</p>}
      <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto">
        {list.map((q) => (
          <li key={q.id} className="flex items-start justify-between gap-3 rounded-xl border border-line p-3 text-sm">
            <div className="min-w-0">
              <div>{q.text}</div>
              <div className="text-xs text-soft">{q.topic_name ?? "No topic"} · answer: {q.options[q.correct_option]}</div>
            </div>
            <Button type="button" variant="secondary" disabled={chosen.has(q.id)} onClick={() => onPick(q)}>{chosen.has(q.id) ? "Added" : "Add"}</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
