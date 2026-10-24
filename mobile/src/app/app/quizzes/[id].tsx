import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams } from "expo-router";
import { ChevronLeft, ChevronRight, PartyPopper, Send, Timer } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Animated, ScrollView, View } from "react-native";
import { Ring } from "@/components/charts";
import { useDialog } from "@/components/dialog";
import { QuizStateBadge, scoreText } from "@/components/QuizList";
import { useToast } from "@/components/toast";
import { Alert, Badge, Button, Card, DataTable, Enter, ErrorState, Grid, Loading, PageHeader, Press, Progress, Pulse, Row, Screen, Stack, Stat, StickyBar, Txt } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import type { Quiz, QuizPaper, QuizResults } from "@/lib/types";
import { useApi } from "@/lib/useApi";

export default function QuizPage() {
  const { id, student } = useLocalSearchParams<{ id: string; student?: string }>();
  const { hasRole } = useSession();
  const staffView = hasRole("admin", "teacher") && !student;
  return <Screen>{staffView ? <Results id={id} /> : <Paper id={id} student={student ?? null} />}</Screen>;
}

function Header({ quiz }: { quiz: Quiz }) {
  return (
    <PageHeader back="Quizzes" title={quiz.title}
      subtitle={`${quiz.subject_name}${quiz.topic_name ? ` · ${quiz.topic_name}` : ""} · ${quiz.section_name} · taught ${formatDate(quiz.taught_on)}${quiz.teacher_name ? ` · ${quiz.teacher_name}` : ""}`}
      actions={<QuizStateBadge state={quiz.state} />} />
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

function timeLeft(until: string, now: number) {
  const ms = new Date(until).getTime() - now;
  if (ms <= 0) return "closed";
  const m = Math.floor(ms / 60000);
  if (m >= 60 * 24) return `${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h`;
  if (m >= 60) return `${Math.floor(m / 60)} h ${m % 60} min`;
  if (m >= 1) return `${m} min`;
  return `${Math.floor(ms / 1000)} s`;
}

/** One question at a time, with numbered dots to jump around. Answers are
 * kept on the phone while the student works, so leaving does not lose them. */
function TakeQuiz({ paper, onDone }: { paper: QuizPaper; onDone: () => void }) {
  const { c, tone, card, lift } = useTheme();
  const draftKey = `vidyalaya.quiz.${paper.quiz.id}`;
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const loaded = useRef(false);
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
  const slide = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    AsyncStorage.getItem(draftKey).then((v) => { if (v) setAnswers(JSON.parse(v)); }).catch(() => {}).finally(() => { loaded.current = true; });
  }, [draftKey]);
  useEffect(() => {
    if (loaded.current) AsyncStorage.setItem(draftKey, JSON.stringify(answers)).catch(() => {});
  }, [answers, draftKey]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    slide.setValue(0);
    Animated.spring(slide, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 6 }).start();
  }, [index, slide]);

  const choose = (j: number) => {
    Haptics.selectionAsync().catch(() => {});
    setAnswers((a) => ({ ...a, [q.id]: j }));
  };

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
      AsyncStorage.removeItem(draftKey).catch(() => {});
      toast.success("Handed in. Well done!");
      onDone();
    } catch (err) {
      setError(errorMessage(err, "Could not hand in. Your answers are kept; check your connection and try again."));
    } finally {
      setBusy(false);
    }
  };

  const closing = timeLeft(paper.quiz.closes_at, now);
  const soon = new Date(paper.quiz.closes_at).getTime() - now < 10 * 60 * 1000;
  const timer = (
    <Row gap={6} style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, backgroundColor: soon ? tone.bad.bg : c.muted }}>
      <Timer size={14} color={soon ? tone.bad.fg : c.soft} />
      <Txt size="xs" weight="semibold" color={soon ? tone.bad.fg : c.soft}>Closes in {closing}</Txt>
    </Row>
  );

  return (
    <Stack gap={14}>
      <View style={[{ borderRadius: 18, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, padding: 10, gap: 10 }, card]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2, paddingHorizontal: 2 }}>
          {qs.map((x, i) => {
            const on = i === index;
            const done = answers[x.id] != null;
            return (
              <Press key={x.id} onPress={() => setIndex(i)} scale={0.9} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={`Question ${i + 1}${done ? ", answered" : ""}`}
                style={[{ width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: on ? c.brand : done ? tone.good.bg : c.muted, transform: [{ scale: on ? 1.08 : 1 }] }, on && lift]}>
                <Txt size="sm" weight="semibold" color={on ? c.onBrand : done ? tone.good.fg : c.soft}>{i + 1}</Txt>
              </Press>
            );
          })}
        </ScrollView>
        {soon ? <Pulse style={{ alignSelf: "flex-start" }}>{timer}</Pulse> : <View style={{ alignSelf: "flex-start" }}>{timer}</View>}
      </View>

      <Animated.View style={{ opacity: slide, transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }}>
        <Card>
          <Txt size="xxs" weight="semibold" soft upper style={{ marginBottom: 4 }}>Question {index + 1} of {qs.length} · {q.marks} mark{q.marks === 1 ? "" : "s"}</Txt>
          <Txt size="xl" weight="semibold" style={{ marginBottom: 18 }}>{q.text}</Txt>
          <Grid cols={{ base: 1, md: 2 }} gap={10}>
            {q.options.map((o, j) => {
              const on = answers[q.id] === j;
              return (
                <Press key={j} onPress={() => choose(j)} scale={0.98} accessibilityRole="radio" accessibilityState={{ checked: on }}
                  style={[{ minHeight: 58, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 18, borderWidth: 2, paddingHorizontal: 14, paddingVertical: 10, borderColor: on ? c.brand : c.line, backgroundColor: on ? c.brandSoft : c.surface }, on && lift]}>
                  <View style={{ width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: on ? c.brand : c.muted }}>
                    <Txt size="sm" weight="bold" color={on ? c.onBrand : c.soft}>{LETTERS[j]}</Txt>
                  </View>
                  <Txt weight={on ? "semibold" : "regular"} style={{ flex: 1 }}>{o}</Txt>
                </Press>
              );
            })}
          </Grid>
        </Card>
      </Animated.View>

      {error && <Alert>{error}</Alert>}
      <StickyBar>
        <Button variant="secondary" icon={ChevronLeft} disabled={index === 0} onPress={() => setIndex((i) => i - 1)} accessibilityLabel="Previous question" />
        <View style={{ flex: 1, minWidth: 110 }}>
          <Txt size="xs" soft style={{ marginBottom: 4 }}>{answered} of {qs.length} answered</Txt>
          <Progress value={qs.length ? (answered / qs.length) * 100 : 0} />
        </View>
        {index < qs.length - 1 ? <Button iconRight={ChevronRight} onPress={() => setIndex((i) => i + 1)}>Next</Button> : <Button icon={Send} busy={busy} onPress={handIn}>Hand in</Button>}
      </StickyBar>
    </Stack>
  );
}

