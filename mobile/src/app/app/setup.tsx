import { BookMarked, CalendarRange, Layers, Pencil, Plus, Sparkles, Trash2, UserCheck, X } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { DateField } from "@/components/Calendar";
import { useDialog } from "@/components/dialog";
import { NewClassWizard, NewSubjectWizard, nextClass, orderFor } from "@/components/SetupWizards";
import { useToast } from "@/components/toast";
import { Alert, Button, Card, Checkbox, Chip, DataTable, Empty, Field, Grid, IconButton, PageHeader, Press, Row, Screen, Select, Sheet, Span, Stack, Txt } from "@/components/ui";
import { api, ApiError, Page } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import type { AcademicYear, SchoolClass, Section, SectionSubject, Subject, Teacher } from "@/lib/types";
import { rows, useApi } from "@/lib/useApi";
import { compact } from "@/lib/useForm";

const CARD_WIDTH = 220;
const CARD_GAP = 12;

export default function SetupPage() {
  const years = useApi<Page<AcademicYear>>("academic-years/");
  const classes = useApi<Page<SchoolClass>>("classes/");
  const subjects = useApi<Page<Subject>>("subjects/");
  const sections = useApi<Page<Section>>("sections/");
  const teachers = useApi<Page<Teacher>>("teachers/?status=active");
  const [wizard, setWizard] = useState<"class" | "subject" | "quick" | null>(null);
  const [assignVersion, setAssignVersion] = useState(0);
  const year = rows(years.data).find((y) => y.is_current) ?? null;
  const reload = () => { classes.reload(); subjects.reload(); sections.reload(); setAssignVersion((v) => v + 1); };
  const data = {
    year,
    classes: rows(classes.data),
    subjects: rows(subjects.data),
    sections: rows(sections.data),
    teachers: rows(teachers.data),
    reload,
  };

  return (
    <Screen>
      <PageHeader title="Classes & subjects" subtitle="Tap a card to edit it."
        actions={<>
          <Button icon={Layers} disabled={!year} onPress={() => setWizard("class")}>Add class</Button>
          <Button variant="secondary" icon={BookMarked} onPress={() => setWizard("subject")}>Add subject</Button>
        </>} />
      <Stack gap={18}>
        <YearBar years={rows(years.data)} reload={() => { years.reload(); sections.reload(); }} />
        <ClassCarousel {...data} onQuick={() => setWizard("quick")} />
        <SubjectStrip subjects={data.subjects} reload={reload} />
        <AssignmentsCard key={assignVersion} sections={data.sections} subjects={data.subjects} teachers={data.teachers} />
      </Stack>
      {wizard === "class" && <NewClassWizard open onClose={() => setWizard(null)} data={data} />}
      <NewSubjectWizard open={wizard === "subject"} onClose={() => setWizard(null)} data={data} />
      {wizard === "quick" && <QuickSetup onClose={() => setWizard(null)} year={year} classes={data.classes} sections={data.sections} reload={reload} />}
    </Screen>
  );
}

function errorText(e: unknown, fallback: string) {
  return e instanceof ApiError ? e.message : fallback;
}

/** The school's years as pills. The current one is highlighted; tap any to edit. */
function YearBar({ years, reload }: { years: AcademicYear[]; reload: () => void }) {
  const { c } = useTheme();
  const [editing, setEditing] = useState<AcademicYear | "new" | null>(null);
  return (
    <View style={{ borderRadius: 18, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, padding: 12 }}>
      <Row gap={8} wrap>
        <Row gap={6}><CalendarRange size={16} color={c.soft} /><Txt size="sm" weight="semibold" soft>Academic year</Txt></Row>
        {years.length === 0 && <Txt size="sm" soft>Add this year to begin.</Txt>}
        {years.map((y) => (
          <Press key={y.id} onPress={() => setEditing(y)} accessibilityLabel={`Edit ${y.name}`}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, minHeight: 36, borderRadius: 999, borderWidth: 1, borderColor: y.is_current ? c.brand : c.line, backgroundColor: y.is_current ? c.brandSoft : c.surface }}>
            {y.is_current && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.brand }} />}
            <Txt size="sm" weight={y.is_current ? "semibold" : "medium"} color={y.is_current ? c.brand : c.ink}>{y.name}</Txt>
            <Pencil size={13} color={y.is_current ? c.brand : c.soft} />
          </Press>
        ))}
        <Chip label="Year" icon={Plus} onPress={() => setEditing("new")} />
      </Row>
      {editing && <YearSheet year={editing === "new" ? null : editing} first={years.length === 0} onClose={() => setEditing(null)} reload={reload} />}
    </View>
  );
}

