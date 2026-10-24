import { ArrowRight, Check, Clock, GraduationCap, Layers, Plus, Wallet, X } from "lucide-react-native";
import { TextInput, View } from "react-native";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Icon } from "@/lib/nav";
import { FONTS, useTheme } from "@/lib/theme";
import type { AcademicYear, SchoolClass, Section, Subject, Teacher } from "@/lib/types";
import { useToast } from "./toast";
import { Alert, Button, Checkbox, Enter, Field, Grid, IconButton, Press, Pulse, Row, Select, Sheet, Span, Stack, Txt, go } from "./ui";

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

/** Numbered steps across the top of a wizard. */
function Stepper({ steps, at }: { steps: string[]; at: number }) {
  const { c, tone } = useTheme();
  return (
    <View accessible accessibilityLabel={`Step ${at + 1} of ${steps.length}: ${steps[at]}`} style={{ marginBottom: 18 }}>
    <Row gap={6}>
      {steps.map((s, i) => {
        const dot = (
          <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: i < at ? tone.good.solid : i === at ? c.brand : c.muted }}>
            {i < at ? <Check size={14} color="#fff" strokeWidth={3} /> : <Txt size="xs" weight="bold" color={i === at ? c.onBrand : c.soft}>{i + 1}</Txt>}
          </View>
        );
        return [
          i === at ? <Pulse key={s}>{dot}</Pulse> : <View key={s}>{dot}</View>,
          i === at ? <Txt key={`${s}-label`} size="xs" weight="medium" numberOfLines={1} style={{ flexShrink: 1 }}>{s}</Txt> : null,
          i < steps.length - 1 ? <View key={`${s}-line`} style={{ height: 1, minWidth: 6, flex: 1, backgroundColor: i < at ? tone.good.solid : c.line }} /> : null,
        ];
      })}
    </Row>
    </View>
  );
}

/** A short "good to know" box inside a wizard step. */
function Guideline({ title, children }: { title: string; children: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ borderRadius: 14, borderWidth: 1, borderColor: c.brand + "33", backgroundColor: c.brandSoft + "99", paddingHorizontal: 14, paddingVertical: 10 }}>
      <Txt size="sm" weight="semibold">{title}</Txt>
      {typeof children === "string" ? <Txt size="sm" soft style={{ marginTop: 2 }}>{children}</Txt> : children}
    </View>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <Stack gap={3} style={{ marginTop: 4 }}>
      {items.map((t) => <Row key={t} align="flex-start" gap={6}><Txt size="sm" soft>•</Txt><Txt size="sm" soft style={{ flex: 1 }}>{t}</Txt></Row>)}
    </Stack>
  );
}

function TeacherSelect({ value, onChange, teachers, label }: { value: string; onChange: (v: string) => void; teachers: Teacher[]; label?: string }) {
  return <Select label={label} value={value} onChange={onChange} placeholder="Not allocated yet" options={[{ value: "", label: "Not allocated yet" }, ...teachers.map((t) => ({ value: t.id, label: t.name }))]} />;
}

function NextLinks({ links, onGo }: { links: { href: string; label: string; hint: string; icon: Icon }[]; onGo: () => void }) {
  const { c } = useTheme();
  return (
    <Grid cols={{ base: 1, sm: 3 }} gap={8}>
      {links.map((l) => (
        <Press key={l.href} onPress={() => { onGo(); go(l.href); }} style={{ gap: 6, borderRadius: 14, borderWidth: 1, borderColor: c.line, padding: 12 }}>
          <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: c.brandSoft, alignItems: "center", justifyContent: "center" }}><l.icon size={16} color={c.brand} /></View>
          <Txt size="sm" weight="semibold">{l.label}</Txt>
          <Txt size="xs" soft>{l.hint}</Txt>
        </Press>
      ))}
    </Grid>
  );
}

/* ------------------------------------------------------------- new class */

const CLASS_STEPS = ["Name", "Sections", "Subjects", "Teachers", "Done"];

/** Walks an admin through a new class: name it, add its sections with a
 * class teacher, choose its subjects and allocate a teacher to each. Each
 * step saves before moving on, so a mistake shows where it was made. */