function Review({ paper }: { paper: QuizPaper }) {
  const { c, tone, card } = useTheme();
  const { attempt } = paper;
  const pctScore = attempt && attempt.max_score ? Math.round((attempt.score / attempt.max_score) * 100) : null;
  const praise = pctScore == null ? "" : pctScore >= 90 ? "Outstanding!" : pctScore >= 70 ? "Great work!" : pctScore >= 50 ? "Good effort." : "Keep practising: go over the answers below.";
  return (
    <Stack gap={14}>
      {attempt ? (
        <Enter>
          <View style={[{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 18, borderRadius: 22, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, padding: 20, overflow: "hidden" }, card]}>
            <Ring value={pctScore} size={112} label="score" tone={pctScore == null ? undefined : pctScore >= 70 ? "good" : pctScore >= 50 ? "warn" : "bad"} />
            <View style={{ flex: 1, minWidth: 180 }}>
              <Txt size="2xl" weight="bold">{praise}</Txt>
              <Txt soft style={{ marginTop: 4 }}>You scored <Txt weight="bold">{scoreText(attempt.score, attempt.max_score)}</Txt>. Handed in {formatDateTime(attempt.submitted_at)}.</Txt>
            </View>
            {pctScore != null && pctScore >= 90 && <View style={{ position: "absolute", right: 18, top: 18 }}><Pulse><PartyPopper size={30} color="#f59e0b" /></Pulse></View>}
          </View>
        </Enter>
      ) : paper.state === "closed" ? <Alert tone="info">This quiz closed without being taken.</Alert> : null}
      {!paper.answers_shown && attempt && <Alert tone="info">{`Handed in. The right answers show here after the quiz closes on ${formatDateTime(paper.quiz.closes_at)}.`}</Alert>}
      {paper.answers_shown && paper.questions.map((q, i) => (
        <Enter key={q.id} delay={Math.min(i, 6) * 40}>
          <Card>
            <Row justify="space-between" align="flex-start" gap={12} style={{ marginBottom: 12 }}>
              <Txt weight="semibold" style={{ flex: 1 }}>{i + 1}. {q.text}</Txt>
              {q.is_correct != null && <Badge tone={q.is_correct ? "good" : "bad"}>{q.is_correct ? "Right" : q.your_answer == null ? "Not answered" : "Wrong"}</Badge>}
            </Row>
            <Grid cols={{ base: 1, md: 2 }} gap={8}>
              {q.options.map((o, j) => {
                const right = j === q.correct_option;
                const mine = j === q.your_answer;
                return (
                  <Row key={j} gap={10} style={{ borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, borderColor: right ? tone.good.solid : mine ? tone.bad.solid : c.line, backgroundColor: right ? tone.good.bg : mine ? tone.bad.bg : "transparent" }}>
                    <View style={{ width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: right ? tone.good.solid : mine ? tone.bad.solid : c.muted }}>
                      <Txt size="xs" weight="bold" color={right || mine ? "#fff" : c.soft}>{LETTERS[j]}</Txt>
                    </View>
                    <Txt size="sm" style={{ flex: 1 }}>{o}</Txt>
                    {right && <Txt size="xs" color={tone.good.fg}>right answer</Txt>}
                    {mine && !right && <Txt size="xs" color={tone.bad.fg}>chosen</Txt>}
                  </Row>
                );
              })}
            </Grid>
          </Card>
        </Enter>
      ))}
    </Stack>
  );
}