function YearSheet({ year, first, onClose, reload }: { year: AcademicYear | null; first: boolean; onClose: () => void; reload: () => void }) {
  const toast = useToast();
  const [values, setValues] = useState({ name: year?.name ?? "", start_date: year?.start_date ?? "", end_date: year?.end_date ?? "" });
  const [current, setCurrent] = useState(year ? year.is_current : first);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      if (year) await api(`academic-years/${year.id}/`, { method: "PATCH", body: { ...values, ...(current && !year.is_current ? { is_current: true } : {}) } });
      else await api("academic-years/", { method: "POST", body: { ...values, is_current: current } });
      toast.success(`${values.name} saved.`);
      reload();
      onClose();
    } catch (e) {
      setError(errorText(e, "Could not save the year."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title={year ? "Edit year" : "New academic year"}>
      <Stack gap={12}>
        <Field label="Name" placeholder="2026-27" value={values.name} onChangeText={(t) => setValues({ ...values, name: t })} />
        <Grid cols={2} gap={10}>
          <DateField label="Starts" value={values.start_date} onChange={(v) => setValues({ ...values, start_date: v })} />
          <DateField label="Ends" min={values.start_date || undefined} value={values.end_date} onChange={(v) => setValues({ ...values, end_date: v })} />
        </Grid>
        {!year?.is_current && <Checkbox label="This is the current year" checked={current} onChange={setCurrent} />}
        {error ? <Alert>{error}</Alert> : null}
        <Row gap={8} justify="flex-end">
          <Button variant="secondary" onPress={onClose}>Cancel</Button>
          <Button busy={busy} disabled={!values.name.trim() || !values.start_date || !values.end_date} onPress={save}>Save</Button>
        </Row>
      </Stack>
    </Sheet>
  );
}

/** Classes in order as a sliding row of cards, each with its sections. */
function ClassCarousel({ year, classes, sections, teachers, reload, onQuick }: {
  year: AcademicYear | null; classes: SchoolClass[]; sections: Section[]; teachers: Teacher[]; reload: () => void; onQuick: () => void;
}) {
  const { c, tone } = useTheme();
  const [section, setSection] = useState<Section | null>(null);
  const toast = useToast();
  const dialog = useDialog();
  const ordered = [...classes].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, undefined, { numeric: true }));

  const rename = async (x: SchoolClass) => {
    const v = await dialog.prompt({
      title: `Edit ${x.name}`,
      fields: [{ name: "name", label: "Class name", initial: x.name, required: true, hint: "The order follows the class number." }],
      confirmLabel: "Save",
    });
    if (!v) return;
    try {
      await api(`classes/${x.id}/`, { method: "PATCH", body: { name: v.name.trim(), order: orderFor(v.name, classes.filter((o) => o.id !== x.id)) } });
      toast.success(`${v.name.trim()} saved.`);
      reload();
    } catch (e) {
      toast.error(e);
    }
  };

  const remove = async (x: SchoolClass, own: Section[]) => {
    const ok = await dialog.confirm({
      title: `Delete ${x.name}?`,
      body: own.length ? `Its ${own.length === 1 ? "section" : `${own.length} sections`} will be deleted too.` : undefined,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`classes/${x.id}/`, { method: "DELETE" });
      toast.success(`${x.name} deleted.`);
      reload();
    } catch (e) {
      toast.error(e);
    }
  };

  const addSection = async (x: SchoolClass, own: Section[]) => {
    if (!year) return;
    const v = await dialog.prompt({
      title: `New section in ${x.name}`,
      fields: [{ name: "name", label: "Section", initial: String.fromCharCode(65 + own.length), required: true }],
      confirmLabel: "Add",
    });
    if (!v) return;
    const name = v.name.trim().toUpperCase();
    try {
      await api("sections/", { method: "POST", body: { school_class: x.id, academic_year: year.id, name } });
      toast.success(`${x.name}-${name} added.`);
      reload();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Card title="Classes" icon={Layers}>
      {!year ? <Empty icon={CalendarRange}>Add the academic year above first.</Empty>
        : ordered.length === 0 ? (
          <Empty title="No classes yet" icon={Layers} action={<Button icon={Sparkles} onPress={onQuick}>Set up Grade 1 to 12</Button>}>
            Create all your classes and sections in one go.
          </Empty>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={CARD_WIDTH + CARD_GAP} decelerationRate="fast"
            contentContainerStyle={{ gap: CARD_GAP, paddingVertical: 4, paddingRight: 4 }} style={{ marginHorizontal: -4, paddingHorizontal: 4 }}>
            {ordered.map((x, i) => {
              const own = sections.filter((s) => s.school_class === x.id);
              const students = own.reduce((n, s) => n + (s.student_count ?? 0), 0);
              return (
                <View key={x.id} style={{ width: CARD_WIDTH, borderRadius: 18, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, padding: 14 }}>
                  <Row justify="space-between" align="flex-start" style={{ marginBottom: 10 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: `hsl(${(i * 29 + 210) % 360}, 65%, 52%)` }}>
                      <Txt size="lg" weight="bold" color="#ffffff">{String(x.order)}</Txt>
                    </View>
                    <Row gap={0}>
                      <IconButton icon={Pencil} label={`Edit ${x.name}`} size={34} onPress={() => rename(x)} />
                      <IconButton icon={Trash2} label={`Delete ${x.name}`} size={34} color={tone.bad.fg} onPress={() => remove(x, own)} />
                    </Row>
                  </Row>
                  <Txt weight="semibold" numberOfLines={1}>{x.name}</Txt>
                  <Txt size="xs" soft style={{ marginBottom: 10 }}>{students} {students === 1 ? "student" : "students"}</Txt>
                  <Row gap={6} wrap>
                    {own.map((s) => (
                      <Press key={s.id} onPress={() => setSection(s)} accessibilityLabel={`${s.display_name}, ${s.class_teacher_name ? `class teacher ${s.class_teacher_name}` : "no class teacher yet"}`}
                        style={{ paddingHorizontal: 10, minHeight: 32, justifyContent: "center", borderRadius: 10, borderWidth: 1, borderStyle: s.class_teacher ? "solid" : "dashed", borderColor: s.class_teacher ? c.line : tone.warn.solid }}>
                        <Txt size="sm" weight="semibold">{s.display_name.replace(/\s+/g, "")}</Txt>
                      </Press>
                    ))}
                    <Press onPress={() => addSection(x, own)} accessibilityLabel={`Add a section to ${x.name}`}
                      style={{ width: 36, minHeight: 32, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: 1, borderStyle: "dashed", borderColor: c.line }}>
                      <Plus size={16} color={c.soft} />
                    </Press>
                  </Row>
                </View>
              );
            })}
          </ScrollView>
        )}
      {section && <SectionSheet section={section} teachers={teachers} onClose={() => setSection(null)} reload={reload} />}
    </Card>
  );
}

