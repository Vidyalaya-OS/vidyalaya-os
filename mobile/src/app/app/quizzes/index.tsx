import { ArrowDown, ArrowUp, Check, CirclePlus, Copy, Library, Lightbulb, Plus, Search, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { TextInput, View } from "react-native";
import { Aurora } from "@/components/brand";
import { DateField } from "@/components/Calendar";
import { ChildSwitcher } from "@/components/Dashboards";
import { QuizList } from "@/components/QuizList";
import { useStaffSections } from "@/components/sections";
import { useToast } from "@/components/toast";
import { Alert, Button, Card, Empty, Enter, Field, Grid, IconButton, PageHeader, Press, Row, Screen, Select, Stack, StickyBar, Tabs, Txt } from "@/components/ui";
import { api, errorMessage, Page } from "@/lib/api";
import { useChildren } from "@/lib/children";
import { todayIso, toLocalInput } from "@/lib/format";
import { useSession } from "@/lib/session";
import { FONTS, useTheme } from "@/lib/theme";
import type { BankQuestion, Teacher } from "@/lib/types";
import { rows, useApi, useDebounced } from "@/lib/useApi";

export default function QuizzesPage() {
  const { hasRole } = useSession();
  return (
    <Screen>
      <PageHeader title="Quizzes" subtitle={hasRole("teacher") ? "Set a short quiz on what you taught today, and see who got what wrong." : "Short quizzes on the day's lesson, to take at home."} />
      <Stack gap={16}>
        {hasRole("teacher") && <TeacherQuizzes />}
        {hasRole("student") && <StudentQuizzes />}
        {hasRole("parent") && <ParentQuizzes />}
        {hasRole("admin") && !hasRole("teacher") && <AdminQuizzes />}
      </Stack>
    </Screen>
  );
}

function StudentQuizzes() {
  const [tab, setTab] = useState<"pending" | "upcoming" | "closed">("pending");
  return (
    <Card title="Your quizzes" icon={Lightbulb}>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "pending", label: "To take" }, { key: "upcoming", label: "Coming up" }, { key: "closed", label: "Finished" }]} />
      <QuizList key={tab} query={`state=${tab}`} empty={tab === "pending" ? "Nothing to take right now. Well done!" : tab === "upcoming" ? "No quizzes coming up." : "No finished quizzes yet."} />
    </Card>
  );
}

function ParentQuizzes() {
  const { list, chosen, choose, loading } = useChildren();
  if (loading) return null;
  if (!chosen) return <Empty title="No children linked yet">Ask the school office to link your child to your account.</Empty>;
  return (
    <>
      <ChildSwitcher items={list.map((x) => ({ id: x.id, name: x.name, detail: x.current_enrollment?.section_name }))} value={chosen.id} onChange={choose} />
      <Card title={`${chosen.name}'s quizzes`} icon={Lightbulb} description="Scores show as soon as a quiz is handed in.">
        <QuizList key={chosen.id} query={`student=${chosen.id}`} student={chosen.id} empty="No quizzes yet." />
      </Card>
    </>
  );
}

