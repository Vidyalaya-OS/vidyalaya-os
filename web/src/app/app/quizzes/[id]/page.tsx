"use client";

import { useParams, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, PartyPopper, Send, Timer } from "lucide-react";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Ring } from "@/components/charts";
import { QuizStateBadge, scoreText } from "@/components/QuizList";
import { useDialog } from "@/components/dialog";
import { useToast } from "@/components/toast";
import { Alert, Badge, Button, Card, DataTable, ErrorState, Loading, PageHeader, Progress, Stat, StickyBar, cx } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";
import { useSession } from "@/lib/session";
import { Quiz, QuizPaper, QuizResults } from "@/lib/types";
import { useApi } from "@/lib/useApi";

export default function QuizPage() {
  return (
    <Suspense fallback={<Loading />}>
      <QuizView />
    </Suspense>
  );
}

function QuizView() {
  const { id } = useParams<{ id: string }>();
  const student = useSearchParams().get("student");
  const { hasRole } = useSession();
  const staffView = hasRole("admin", "teacher") && !student;
  return (
    <>
      {staffView ? <Results id={id} /> : <Paper id={id} student={student} />}
    </>
  );
}

function Header({ quiz }: { quiz: Quiz }) {
  return (
    <PageHeader
      back={{ href: "/app/quizzes", label: "Quizzes" }}
      title={quiz.title}
      subtitle={`${quiz.subject_name}${quiz.topic_name ? ` · ${quiz.topic_name}` : ""} · ${quiz.section_name} · taught ${formatDate(quiz.taught_on)}${quiz.teacher_name ? ` · ${quiz.teacher_name}` : ""}`}
      actions={<QuizStateBadge state={quiz.state} />}
    />
  );
}

function Paper({ id, student }: { id: string; student: string | null }) {
  const { hasRole } = useSession();
  const paper = useApi<QuizPaper>(`quizzes/${id}/paper${student ? `?student=${student}` : ""}`);
  if (paper.error && !paper.data) return <ErrorState message={paper.error} onRetry={paper.reload} />;
  if (!paper.data) return <Loading rows={5} />;
  const p = paper.data;
  const canTake = hasRole("student") && !student && p.state === "open" && !p.attempt;
  return (
    <>
      <Header quiz={p.quiz} />
      {canTake ? <TakeQuiz paper={p} onDone={paper.reload} /> : <Review paper={p} />}
    </>
  );
}

const LETTERS = ["A", "B", "C", "D", "E", "F"];

/** Time left until a moment, like "2 h 5 min" or "45 s". */
function timeLeft(until: string, now: number) {
  const ms = new Date(until).getTime() - now;
  if (ms <= 0) return "closed";
  const m = Math.floor(ms / 60000);
  if (m >= 60 * 24) return `${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h`;
  if (m >= 60) return `${Math.floor(m / 60)} h ${m % 60} min`;
  if (m >= 1) return `${m} min`;
  return `${Math.floor(ms / 1000)} s`;
}

/** One question at a time, with a strip of numbered dots to jump around.
 * Answers are kept in this tab while the student works, so a refresh does
 * not lose them. Keys 1 to 4 (or A to D) choose, arrows move. */