function Results({ id }: { id: string }) {
  const { c, tone } = useTheme();
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
      <Grid cols={{ base: 2, lg: 4 }} gap={12} style={{ marginBottom: 18 }}>
        <Stat label="Taken" value={`${r.attempted} / ${r.students}`} progress={r.students ? (r.attempted / r.students) * 100 : 0} />
        <Stat label="Average" value={r.average_score == null ? "-" : `${r.average_score} / ${r.max_score}`} />
        <Stat label={r.quiz.state === "upcoming" ? "Opens" : "Closes"} value={<Txt size="lg" weight="bold">{formatDateTime(r.quiz.state === "upcoming" ? r.quiz.opens_at : r.quiz.closes_at)}</Txt>} />
        <Stat label="Questions" value={r.questions.length} />
      </Grid>
      {hasRole("teacher") && r.quiz.state === "open" && <Button variant="secondary" busy={busy} onPress={close} style={{ marginBottom: 18 }}>Close now and show answers</Button>}
      <Stack gap={16}>
        <Card title="Questions" description={r.attempted > 0 && r.most_missed.length > 0 ? "Most missed are marked: go over them next class" : undefined}>
          <Stack gap={10}>
            {r.questions.map((q, i) => (
              <View key={q.id} style={{ borderRadius: 14, borderWidth: 1, borderColor: missed.has(q.id) ? tone.bad.border : c.line, padding: 12 }}>
                <Row justify="space-between" wrap gap={8}>
                  <Txt size="sm" weight="medium" style={{ flex: 1, minWidth: 160 }}>{i + 1}. {q.text}</Txt>
                  <Row gap={8}>
                    {missed.has(q.id) && <Badge tone="bad">Most missed</Badge>}
                    <Txt size="sm" soft tabular>{q.percent_correct == null ? "-" : `${q.percent_correct}% right`}</Txt>
                  </Row>
                </Row>
                <Stack gap={4} style={{ marginTop: 8 }}>
                  {q.options.map((o, j) => {
                    const share = r.attempted ? (q.choices[j] / r.attempted) * 100 : 0;
                    const right = j === q.correct_option;
                    return (
                      <View key={j} style={{ borderRadius: 9, borderWidth: 1, borderColor: c.line, overflow: "hidden" }}>
                        <Progress value={share} height={36} color={right ? tone.good.bg : c.muted} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, height: undefined, borderRadius: 0, backgroundColor: "transparent" }} />
                        <Row justify="space-between" gap={8} style={{ paddingHorizontal: 12, paddingVertical: 7 }}>
                          <Txt size="sm" style={{ flex: 1 }}>{o}{right ? <Txt size="xs" color={tone.good.fg}>{"  "}right answer</Txt> : null}</Txt>
                          <Txt size="sm" soft tabular>{q.choices[j]}</Txt>
                        </Row>
                      </View>
                    );
                  })}
                </Stack>
              </View>
            ))}
          </Stack>
        </Card>
        <Card title="Scores">
          <DataTable rows={r.scores} rowKey={(s) => s.student} empty="No students."
            columns={[
              { header: "Student", flex: 2, cell: (s) => <Txt size="sm" weight="medium">{s.roll_no ? `${s.roll_no}. ` : ""}{s.name}</Txt> },
              { header: "Score", align: "right", cell: (s) => (s.attempted ? <Txt size="sm" weight="medium" tabular>{scoreText(s.score!, s.max_score!)}</Txt> : <Badge>Not taken</Badge>) },
              { header: "Handed in", cell: (s) => (s.submitted_at ? formatDateTime(s.submitted_at) : "-") },
            ]} />
        </Card>
      </Stack>
    </>
  );
}