function AdminQuizzes() {
  const sections = useStaffSections();
  const [section, setSection] = useState("");
  return (
    <Card title="All quizzes" icon={Lightbulb}>
      <Select label="Section" value={section} onChange={setSection} style={{ marginBottom: 14, maxWidth: 360 }} options={[{ value: "", label: "All sections" }, ...sections.map((s) => ({ value: s.id, label: s.name }))]} />
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
      {me.data && <NewQuiz pairs={pairs} onCreated={() => setVersion((v) => v + 1)} />}
      <Card title="Your quizzes" icon={Lightbulb}>
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

/** What is wrong with one question, or null. */
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
  const { c, tone, lift } = useTheme();
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
  const fieldErrors = checked ? quizProblems({ pair, title, taughtOn, opensAt, closesAt }) : {};
  const itemErrors = checked ? items.map(draftProblem) : items.map(() => null);

  const submit = async () => {
    setChecked(true);
    const problems = quizProblems({ pair, title, taughtOn, opensAt, closesAt });
    const bad = items.findIndex((d) => draftProblem(d));
    if (Object.keys(problems).length || bad >= 0) {
      setError(bad >= 0 && !Object.keys(problems).length ? `Question ${bad + 1} needs another look.` : "Some details need another look. They are highlighted.");
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
      setError(errorMessage(err, "Could not save the quiz. Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  };

  if (pairs.length === 0) return <Alert tone="info">You are not assigned to teach any subject yet, so you can&apos;t set quizzes.</Alert>;
  if (!open) {
    return (
      <Press onPress={() => setOpen(true)} scale={0.98} style={{ flexDirection: "row", alignItems: "center", gap: 16, borderRadius: 18, borderWidth: 2, borderStyle: "dashed", borderColor: c.line, backgroundColor: c.surface, padding: 18 }}>
        <View style={[{ borderRadius: 16 }, lift]}>
          <Aurora radius={16} style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}><CirclePlus size={24} color="#fff" /></Aurora>
        </View>
        <View style={{ flex: 1 }}>
          <Txt weight="semibold">New quiz</Txt>
          <Txt size="sm" soft>A short check on today&apos;s lesson. It marks itself and shows you who got what wrong.</Txt>
        </View>
      </Press>
    );
  }
  return (
    <Enter>
      <Card title="New quiz" icon={CirclePlus} actions={<Button variant="ghost" size="sm" onPress={() => setOpen(false)}>Cancel</Button>}>
        <Stack gap={18}>
          {error && <Alert>{error}</Alert>}
          <Grid cols={{ base: 1, md: 2 }} gap={12}>
            <Select label="Class and subject" value={pair} error={fieldErrors.pair} onChange={setPair} options={pairs.map((p) => ({ value: `${p.section}|${p.subject}`, label: `${p.section_name} · ${p.subject_name}` }))} />
            <Field label="Topic taught" optional placeholder="For example: Adding fractions" maxLength={200} value={topic} onChangeText={setTopic} />
            <Field label="Title" maxLength={200} value={title} error={fieldErrors.title} onChangeText={setTitle} placeholder="For example: Fractions quick check" />
            <DateField label="Taught on" max={todayIso()} value={taughtOn} error={fieldErrors.taughtOn} onChange={setTaughtOn} />
            <DateField label="Opens" optional mode="datetime" clearable value={opensAt} onChange={setOpensAt} hint="Leave empty to open it now." placeholder="Now" />
            <DateField label="Closes" mode="datetime" min={opensAt || undefined} value={closesAt} error={fieldErrors.closesAt} onChange={setClosesAt} hint="Students see the right answers after this." />
          </Grid>

          <View>
            <Row justify="space-between" style={{ marginBottom: 10 }}>
              <Txt size="sm" weight="semibold">Questions</Txt>
              <Txt size="xs" soft>Tick the right answer for each one</Txt>
            </Row>
            <Stack gap={12}>
              {items.map((d, i) => (
                <Enter key={d.key}>
                  <View style={{ borderRadius: 18, borderWidth: 1, borderColor: itemErrors[i] ? tone.bad.solid : c.line, backgroundColor: c.muted + "4d", padding: 14 }}>
                    <Row justify="space-between" wrap gap={8} style={{ marginBottom: 10 }}>
                      <Row gap={8}>
                        <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: c.brand, alignItems: "center", justifyContent: "center" }}><Txt size="xs" weight="bold" color={c.onBrand}>{i + 1}</Txt></View>
                        <Txt size="sm" weight="semibold">{d.bank ? "From your bank" : d.type === "mcq" ? "Multiple choice" : "True or false"}</Txt>
                      </Row>
                      <Row gap={2}>
                        <Txt size="xs" soft>Marks</Txt>
                        <TextInput keyboardType="number-pad" value={d.marks} onChangeText={(v) => update(d.key, { marks: v.replace(/\D/g, "").slice(0, 3) })} accessibilityLabel={`Marks for question ${i + 1}`}
                          style={{ height: 36, width: 52, marginHorizontal: 6, borderRadius: 9, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, textAlign: "center", fontFamily: FONTS.semibold, color: c.ink }} />
                        <IconButton icon={ArrowUp} size={32} label={`Move question ${i + 1} up`} disabled={i === 0} onPress={() => move(i, -1)} />
                        <IconButton icon={ArrowDown} size={32} label={`Move question ${i + 1} down`} disabled={i === items.length - 1} onPress={() => move(i, 1)} />
                        {!d.bank && <IconButton icon={Copy} size={32} label={`Copy question ${i + 1}`} onPress={() => duplicate(i)} />}
                        {items.length > 1 && <IconButton icon={Trash2} size={32} color={tone.bad.solid} label={`Remove question ${i + 1}`} onPress={() => remove(d.key)} />}
                      </Row>
                    </Row>
                    {d.bank ? (
                      <View>
                        <Txt size="sm">{d.bank.text}</Txt>
                        <Txt size="xs" soft style={{ marginTop: 4 }}>Answer: {d.bank.options[d.bank.correct_option]}</Txt>
                      </View>
                    ) : <QuestionEditor draft={d} onChange={(ch) => update(d.key, ch)} />}
                    {itemErrors[i] && <Txt size="xs" weight="medium" color={tone.bad.fg} style={{ marginTop: 8 }}>{itemErrors[i]}</Txt>}
                  </View>
                </Enter>
              ))}
            </Stack>
            <Row wrap gap={8} style={{ marginTop: 12 }}>
              <Button variant="secondary" size="sm" icon={Plus} onPress={() => setItems((l) => [...l, blank("mcq")])}>Multiple choice</Button>
              <Button variant="secondary" size="sm" icon={Plus} onPress={() => setItems((l) => [...l, blank("true_false")])}>True or false</Button>
              <Button variant="ghost" size="sm" icon={Library} disabled={!subject} onPress={() => setShowBank(!showBank)}>{showBank ? "Hide your question bank" : "Reuse from your question bank"}</Button>
            </Row>
            {!subject && <Txt size="xs" soft style={{ marginTop: 4 }}>Choose the class and subject to reuse questions.</Txt>}
            {showBank && subject && (
              <QuestionBank subject={subject} chosen={new Set(items.filter((d) => d.bank).map((d) => d.bank!.id))}
                onPick={(q) => setItems((l) => [...l.filter((d) => d.bank || d.text.trim()), { ...blank(q.type), bank: q }])} />
            )}
          </View>
        </Stack>
        <StickyBar style={{ justifyContent: "space-between" }}>
          <Txt size="sm" soft><Txt size="sm" weight="bold">{items.length}</Txt> question{items.length === 1 ? "" : "s"} · <Txt size="sm" weight="bold">{total}</Txt> mark{total === 1 ? "" : "s"}</Txt>
          <Button busy={busy} onPress={submit}>Save quiz</Button>
        </StickyBar>
      </Card>
    </Enter>
  );
}

function QuestionEditor({ draft, onChange }: { draft: Draft; onChange: (c: Partial<Draft>) => void }) {
  const { c, tone } = useTheme();
  return (
    <Stack gap={12}>
      <Field label="Question" multiline value={draft.text} onChangeText={(t) => onChange({ text: t })} placeholder="For example: What is 1/2 + 1/4?" />
      <View>
        <Txt size="xs" soft style={{ marginBottom: 6 }}>Choices: tap the letter of the right one</Txt>
        <Grid cols={{ base: 1, md: 2 }} gap={8}>
          {draft.options.map((o, i) => {
            const right = draft.correct === i;
            return (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, borderWidth: right ? 2 : 1, borderColor: right ? tone.good.solid : c.line, backgroundColor: c.surface, paddingHorizontal: 8, paddingVertical: 4, minHeight: 48 }}>
                <Press onPress={() => onChange({ correct: i })} scale={0.88} accessibilityRole="radio" accessibilityState={{ checked: right }} accessibilityLabel={`Choice ${LETTERS[i]} is right`}
                  style={{ width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: right ? tone.good.solid : c.muted }}>
                  {right ? <Check size={16} color="#fff" /> : <Txt size="xs" weight="bold" soft>{LETTERS[i]}</Txt>}
                </Press>
                {draft.type === "mcq" ? (
                  <TextInput style={{ flex: 1, minHeight: 36, fontFamily: FONTS.regular, fontSize: 16, color: c.ink }} placeholderTextColor={c.soft + "99"}
                    placeholder={`Choice ${LETTERS[i]}${i >= 2 ? " (optional)" : ""}`} accessibilityLabel={`Choice ${LETTERS[i]}`} maxLength={300} value={o}
                    onChangeText={(t) => onChange({ options: draft.options.map((x, j) => (j === i ? t : x)) })} />
                ) : <Txt size="sm">{o}</Txt>}
              </View>
            );
          })}
        </Grid>
      </View>
    </Stack>
  );
}