function TakeQuiz({ paper, onDone }: { paper: QuizPaper; onDone: () => void }) {
  const draftKey = `vidyalaya.quiz.${paper.quiz.id}`;
  const [answers, setAnswers] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(window.sessionStorage.getItem(draftKey) ?? "{}");
    } catch {
      return {};
    }
  });
  const [startedAt] = useState(() => new Date().toISOString());
  const [index, setIndex] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useDialog();
  const toast = useToast();
  const qs = paper.questions;
  const q = qs[index];
  const answered = qs.filter((x) => answers[x.id] != null).length;
  const left = qs.length - answered;

  useEffect(() => {
    try {
      window.sessionStorage.setItem(draftKey, JSON.stringify(answers));
    } catch {
      // Not kept across a refresh; nothing else changes.
    }
  }, [answers, draftKey]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const choose = useCallback((j: number) => setAnswers((a) => ({ ...a, [qs[index].id]: j })), [qs, index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
      const k = e.key.toUpperCase();
      const n = /^[1-6]$/.test(k) ? Number(k) - 1 : LETTERS.indexOf(k);
      if (n >= 0 && n < qs[index].options.length) choose(n);
      else if (e.key === "ArrowRight") setIndex((i) => Math.min(qs.length - 1, i + 1));
      else if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [choose, index, qs]);

  const handIn = async () => {
    if (left > 0 && !(await dialog.confirm({ title: "Hand in now?", body: `${left} question${left === 1 ? " is" : "s are"} not answered yet. You can only hand in once.`, confirmLabel: "Hand in anyway", cancelLabel: "Keep answering" }))) {
      const first = qs.findIndex((x) => answers[x.id] == null);
      if (first >= 0) setIndex(first);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`quizzes/${paper.quiz.id}/submit/`, { method: "POST", body: { answers, started_at: startedAt } });
      try {
        window.sessionStorage.removeItem(draftKey);
      } catch {
        // Nothing to clean up.
      }
      toast.success("Handed in. Well done!");
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not hand in. Your answers are kept; check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const closing = timeLeft(paper.quiz.closes_at, now);
  const soon = new Date(paper.quiz.closes_at).getTime() - now < 10 * 60 * 1000;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-3 shadow-[var(--shadow-card)]">
        <div className="scrollbar-none flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Questions">
          {qs.map((x, i) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Question ${i + 1}${answers[x.id] != null ? ", answered" : ""}`}
              onClick={() => setIndex(i)}
              className={cx(
                "flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-semibold transition duration-200",
                i === index ? "scale-110 bg-brand text-white shadow-md shadow-brand/30 dark:text-slate-950" : answers[x.id] != null ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" : "bg-muted text-soft hover:text-ink",
              )}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <span className={cx("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", soon ? "animate-pulse bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" : "bg-muted text-soft")}>
          <Timer className="size-3.5" aria-hidden /> Closes in {closing}
        </span>
      </div>

      <Card key={q.id} className="animate-rise">
        <fieldset>
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-soft">Question {index + 1} of {qs.length} · {q.marks} mark{q.marks === 1 ? "" : "s"}</legend>
          <p className="mb-5 text-lg font-semibold leading-snug sm:text-xl">{q.text}</p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {q.options.map((o, j) => {
              const on = answers[q.id] === j;
              return (
                <label key={j} className={cx("flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-2 px-3.5 py-3 text-base transition duration-150 active:scale-[0.99]", on ? "border-brand bg-brand-soft font-semibold shadow-[var(--shadow-lift)]" : "border-line hover:border-brand/40 hover:bg-muted/60")}>
                  <input type="radio" className="sr-only" name={q.id} checked={on} onChange={() => choose(j)} />
                  <span className={cx("flex size-8 shrink-0 items-center justify-center rounded-xl text-sm font-bold transition", on ? "bg-brand text-white dark:text-slate-950" : "bg-muted text-soft")}>{LETTERS[j]}</span>
                  {o}
                </label>
              );
            })}
          </div>
        </fieldset>
        <p className="mt-4 hidden text-xs text-soft sm:block">Tip: press {q.options.map((_, j) => LETTERS[j]).join(", ")} to choose, and the arrow keys to move.</p>
      </Card>

      {error && <Alert>{error}</Alert>}
      <StickyBar>
        <Button variant="secondary" disabled={index === 0} onClick={() => setIndex((i) => i - 1)} aria-label="Previous question"><ChevronLeft aria-hidden /></Button>
        <div className="min-w-32 flex-1">
          <div className="mb-1 text-xs text-soft">{answered} of {qs.length} answered</div>
          <Progress value={qs.length ? (answered / qs.length) * 100 : 0} label="Questions answered" />
        </div>
        {index < qs.length - 1 ? (
          <Button onClick={() => setIndex((i) => i + 1)}>Next <ChevronRight aria-hidden /></Button>
        ) : (
          <Button busy={busy} onClick={handIn}><Send aria-hidden /> Hand in</Button>
        )}
      </StickyBar>
    </div>
  );
}

function Review({ paper }: { paper: QuizPaper }) {
  const { attempt } = paper;
  const pctScore = attempt && attempt.max_score ? Math.round((attempt.score / attempt.max_score) * 100) : null;
  const praise = pctScore == null ? "" : pctScore >= 90 ? "Outstanding!" : pctScore >= 70 ? "Great work!" : pctScore >= 50 ? "Good effort." : "Keep practising: go over the answers below.";
  return (
    <div className="space-y-4">
      {attempt ? (
        <div className="relative flex animate-rise flex-wrap items-center gap-5 overflow-hidden rounded-3xl border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
          <Ring value={pctScore} size={112} label="score" tone={pctScore == null ? undefined : pctScore >= 70 ? "good" : pctScore >= 50 ? "warn" : "bad"} />
          <div className="min-w-0">
            <p className="text-2xl font-bold tracking-tight">{praise}</p>
            <p className="mt-1 text-soft">You scored <strong className="text-ink">{scoreText(attempt.score, attempt.max_score)}</strong>. Handed in {formatDateTime(attempt.submitted_at)}.</p>
          </div>
          {pctScore != null && pctScore >= 90 && <PartyPopper className="absolute right-5 top-5 size-8 animate-float text-amber-500" aria-hidden />}
        </div>
      ) : paper.state === "closed" ? (
        <Alert tone="info">This quiz closed without being taken.</Alert>
      ) : null}
      {!paper.answers_shown && attempt && (
        <Alert tone="info">Handed in. The right answers show here after the quiz closes on {formatDateTime(paper.quiz.closes_at)}.</Alert>
      )}
      {paper.answers_shown && paper.questions.map((q, i) => (
        <Card key={q.id}>
          <div className="mb-3 flex justify-between gap-3">
            <span className="font-semibold">{i + 1}. {q.text}</span>
            {q.is_correct != null && <Badge tone={q.is_correct ? "good" : "bad"}>{q.is_correct ? "Right" : q.your_answer == null ? "Not answered" : "Wrong"}</Badge>}
          </div>
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            {q.options.map((o, j) => (
              <li key={j} className={cx("flex items-center gap-2.5 rounded-xl border px-3 py-2", j === q.correct_option ? "border-green-500 bg-green-50 dark:bg-green-950" : j === q.your_answer ? "border-red-400 bg-red-50 dark:bg-red-950" : "border-line")}>
                <span className={cx("flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold", j === q.correct_option ? "bg-green-600 text-white" : j === q.your_answer ? "bg-red-500 text-white" : "bg-muted text-soft")}>{LETTERS[j]}</span>
                <span className="min-w-0 flex-1">{o}</span>
                {j === q.correct_option && <span className="text-xs text-green-700 dark:text-green-300">right answer</span>}
                {j === q.your_answer && j !== q.correct_option && <span className="text-xs text-red-700 dark:text-red-300">chosen</span>}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

function Results({ id }: { id: string }) {
  const { hasRole } = useSession();
  const results = useApi<QuizResults>(`quizzes/${id}/results`);
  const [busy, setBusy] = useState(false);
  const dialog = useDialog();
  const toast = useToast();
  if (results.error && !results.data) return <ErrorState message={results.error} onRetry={results.reload} />;
  if (!results.data) return <Loading variant="stats" />;
  const r = results.data;
  const missed = new Set(r.most_missed.slice(0, 3));

  const close = async () => {
    const ok = await dialog.confirm({ title: "Close this quiz now?", body: "Students who have not taken it can no longer take it, and everyone sees the right answers.", confirmLabel: "Close quiz", danger: true });
    if (!ok) return;
    setBusy(true);
    try {
      await api(`quizzes/${id}/close/`, { method: "POST" });
      toast.success("Quiz closed. Students can now see the right answers.");
      results.reload();
    } catch (err) {
      toast.error(err, "Could not close the quiz.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Header quiz={r.quiz} />
      <div className="stagger mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Taken" value={`${r.attempted} / ${r.students}`} progress={r.students ? (r.attempted / r.students) * 100 : 0} />
        <Stat label="Average" value={r.average_score == null ? "-" : `${r.average_score} / ${r.max_score}`} />
        <Stat label={r.quiz.state === "upcoming" ? "Opens" : "Closes"} value={formatDateTime(r.quiz.state === "upcoming" ? r.quiz.opens_at : r.quiz.closes_at)} />
        <Stat label="Questions" value={r.questions.length} />
      </div>
      {hasRole("teacher") && r.quiz.state === "open" && (
        <div className="mb-5"><Button variant="secondary" busy={busy} onClick={close}>Close now and show answers</Button></div>
      )}
      <div className="space-y-5">
        <Card title="Questions" actions={r.attempted > 0 && r.most_missed.length > 0 ? <span className="text-xs text-soft">Most missed are marked: go over them next class</span> : undefined}>
          <ol className="space-y-3">
            {r.questions.map((q, i) => (
              <li key={q.id} className={cx("rounded-xl border p-3.5 text-sm", missed.has(q.id) ? "border-red-300 dark:border-red-800" : "border-line")}>
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">{i + 1}. {q.text}</span>
                  <span className="flex items-center gap-2">
                    {missed.has(q.id) && <Badge tone="bad">Most missed</Badge>}
                    <span className="tabular-nums text-soft">{q.percent_correct == null ? "-" : `${q.percent_correct}% right`}</span>
                  </span>
                </div>
                <ul className="mt-2 space-y-1">
                  {q.options.map((o, j) => {
                    const share = r.attempted ? (q.choices[j] / r.attempted) * 100 : 0;
                    return (
                      <li key={j} className="relative overflow-hidden rounded-lg border border-line px-3 py-1.5">
                        <div className={cx("absolute inset-y-0 left-0 origin-left animate-grow", j === q.correct_option ? "bg-green-100 dark:bg-green-950" : "bg-muted")} style={{ width: `${share}%` }} />
                        <div className="relative flex justify-between gap-2">
                          <span>{o}{j === q.correct_option && <span className="ml-2 text-xs text-green-700 dark:text-green-300">right answer</span>}</span>
                          <span className="tabular-nums text-soft">{q.choices[j]}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ol>
        </Card>
        <Card title="Scores">
          <DataTable
            rows={r.scores}
            rowKey={(s) => s.student}
            columns={[
              { header: "Roll", cell: (s) => s.roll_no ?? "-" },
              { header: "Student", cell: (s) => s.name },
              { header: "Score", cell: (s) => (s.attempted ? <span className="font-medium tabular-nums">{scoreText(s.score!, s.max_score!)}</span> : <Badge>Not taken</Badge>), className: "text-right" },
              { header: "Handed in", cell: (s) => (s.submitted_at ? formatDateTime(s.submitted_at) : "-") },
            ]}
          />
        </Card>
      </div>
    </>
  );
}