function SectionSheet({ section, teachers, onClose, reload }: { section: Section; teachers: Teacher[]; onClose: () => void; reload: () => void }) {
  const toast = useToast();
  const dialog = useDialog();
  const [teacher, setTeacher] = useState(section.class_teacher ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api(`sections/${section.id}/`, { method: "PATCH", body: { class_teacher: teacher || null } });
      toast.success(`${section.display_name} saved.`);
      reload();
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    onClose();
    const ok = await dialog.confirm({ title: `Delete ${section.display_name}?`, confirmLabel: "Delete", danger: true });
    if (!ok) return;
    try {
      await api(`sections/${section.id}/`, { method: "DELETE" });
      toast.success(`${section.display_name} deleted.`);
      reload();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Sheet open onClose={onClose} title={section.display_name} description={`${section.student_count ?? 0} students`}>
      <Stack gap={14}>
        <Select label="Class teacher" value={teacher} onChange={setTeacher} placeholder="None"
          options={[{ value: "", label: "None" }, ...teachers.map((t) => ({ value: t.id, label: t.name }))]} />
        <Row gap={8} justify="space-between" wrap>
          <Button variant="danger" icon={Trash2} onPress={remove}>Delete</Button>
          <Row gap={8}>
            <Button variant="secondary" onPress={onClose}>Cancel</Button>
            <Button busy={busy} onPress={save}>Save</Button>
          </Row>
        </Row>
      </Stack>
    </Sheet>
  );
}

/** One list of subjects for the whole school. */
function SubjectStrip({ subjects, reload }: { subjects: Subject[]; reload: () => void }) {
  const { c } = useTheme();
  const toast = useToast();
  const dialog = useDialog();

  const edit = async (s: Subject) => {
    const v = await dialog.prompt({
      title: `Edit ${s.name}`,
      fields: [
        { name: "name", label: "Subject", initial: s.name, required: true },
        { name: "code", label: "Code", initial: s.code ?? "" },
      ],
      confirmLabel: "Save",
    });
    if (!v) return;
    try {
      await api(`subjects/${s.id}/`, { method: "PATCH", body: { name: v.name, code: v.code } });
      toast.success(`${v.name} saved.`);
      reload();
    } catch (e) {
      toast.error(e);
    }
  };

  const remove = async (s: Subject) => {
    const ok = await dialog.confirm({ title: `Delete ${s.name}?`, body: "It is also taken off every section that studies it.", confirmLabel: "Delete", danger: true });
    if (!ok) return;
    try {
      await api(`subjects/${s.id}/`, { method: "DELETE" });
      toast.success(`${s.name} deleted.`);
      reload();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Card title="Subjects" icon={BookMarked}>
      {subjects.length === 0 ? <Empty icon={BookMarked}>No subjects yet. Use Add subject above.</Empty> : (
        <Row gap={8} wrap>
          {subjects.map((s) => (
            <View key={s.id} style={{ flexDirection: "row", alignItems: "center", borderRadius: 999, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, paddingLeft: 14 }}>
              <Press onPress={() => edit(s)} accessibilityLabel={`Edit ${s.name}`} style={{ minHeight: 36, flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Txt size="sm" weight="medium">{s.name}</Txt>
                {s.code ? <Txt size="xs" soft>{s.code}</Txt> : null}
              </Press>
              <IconButton icon={X} label={`Delete ${s.name}`} size={32} onPress={() => remove(s)} />
            </View>
          ))}
        </Row>
      )}
    </Card>
  );
}

/** Creates Grade 1 to 12 (or any range) and their sections in one go. */
function QuickSetup({ onClose, year, classes, sections, reload }: {
  onClose: () => void; year: AcademicYear | null; classes: SchoolClass[]; sections: Section[]; reload: () => void;
}) {
  const toast = useToast();
  const [v, setV] = useState({ prefix: nextClass(classes).prefix, from: "1", to: "12", letters: "A, B, C" });
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState("");
  const from = Number(v.from), to = Number(v.to);
  const letters = [...new Set(v.letters.split(/[\s,]+/).map((l) => l.trim().toUpperCase()).filter(Boolean))];
  const total = to >= from ? to - from + 1 : 0;

  const run = async () => {
    if (!year || !total) return;
    setError("");
    setDone(0);
    try {
      for (let n = from; n <= to; n++) {
        const name = `${v.prefix.trim()} ${n}`.trim();
        const found = classes.find((x) => x.name.toLowerCase() === name.toLowerCase());
        const made = found ?? await api<SchoolClass>("classes/", { method: "POST", body: { name, order: n } });
        for (const letter of letters) {
          if (sections.some((s) => s.school_class === made.id && s.name.toUpperCase() === letter)) continue;
          await api("sections/", { method: "POST", body: { school_class: made.id, academic_year: year.id, name: letter } });
        }
        setDone(n - from + 1);
      }
      toast.success(`${total} classes are ready.`);
      onClose();
    } catch (e) {
      setError(errorText(e, "Something went wrong. What was made so far is kept."));
    } finally {
      setDone(null);
      reload();
    }
  };

  return (
    <Sheet open onClose={onClose} title="Set up classes">
      <Stack gap={12}>
        <Grid cols={3} gap={10}>
          <Field label="Name" value={v.prefix} onChangeText={(t) => setV({ ...v, prefix: t })} />
          <Field label="From" keyboardType="number-pad" value={v.from} onChangeText={(t) => setV({ ...v, from: t })} />
          <Field label="To" keyboardType="number-pad" value={v.to} onChangeText={(t) => setV({ ...v, to: t })} />
          <Span span={3}><Field label="Sections in each" placeholder="A, B, C" autoCapitalize="characters" value={v.letters} onChangeText={(t) => setV({ ...v, letters: t })} /></Span>
        </Grid>
        {total > 0 && (
          <Txt size="sm" soft>
            {`${v.prefix} ${from}${total > 1 ? ` to ${v.prefix} ${to}` : ""}${letters.length ? `, each with ${letters.join(", ")}` : ""}. Ones you already have are skipped.`}
          </Txt>
        )}
        {error ? <Alert>{error}</Alert> : null}
        <Row gap={8} justify="flex-end">
          <Button variant="secondary" onPress={onClose}>Cancel</Button>
          <Button busy={done !== null} disabled={!total || !year} onPress={run}>{done !== null ? `${done} of ${total}` : `Create ${total} classes`}</Button>
        </Row>
      </Stack>
    </Sheet>
  );
}

function AssignmentsCard({ sections, subjects, teachers }: { sections: Section[]; subjects: Subject[]; teachers: Teacher[] }) {
  const [sectionId, setSectionId] = useState("");
  const current = sectionId || sections[0]?.id || "";
  const assignments = useApi<Page<SectionSubject>>(current ? `section-subjects/?section=${current}` : null);
  const [adding, setAdding] = useState({ subject: "", teacher: "" });
  const [busy, setBusy] = useState(false);
  const list = rows(assignments.data);
  const missing = subjects.filter((s) => !list.some((r) => r.subject === s.id));
  const teacherOptions = [{ value: "", label: "Not assigned" }, ...teachers.map((t) => ({ value: t.id, label: t.name }))];
  const toast = useToast();

  const changeTeacher = async (row: SectionSubject, teacher: string) => {
    try {
      await api(`section-subjects/${row.id}/`, { method: "PATCH", body: { teacher: teacher || null } });
      toast.success(`Teacher saved for ${row.subject_name}.`);
    } catch (e) {
      toast.error(e);
    }
    assignments.reload();
  };

  const remove = async (row: SectionSubject) => {
    try {
      await api(`section-subjects/${row.id}/`, { method: "DELETE" });
      toast.success(`${row.subject_name} removed.`);
    } catch (e) {
      toast.error(e);
    }
    assignments.reload();
  };

  const add = async () => {
    setBusy(true);
    try {
      await api("section-subjects/", { method: "POST", body: compact({ ...adding, section: current }) });
      setAdding({ subject: "", teacher: "" });
      assignments.reload();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Who teaches what" icon={UserCheck}>
      {sections.length === 0 ? <Empty icon={UserCheck}>Add a class with sections first.</Empty> : (
        <Stack gap={12}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {sections.map((s) => <Chip key={s.id} label={s.display_name.replace(/\s+/g, "")} on={s.id === current} onPress={() => setSectionId(s.id)} />)}
          </ScrollView>
          {list.length > 0 && (
            <DataTable rows={list} rowKey={(r) => r.id}
              columns={[
                { header: "Subject", cell: (r) => <Txt size="sm" weight="medium">{r.subject_name}</Txt> },
                { header: "Teacher", flex: 2, cell: (r) => <View style={{ minWidth: 160, flex: 1 }}><Select value={r.teacher ?? ""} onChange={(t) => changeTeacher(r, t)} options={teacherOptions} placeholder="Not assigned" /></View> },
                { header: "", cell: (r) => <IconButton icon={X} label={`Remove ${r.subject_name}`} size={34} onPress={() => remove(r)} /> },
              ]} />
          )}
          {missing.length > 0 && (
            <Grid cols={{ base: 1, sm: 3 }} gap={10}>
              <Select value={adding.subject} onChange={(t) => setAdding({ ...adding, subject: t })} placeholder="Add a subject…" options={missing.map((s) => ({ value: s.id, label: s.name }))} />
              <Select value={adding.teacher} onChange={(t) => setAdding({ ...adding, teacher: t })} options={teacherOptions} placeholder="Not assigned" />
              <Button variant="soft" icon={Plus} busy={busy} disabled={!adding.subject} onPress={add}>Add</Button>
            </Grid>
          )}
        </Stack>
      )}
    </Card>
  );
}
