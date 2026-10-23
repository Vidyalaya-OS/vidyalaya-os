"use client";

import { CirclePlus, Lightbulb, Trash2 } from "lucide-react";
import { useState } from "react";
import { ChildSwitcher } from "@/components/Dashboards";
import { QuizList } from "@/components/QuizList";
import { useStaffSections } from "@/components/sections";
import { useToast } from "@/components/toast";
import { Alert, Button, Card, Empty, Field, PageHeader, Select, Tabs, TextArea, cx } from "@/components/ui";
import { useChildren } from "@/lib/children";
import { api, ApiError, Page } from "@/lib/api";
import { toLocalInput, todayIso } from "@/lib/format";
import { useSession } from "@/lib/session";
import { BankQuestion, Teacher } from "@/lib/types";
import { rows, useApi } from "@/lib/useApi";

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
  const me = useApi<Page<Teacher>>("teachers/");
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const subject = pair.split("|")[1] ?? "";

  const update = (key: number, change: Partial<Draft>) => setItems((list) => list.map((d) => (d.key === key ? { ...d, ...change } : d)));
  const remove = (key: number) => setItems((list) => list.filter((d) => d.key !== key));
  const total = items.reduce((sum, d) => sum + (Number(d.marks) || 0), 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const [section, subjectId] = pair.split("|");
    const blankAnswer = items.findIndex((d) => !d.bank && d.type === "mcq" && !d.options[d.correct].trim());
    if (blankAnswer >= 0) {
      setError(`Question ${blankAnswer + 1}: the choice ticked as right is empty.`);
      return;
    }
    const questions = items.map((d) =>
      d.bank
        ? { question: d.bank.id, marks: Number(d.marks) || 1 }
        : { type: d.type, text: d.text, options: d.type === "mcq" ? d.options.filter((o) => o.trim()) : undefined, correct_option: d.type === "mcq" ? d.options.slice(0, d.correct).filter((o) => o.trim()).length : d.correct, marks: Number(d.marks) || 1 },
    );
    setBusy(true);
    setError(null);
    try {
      await api("quizzes/", {
        method: "POST",
        body: {
          section, subject: subjectId, title, topic, taught_on: taughtOn, questions,
          ...(opensAt ? { opens_at: new Date(opensAt).toISOString() } : {}),
          closes_at: new Date(closesAt).toISOString(),
        },
      });
      setTitle(""); setTopic(""); setItems([blank("mcq")]); setOpensAt(""); setClosesAt(defaultClose()); setOpen(false);
      toast.success("Quiz saved. Students can take it from their home screen once it opens.");
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the quiz.");
    } finally {
      setBusy(false);
    }
  };

  if (pairs.length === 0) return <Alert tone="info">You are not assigned to teach any subject yet, so you can&apos;t set quizzes.</Alert>;
  if (!open) {
    return (
      <div>
        <Button onClick={() => setOpen(true)}><CirclePlus aria-hidden /> New quiz</Button>
      </div>
    );
  }
  return (
    <Card title="New quiz" icon={<CirclePlus aria-hidden />} className="animate-enter" actions={<Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>}>
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Class and subject" required value={pair} onChange={(e) => setPair(e.target.value)}>
            <option value="">Choose…</option>
            {pairs.map((p) => <option key={`${p.section}|${p.subject}`} value={`${p.section}|${p.subject}`}>{p.section_name} · {p.subject_name}</option>)}
          </Select>
          <Field label="Topic taught" placeholder="For example: Adding fractions" value={topic} onChange={(e) => setTopic(e.target.value)} />
          <Field label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="For example: Fractions quick check" />
          <Field label="Taught on" type="date" required value={taughtOn} onChange={(e) => setTaughtOn(e.target.value)} />
          <Field label="Opens" type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} hint="Leave empty to open it now." />
          <Field label="Closes" type="datetime-local" required value={closesAt} onChange={(e) => setClosesAt(e.target.value)} hint="Students see the right answers after this." />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium">Questions ({items.length})</span>
            <span className="text-soft">Total {total} mark{total === 1 ? "" : "s"}</span>
          </div>
          <ol className="space-y-3">
            {items.map((d, i) => (
              <li key={d.key} className="animate-enter rounded-xl border border-line bg-muted/30 p-3.5">
                <div className="mb-2 flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium">Q{i + 1} · {d.bank ? "From your bank" : d.type === "mcq" ? "Multiple choice" : "True or false"}</span>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1 text-xs text-soft">Marks
                      <input type="number" min={1} max={100} value={d.marks} onChange={(e) => update(d.key, { marks: e.target.value })} className="h-9 w-16 rounded-lg border border-line bg-surface px-2 text-ink" />
                    </label>
                    {items.length > 1 && <button type="button" className="rounded-lg p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950" onClick={() => remove(d.key)} aria-label={`Remove question ${i + 1}`}><Trash2 className="size-4" aria-hidden /></button>}
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
              </li>
            ))}
          </ol>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => setItems((l) => [...l, blank("mcq")])}>+ Multiple choice</Button>
            <Button type="button" variant="secondary" onClick={() => setItems((l) => [...l, blank("true_false")])}>+ True or false</Button>
            <Button type="button" variant="ghost" disabled={!subject} onClick={() => setShowBank(!showBank)} title={subject ? undefined : "Choose the class and subject first"}>
              {showBank ? "Hide your question bank" : "Reuse from your question bank"}
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
        <Button type="submit" busy={busy}>Save quiz</Button>
      </form>
    </Card>
  );
}

function QuestionEditor({ draft, onChange }: { draft: Draft; onChange: (c: Partial<Draft>) => void }) {
  return (
    <div className="space-y-2">
      <TextArea label="Question" required value={draft.text} onChange={(e) => onChange({ text: e.target.value })} rows={2} />
      <fieldset>
        <legend className="mb-1 text-xs text-soft">Choices: tick the right one</legend>
        <div className="space-y-2">
          {draft.options.map((o, i) => (
            <label key={i} className={cx("flex items-center gap-2.5 rounded-xl border bg-surface px-3 py-1.5 transition", draft.correct === i ? "border-green-500 ring-2 ring-green-500/20" : "border-line")}>
              <input type="radio" name={`correct-${draft.key}`} checked={draft.correct === i} onChange={() => onChange({ correct: i })} aria-label={`Choice ${i + 1} is right`} />
              {draft.type === "mcq" ? (
                <input
                  className="min-h-9 w-full bg-transparent text-base outline-none sm:text-sm"
                  placeholder={`Choice ${i + 1}${i >= 2 ? " (optional)" : ""}`}
                  required={i < 2}
                  value={o}
                  onChange={(e) => onChange({ options: draft.options.map((x, j) => (j === i ? e.target.value : x)) })}
                />
              ) : (
                <span className="text-sm">{o}</span>
              )}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function QuestionBank({ subject, chosen, onPick }: { subject: string; chosen: Set<string>; onPick: (q: BankQuestion) => void }) {
  const [search, setSearch] = useState("");
  const bank = useApi<Page<BankQuestion>>(`question-bank/?subject=${subject}${search ? `&search=${encodeURIComponent(search)}` : ""}`);
  const list = rows(bank.data);
  return (
    <div className="mt-3 animate-enter rounded-xl border border-line p-3">
      <Field label="Search your questions" value={search} onChange={(e) => setSearch(e.target.value)} />
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
