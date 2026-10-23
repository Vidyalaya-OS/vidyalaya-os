"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
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

function TakeQuiz({ paper, onDone }: { paper: QuizPaper; onDone: () => void }) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [startedAt] = useState(() => new Date().toISOString());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useDialog();
  const toast = useToast();
  const left = paper.questions.length - Object.keys(answers).length;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (left > 0 && !(await dialog.confirm({ title: "Hand in now?", body: `${left} question${left === 1 ? " is" : "s are"} not answered yet. You can only hand in once.`, confirmLabel: "Hand in anyway", cancelLabel: "Keep answering" }))) return;
    setBusy(true);
    setError(null);
    try {
      await api(`quizzes/${paper.quiz.id}/submit/`, { method: "POST", body: { answers, started_at: startedAt } });
      toast.success("Handed in. Well done!");
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not hand in. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Alert tone="info">Answer every question, then press Hand in. You can hand in once. Closes {formatDateTime(paper.quiz.closes_at)}.</Alert>
      {paper.questions.map((q, i) => (
        <Card key={q.id} className="animate-enter">
          <fieldset>
            <legend className="mb-3 flex w-full justify-between gap-3 text-sm">
              <span className="font-medium">{i + 1}. {q.text}</span>
              <span className="shrink-0 text-xs text-soft">{q.marks} mark{q.marks === 1 ? "" : "s"}</span>
            </legend>
            <div className="space-y-2">
              {q.options.map((o, j) => (
                <label key={j} className={cx("flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition duration-150 active:scale-[0.99]", answers[q.id] === j ? "border-brand bg-brand-soft font-medium shadow-sm" : "border-line hover:border-brand/40 hover:bg-muted/60")}>
                  <input type="radio" className="size-4 accent-[var(--brand)]" name={q.id} checked={answers[q.id] === j} onChange={() => setAnswers((a) => ({ ...a, [q.id]: j }))} />
                  {o}
                </label>
              ))}
            </div>
          </fieldset>
        </Card>
      ))}
      {error && <Alert>{error}</Alert>}
      <StickyBar>
        <div className="min-w-40 flex-1">
          <div className="mb-1 text-xs text-soft">{paper.questions.length - left} of {paper.questions.length} answered</div>
          <Progress value={paper.questions.length ? ((paper.questions.length - left) / paper.questions.length) * 100 : 0} label="Questions answered" />
        </div>
        <Button type="submit" busy={busy}>Hand in</Button>
      </StickyBar>
    </form>
  );
}

function Review({ paper }: { paper: QuizPaper }) {
  const { attempt } = paper;
  return (
    <div className="space-y-4">
      {attempt ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Score" value={scoreText(attempt.score, attempt.max_score)} tone={attempt.score * 2 >= attempt.max_score ? "good" : "warn"} />
          <Stat label="Handed in" value={formatDateTime(attempt.submitted_at)} />
        </div>
      ) : paper.state === "closed" ? (
        <Alert tone="info">This quiz closed without being taken.</Alert>
      ) : null}
      {!paper.answers_shown && attempt && (
        <Alert tone="info">Handed in. The right answers show here after the quiz closes on {formatDateTime(paper.quiz.closes_at)}.</Alert>
      )}
      {paper.answers_shown && paper.questions.map((q, i) => (
        <Card key={q.id}>
          <div className="mb-2 flex justify-between gap-3 text-sm">
            <span className="font-medium">{i + 1}. {q.text}</span>
            {q.is_correct != null && <Badge tone={q.is_correct ? "good" : "bad"}>{q.is_correct ? "Right" : q.your_answer == null ? "Not answered" : "Wrong"}</Badge>}
          </div>
          <ul className="space-y-1 text-sm">
            {q.options.map((o, j) => (
              <li key={j} className={cx("rounded-xl border px-3 py-2", j === q.correct_option ? "border-green-500 bg-green-50 dark:bg-green-950" : j === q.your_answer ? "border-red-400 bg-red-50 dark:bg-red-950" : "border-line")}>
                {o}
                {j === q.correct_option && <span className="ml-2 text-xs text-green-700 dark:text-green-300">right answer</span>}
                {j === q.your_answer && j !== q.correct_option && <span className="ml-2 text-xs text-red-700 dark:text-red-300">chosen</span>}
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