function QuestionBank({ subject, chosen, onPick }: { subject: string; chosen: Set<string>; onPick: (q: BankQuestion) => void }) {
  const { c } = useTheme();
  const [search, setSearch] = useState("");
  const term = useDebounced(search);
  const bank = useApi<Page<BankQuestion>>(`question-bank/?subject=${subject}${term ? `&search=${encodeURIComponent(term)}` : ""}`);
  const list = rows(bank.data);
  return (
    <Enter style={{ marginTop: 12 }}>
      <View style={{ borderRadius: 14, borderWidth: 1, borderColor: c.line, padding: 12, gap: 8 }}>
        <Field label="Search your questions" icon={Search} value={search} onChangeText={setSearch} />
        {bank.data && list.length === 0 && <Txt size="sm" soft>Questions you write for this subject are saved here to reuse.</Txt>}
        {list.map((q) => (
          <Row key={q.id} justify="space-between" align="flex-start" gap={12} style={{ borderRadius: 12, borderWidth: 1, borderColor: c.line, padding: 12 }}>
            <View style={{ flex: 1 }}>
              <Txt size="sm">{q.text}</Txt>
              <Txt size="xs" soft>{q.topic_name ?? "No topic"} · answer: {q.options[q.correct_option]}</Txt>
            </View>
            <Button variant="secondary" size="sm" disabled={chosen.has(q.id)} onPress={() => onPick(q)}>{chosen.has(q.id) ? "Added" : "Add"}</Button>
          </Row>
        ))}
      </View>
    </Enter>
  );
}
