import { Lightbulb } from "lucide-react-native";
import { View } from "react-native";
import type { Page } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import type { Quiz, QuizState } from "@/lib/types";
import { rows, useApi } from "@/lib/useApi";
import { Badge, Empty, ErrorState, Loading, Press, Progress, Row, Stagger, Txt, go } from "./ui";

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
  const { c, card } = useTheme();
  const list = useApi<Page<Quiz>>(`quizzes/?${query}`);
  if (list.error && !list.data) return <ErrorState message={list.error} onRetry={list.reload} />;
  if (!list.data) return <Loading />;
  const items = rows(list.data);
  if (items.length === 0) return <Empty icon={Lightbulb}>{empty}</Empty>;
  return (
    <Stagger gap={10}>
      {items.map((q) => {
        const a = q.my_attempt;
        return (
          <Press key={q.id} onPress={() => go(`/app/quizzes/${q.id}${student ? `?student=${student}` : ""}`)} scale={0.98}
            style={[{ borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, padding: 14 }, card]}>
            <Row justify="space-between" align="flex-start" gap={8} wrap>
              <View style={{ flex: 1, minWidth: 160 }}>
                <Txt weight="semibold">{q.title}</Txt>
                <Txt size="xs" soft>{q.subject_name}{q.topic_name ? ` · ${q.topic_name}` : ""} · {q.section_name} · {q.question_count} question{q.question_count === 1 ? "" : "s"}</Txt>
              </View>
              <Row gap={8}>
                {a && <Txt weight="semibold" tabular>{scoreText(a.score, a.max_score)}</Txt>}
                <QuizStateBadge state={q.state} taken={Boolean(a)} />
              </Row>
            </Row>
            <Row wrap gap={12} style={{ marginTop: 4 }}>
              {q.state === "upcoming" && <Txt size="xs" soft>Opens {formatDateTime(q.opens_at)}</Txt>}
              {q.state !== "closed" && <Txt size="xs" soft>Closes {formatDateTime(q.closes_at)}</Txt>}
              {q.state === "closed" && <Txt size="xs" soft>Closed {formatDateTime(q.closes_at)}</Txt>}
              {q.attempt_count != null && <Txt size="xs" soft>{q.attempt_count} of {q.student_count} taken</Txt>}
              {!a && q.state === "closed" && q.attempt_count == null && <Txt size="xs" soft>Not taken</Txt>}
            </Row>
            {q.attempt_count != null && q.student_count ? <Progress value={(q.attempt_count / q.student_count) * 100} height={6} style={{ marginTop: 10 }} /> : null}
          </Press>
        );
      })}
    </Stagger>
  );
}