export function NewClassWizard({ open, onClose, data }: { open: boolean; onClose: () => void; data: Data }) {
  const { c, tone } = useTheme();
  const [at, setAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [order, setOrder] = useState("");
  const [created, setCreated] = useState<SchoolClass | null>(null);
  const [sectionRows, setSectionRows] = useState<{ name: string; teacher: string }[]>([{ name: "A", teacher: "" }]);
  const [madeSections, setMadeSections] = useState<Section[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [allocation, setAllocation] = useState<Record<string, string>>({});
  const toast = useToast();

  const reset = () => {
    setAt(0); setError(null); setName(""); setOrder(""); setCreated(null);
    setSectionRows([{ name: "A", teacher: "" }]); setMadeSections([]); setChosen([]); setAllocation({});
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
    const made = await api<SchoolClass>("classes/", { method: "POST", body: { name: name.trim(), order: Number(order || data.classes.length + 1) } });
    setCreated(made);
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
    <Sheet open={open} onClose={close} title="Onboard a new class" description="Five short steps. Each one is saved as you go.">
      <Stepper steps={CLASS_STEPS} at={at} />
      {error && <Alert style={{ marginBottom: 14 }}>{error}</Alert>}

      <Enter key={at}>
        {at === 0 && (
          <Stack gap={14}>
            <Guideline title="Guidelines for naming a class">
              <Bullets items={[
                "Use the name parents know, such as Grade 6 or Class 6, and keep one style for the whole school.",
                "A class is the grade; sections (6-A, 6-B) come next. Do not put the section in the class name.",
                "Order sets where it sits in lists and which class students are promoted to: Grade 6 after Grade 5.",
              ]} />
            </Guideline>
            {!data.year && <Alert tone="warn" title="Set the academic year first">Sections belong to a year. Add the current year in Step 1 on this page, then come back.</Alert>}
            <Grid cols={3} gap={10}>
              <Span span={2}><Field label="Class name" placeholder="Grade 6" value={name} onChangeText={setName} autoFocus /></Span>
              <Field label="Order" keyboardType="number-pad" placeholder={String(data.classes.length + 1)} value={order} onChangeText={setOrder} />
            </Grid>
            <Button iconRight={ArrowRight} busy={busy} disabled={!name.trim() || !data.year} onPress={saveName} style={{ alignSelf: "flex-end" }}>Create class</Button>
          </Stack>
        )}

        {at === 1 && (
          <Stack gap={14}>
            <Guideline title="Sections hold the students">Add one section per classroom: A, B, C. The class teacher takes the daily roll call, so choose one now if you can. You can change it later.</Guideline>
            <Stack gap={8}>
              {sectionRows.map((row, i) => {
                const saved = madeSections.some((m) => m.name === row.name.trim());
                return (
                  <Row key={i} gap={8}>
                    <TextInput accessibilityLabel="Section name" value={row.name} editable={!saved} placeholder="A" placeholderTextColor={c.soft} autoCapitalize="characters" maxLength={10}
                      onChangeText={(t) => setSectionRows((r) => r.map((x, j) => (j === i ? { ...x, name: t.toUpperCase() } : x)))}
                      style={{ width: 70, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, paddingHorizontal: 12, color: c.ink, fontFamily: FONTS.semibold, fontSize: 15, opacity: saved ? 0.6 : 1 }} />
                    <View style={{ flex: 1 }}>
                      <TeacherSelect teachers={data.teachers} value={row.teacher} onChange={(v) => setSectionRows((r) => r.map((x, j) => (j === i ? { ...x, teacher: v } : x)))} />
                    </View>
                    {saved ? <View style={{ width: 40, alignItems: "center" }}><Check size={18} color={tone.good.solid} /></View> : (
                      <IconButton icon={X} label="Remove section" onPress={() => setSectionRows((r) => r.filter((_, j) => j !== i))} />
                    )}
                  </Row>
                );
              })}
            </Stack>
            <Button variant="ghost" size="sm" icon={Plus} style={{ alignSelf: "flex-start" }} onPress={() => setSectionRows((r) => [...r, { name: String.fromCharCode(65 + r.length), teacher: "" }])}>Another section</Button>
            {data.teachers.length === 0 && <Txt size="xs" soft>No teachers yet. Leave class teacher empty and set it after adding teachers.</Txt>}
            <Button iconRight={ArrowRight} busy={busy} onPress={saveSections} style={{ alignSelf: "flex-end" }}>Save sections</Button>
          </Stack>
        )}

        {at === 2 && (
          <Stack gap={14}>
            <Guideline title={`Which subjects does ${created?.name} study?`}>Every section of the class gets these subjects. Only subjects on a section can go on its timetable, tests and report card.</Guideline>
            {data.subjects.length === 0 ? (
              <Alert tone="warn" title="No subjects yet">Add subjects with the New subject guide (or Step 4 on this page), then give them to this class from Who teaches what.</Alert>
            ) : (
              <Grid cols={{ base: 1, sm: 2 }} gap={0}>
                {data.subjects.map((s) => (
                  <Checkbox key={s.id} label={<Txt size="sm">{s.name}{s.code ? <Txt size="sm" soft> ({s.code})</Txt> : null}</Txt>} checked={chosen.includes(s.id)}
                    onChange={(on) => setChosen((x) => (on ? [...x, s.id] : x.filter((y) => y !== s.id)))} />
                ))}
              </Grid>
            )}
            <Row wrap justify="space-between" gap={8}>
              <Button variant="ghost" disabled={data.subjects.length === 0} onPress={() => setChosen(chosen.length === data.subjects.length ? [] : data.subjects.map((s) => s.id))}>
                {chosen.length === data.subjects.length && chosen.length > 0 ? "Clear all" : "Select all"}
              </Button>
              <Button iconRight={chosen.length ? ArrowRight : undefined} onPress={() => setAt(chosen.length ? 3 : 4)}>{chosen.length ? "Next: teachers" : "Skip for now"}</Button>
            </Row>
          </Stack>
        )}

        {at === 3 && (
          <Stack gap={14}>
            <Guideline title="Allocate a teacher to each subject">{`The teacher you choose teaches it in every section of ${created?.name}, marks those students' attendance and enters their marks. You can change any section later in Who teaches what.`}</Guideline>
            <Stack gap={10}>
              {chosen.map((id) => (
                <View key={id} style={{ gap: 6 }}>
                  <Txt size="sm" weight="medium">{subjectName(id)}</Txt>
                  <TeacherSelect teachers={data.teachers} value={allocation[id] ?? ""} onChange={(v) => setAllocation((a) => ({ ...a, [id]: v }))} />
                </View>
              ))}
            </Stack>
            <Row justify="space-between" gap={8}>
              <Button variant="ghost" onPress={() => setAt(2)}>Back</Button>
              <Button iconRight={ArrowRight} busy={busy} onPress={saveTeachers}>Save</Button>
            </Row>
          </Stack>
        )}

        {at === 4 && (
          <Stack gap={14}>
            <Alert tone="success" title={`${created?.name} is ready`}>
              {`${madeSections.map((s) => s.display_name).join(", ")} ${madeSections.length === 1 ? "has" : "have"} been created${chosen.length ? ` with ${chosen.length} subject${chosen.length === 1 ? "" : "s"}` : ""}.${chosen.some((id) => !allocation[id]) ? " Some subjects still need a teacher; allocate them in Who teaches what." : ""}`}
            </Alert>
            <Txt size="sm" weight="semibold">What to do next</Txt>
            <NextLinks onGo={close} links={[
              { href: "/app/timetable", label: "Build its timetable", hint: "Put its subjects into periods.", icon: Clock },
              { href: "/app/students", label: "Enroll students", hint: "Add them to the new sections.", icon: GraduationCap },
              { href: "/app/fees", label: "Set its fees", hint: "What this class pays this year.", icon: Wallet },
            ]} />
            <Row wrap justify="flex-end" gap={8}>
              <Button variant="secondary" onPress={() => { data.reload(); reset(); }}>Onboard another class</Button>
              <Button onPress={close}>Done</Button>
            </Row>
          </Stack>
        )}
      </Enter>
    </Sheet>
  );
}

/* ----------------------------------------------------------- new subject */

const SUBJECT_STEPS = ["Name", "Sections", "Teachers", "Done"];

/** Walks an admin through a new subject: name it, choose the sections that
 * study it, and allocate a teacher in each. */
export function NewSubjectWizard({ open, onClose, data }: { open: boolean; onClose: () => void; data: Data }) {
  const { c } = useTheme();
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
    <Sheet open={open} onClose={close} title="Onboard a new subject" description="Four short steps. Each one is saved as you go.">
      <Stepper steps={SUBJECT_STEPS} at={at} />
      {error && <Alert style={{ marginBottom: 14 }}>{error}</Alert>}

      <Enter key={at}>
        {at === 0 && (
          <Stack gap={14}>
            <Guideline title="Guidelines for adding a subject">
              <Bullets items={[
                "Add each subject once for the whole school. Maths is one subject, even if every class studies it.",
                "Use the name that goes on report cards, such as Social Studies.",
                "A short code (SST, MATH) keeps timetables and mark sheets tidy. It is optional.",
              ]} />
            </Guideline>
            <Grid cols={3} gap={10}>
              <Span span={2}><Field label="Subject" placeholder="Computer Science" value={name} onChangeText={setName} autoFocus /></Span>
              <Field label="Code" placeholder="CS" autoCapitalize="characters" value={code} onChangeText={setCode} />
            </Grid>
            <Button iconRight={ArrowRight} busy={busy} disabled={!name.trim()} onPress={saveName} style={{ alignSelf: "flex-end" }}>Create subject</Button>
          </Stack>
        )}

        {at === 1 && (
          <Stack gap={14}>
            <Guideline title={`Which sections study ${created?.name}?`}>Tick whole classes or single sections. Only these sections will see it on their timetable, tests and report cards.</Guideline>
            {data.sections.length === 0 ? (
              <Alert tone="warn" title="No sections yet">Create a class and its sections first (use the New class guide). The subject is saved; you can give it to sections later.</Alert>
            ) : (
              <Stack gap={10}>
                {[...byClass].map(([cls, list]) => {
                  const all = list.every((s) => chosen.includes(s.id));
                  return (
                    <View key={cls} style={{ borderRadius: 14, borderWidth: 1, borderColor: c.line, paddingHorizontal: 12, paddingVertical: 4 }}>
                      <Checkbox label={<Txt size="sm" weight="semibold">{cls} <Txt size="sm" soft>· all sections</Txt></Txt>} checked={all}
                        onChange={(on) => setChosen((x) => (on ? [...new Set([...x, ...list.map((s) => s.id)])] : x.filter((y) => !list.some((s) => s.id === y))))} />
                      <Row wrap gap={16} style={{ paddingLeft: 30 }}>
                        {list.map((s) => (
                          <Checkbox key={s.id} label={<Txt size="sm">{s.display_name}</Txt>} checked={chosen.includes(s.id)}
                            onChange={(on) => setChosen((x) => (on ? [...x, s.id] : x.filter((y) => y !== s.id)))} />
                        ))}
                      </Row>
                    </View>
                  );
                })}
              </Stack>
            )}
            <Button iconRight={chosen.length ? ArrowRight : undefined} onPress={() => setAt(chosen.length ? 2 : 3)} style={{ alignSelf: "flex-end" }}>{chosen.length ? "Next: teachers" : "Skip for now"}</Button>
          </Stack>
        )}

        {at === 2 && (
          <Stack gap={14}>
            <Guideline title="Allocate a teacher in each section">{`Pick one teacher for all of them, or a different teacher per section. That teacher marks the section's attendance and enters its ${created?.name} marks.`}</Guideline>
            <TeacherSelect label="Same teacher everywhere" teachers={data.teachers} value={everywhere} onChange={setEverywhere} />
            <Stack gap={10}>
              {chosen.map((id) => (
                <View key={id} style={{ gap: 6 }}>
                  <Txt size="sm" weight="medium">{sectionName(id)}</Txt>
                  <TeacherSelect teachers={data.teachers} value={allocation[id] ?? everywhere} onChange={(v) => setAllocation((a) => ({ ...a, [id]: v }))} />
                </View>
              ))}
            </Stack>
            <Row justify="space-between" gap={8}>
              <Button variant="ghost" onPress={() => setAt(1)}>Back</Button>
              <Button iconRight={ArrowRight} busy={busy} onPress={saveTeachers}>Save</Button>
            </Row>
          </Stack>
        )}

        {at === 3 && (
          <Stack gap={14}>
            <Alert tone="success" title={`${created?.name} is ready`}>
              {chosen.length ? `It is now taught in ${chosen.map(sectionName).join(", ")}.` : "It is on the school's subject list. Give it to sections from Who teaches what."}
            </Alert>
            <Txt size="sm" weight="semibold">What to do next</Txt>
            <NextLinks onGo={close} links={[
              { href: "/app/timetable", label: "Add it to the timetable", hint: "Give it periods in each section.", icon: Clock },
              { href: "/app/exams", label: "Plan its tests", hint: "Add tests for the term.", icon: Layers },
              { href: "/app/setup", label: "Review who teaches what", hint: "Check every section has a teacher.", icon: GraduationCap },
            ]} />
            <Row wrap justify="flex-end" gap={8}>
              <Button variant="secondary" onPress={() => { data.reload(); reset(); }}>Onboard another subject</Button>
              <Button onPress={close}>Done</Button>
            </Row>
          </Stack>
        )}
      </Enter>
    </Sheet>
  );
}
