"use client";

import Link from "next/link";
import { Lightbulb } from "lucide-react";
import { Badge, Empty, ErrorState, Loading, Progress } from "@/components/ui";
import { Page } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { Quiz, QuizState } from "@/lib/types";
import { rows, useApi } from "@/lib/useApi";

export function QuizStateBadge({ state, taken }: { state: QuizState; taken?: boolean }) {
  if (taken) return <Badge tone="good">Done</Badge>;
  if (state === "open") return <Badge tone="warn">Open</Badge>;
  if (state === "upcoming") return <Badge>Opens later</Badge>;
  return <Badge>Closed</Badge>;
}

export function scoreText(score: number, max: number) {
  return `${score} / ${max}`;
}

/** Quizzes as cards. For a student or a parent's child, shows their score;
 * for staff, how many have taken it. */
export function QuizList({ query, student, empty = "No quizzes here." }: { query: string; student?: string; empty?: string }) {
  const list = useApi<Page<Quiz>>(`quizzes/?${query}`);
  if (list.error && !list.data) return <ErrorState message={list.error} onRetry={list.reload} />;
  if (!list.data) return <Loading />;
  const items = rows(list.data);
  if (items.length === 0) return <Empty icon={<Lightbulb aria-hidden />}>{empty}</Empty>;
  return (
    <ul className="stagger space-y-3">
      {items.map((q) => {
        const a = q.my_attempt;
        const href = `/app/quizzes/${q.id}${student ? `?student=${student}` : ""}`;
        return (
          <li key={q.id}>
            <Link href={href} className="block rounded-xl border border-line bg-surface p-4 text-sm transition duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-[var(--shadow-lift)] active:translate-y-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold">{q.title}</div>
                  <div className="text-xs text-soft">
                    {q.subject_name}{q.topic_name ? ` · ${q.topic_name}` : ""} · {q.section_name} · {q.question_count} question{q.question_count === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {a && <span className="font-semibold tabular-nums">{scoreText(a.score, a.max_score)}</span>}
                  <QuizStateBadge state={q.state} taken={Boolean(a)} />
                </div>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-soft">
                {q.state === "upcoming" && <span>Opens {formatDateTime(q.opens_at)}</span>}
                {q.state !== "closed" && <span>Closes {formatDateTime(q.closes_at)}</span>}
                {q.state === "closed" && <span>Closed {formatDateTime(q.closes_at)}</span>}
                {q.attempt_count != null && <span>{q.attempt_count} of {q.student_count} taken</span>}
                {!a && q.state === "closed" && q.attempt_count == null && <span>Not taken</span>}
              </div>
              {q.attempt_count != null && q.student_count ? <Progress value={(q.attempt_count / q.student_count) * 100} className="mt-2.5 h-1.5" label="Students who took it" /> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
