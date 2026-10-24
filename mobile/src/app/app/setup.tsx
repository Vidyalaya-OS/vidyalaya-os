import { ArrowRight, BookMarked, CalendarRange, Layers, Rows3, UserCheck } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { DateField } from "@/components/Calendar";
import { NewClassWizard, NewSubjectWizard } from "@/components/SetupWizards";
import { useToast } from "@/components/toast";
import { Alert, Badge, Button, Card, DataTable, Empty, Field, Grid, LinkText, PageHeader, Row, Screen, Select, Span, Stack, Stagger, Txt } from "@/components/ui";
import { api, Page } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import type { AcademicYear, SchoolClass, Section, SectionSubject, Subject, Teacher } from "@/lib/types";
import { rows, useApi } from "@/lib/useApi";
import { compact, useForm } from "@/lib/useForm";

export default function SetupPage() {
  const years = useApi<Page<AcademicYear>>("academic-years/");
  const classes = useApi<Page<SchoolClass>>("classes/");
  const subjects = useApi<Page<Subject>>("subjects/");
  const sections = useApi<Page<Section>>("sections/");
  const teachers = useApi<Page<Teacher>>("teachers/?status=active");
  const [wizard, setWizard] = useState<"class" | "subject" | null>(null);
  const [assignVersion, setAssignVersion] = useState(0);
  const data = {
    year: rows(years.data).find((y) => y.is_current) ?? null,
    classes: rows(classes.data),
    subjects: rows(subjects.data),
    sections: rows(sections.data),
    teachers: rows(teachers.data),
    reload: () => { classes.reload(); subjects.reload(); sections.reload(); setAssignVersion((v) => v + 1); },
  };

  return (
    <Screen>
      <PageHeader title="Classes & subjects" subtitle="Build the school in order: year, classes and sections, subjects, then who teaches what."
        actions={<>
          <Button icon={Layers} onPress={() => setWizard("class")}>New class</Button>
          <Button variant="secondary" icon={BookMarked} onPress={() => setWizard("subject")}>New subject</Button>
        </>} />
      <Stack gap={18}>
        <OnboardingGuidelines onClass={() => setWizard("class")} onSubject={() => setWizard("subject")} />
        <Grid cols={{ base: 1, lg: 2 }} gap={18}>
          <YearsCard years={rows(years.data)} reload={years.reload} />
          <ClassesCard classes={rows(classes.data)} reload={() => { classes.reload(); sections.reload(); }} />
          <SectionsCard sections={rows(sections.data)} classes={rows(classes.data)} teachers={rows(teachers.data)} currentYear={data.year} reload={sections.reload} />
          <SubjectsCard subjects={rows(subjects.data)} reload={subjects.reload} />
        </Grid>
        <AssignmentsCard key={assignVersion} sections={rows(sections.data)} subjects={rows(subjects.data)} teachers={rows(teachers.data)} />
      </Stack>
      <NewClassWizard open={wizard === "class"} onClose={() => setWizard(null)} data={data} />
      <NewSubjectWizard open={wizard === "subject"} onClose={() => setWizard(null)} data={data} />
    </Screen>
  );
}

function StepTitle({ n, children }: { n: number; children: string }) {
  const { c } = useTheme();
  return (
    <Row gap={8} wrap>
      <View style={{ borderRadius: 6, backgroundColor: c.brandSoft, paddingHorizontal: 6, paddingVertical: 2 }}><Txt size="xs" weight="bold" color={c.brand}>Step {n}</Txt></View>
      <Txt weight="semibold">{children}</Txt>
    </Row>
  );
}

/** The two checklists an admin follows when the school grows. */
function OnboardingGuidelines({ onClass, onSubject }: { onClass: () => void; onSubject: () => void }) {
  const { c } = useTheme();
  const lists = [
    {
      title: "Onboarding a new class",
      icon: Layers,
      steps: ["Name the class and set its order", "Add its sections (A, B) with a class teacher", "Choose the subjects it studies", "Allocate a teacher to each subject", "Then: timetable, students and fees"],
      action: onClass,
      label: "Start the class guide",
    },
    {
      title: "Onboarding a new subject",
      icon: BookMarked,
      steps: ["Add it once for the school, with a short code", "Choose the sections that study it", "Allocate a teacher in each section", "Then: give it periods on the timetable"],
      action: onSubject,
      label: "Start the subject guide",
    },
  ];
  return (
    <Grid cols={{ base: 1, md: 2 }} gap={14}>
      {lists.map((l) => (
        <Card key={l.title} title={l.title} icon={l.icon} description="Follow these steps in order so nothing is left half done.">
          <Stagger gap={6} style={{ marginBottom: 14 }}>
            {l.steps.map((s, i) => (
              <Row key={s} gap={10}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: c.muted, alignItems: "center", justifyContent: "center" }}><Txt size="xs" weight="bold" soft>{i + 1}</Txt></View>
                <Txt size="sm" style={{ flex: 1 }}>{s}</Txt>
              </Row>
            ))}
          </Stagger>
          <Button variant="soft" size="sm" iconRight={ArrowRight} onPress={l.action} style={{ alignSelf: "flex-start" }}>{l.label}</Button>
        </Card>
      ))}
    </Grid>
  );
}

function YearsCard({ years, reload }: { years: AcademicYear[]; reload: () => void }) {
  const { c } = useTheme();
  const form = useForm({ name: "", start_date: "", end_date: "" });
  const toast = useToast();
  const makeCurrent = async (y: AcademicYear) => {
    try {
      await api(`academic-years/${y.id}/`, { method: "PATCH", body: { is_current: true } });
      toast.success(`${y.name} is now the current year.`);
      reload();
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <Card title={<StepTitle n={1}>Academic years</StepTitle>} description="Set the current year first." icon={CalendarRange}>
      {years.length === 0 ? <Empty>No academic year yet.</Empty> : (
        <Stack gap={8} style={{ marginBottom: 14 }}>
          {years.map((y) => (
            <Row key={y.id} justify="space-between" gap={10} style={{ borderRadius: 12, borderWidth: 1, borderColor: c.line, paddingHorizontal: 12, paddingVertical: 10 }}>
              <Txt size="sm" style={{ flex: 1 }}><Txt size="sm" weight="medium">{y.name}</Txt> <Txt size="sm" soft>{y.start_date} to {y.end_date}</Txt></Txt>
              {y.is_current ? <Badge tone="good">Current</Badge> : <LinkText onPress={() => makeCurrent(y)}>Make current</LinkText>}
            </Row>
          ))}
        </Stack>
      )}
      <Grid cols={{ base: 1, sm: 3 }} gap={12}>
        <Field label="Name" placeholder="2026-27" {...form.bind("name")} />
        <DateField label="Starts" value={form.values.start_date} onChange={(v) => form.set("start_date", v)} error={form.errors.start_date} />
        <DateField label="Ends" min={form.values.start_date || undefined} value={form.values.end_date} onChange={(v) => form.set("end_date", v)} error={form.errors.end_date} />
        {form.error && <Span span={3}><Alert>{form.error}</Alert></Span>}
      </Grid>
      <Button variant="secondary" busy={form.busy} style={{ alignSelf: "flex-start", marginTop: 12 }}
        onPress={form.submit((v) => api("academic-years/", { method: "POST", body: { ...v, is_current: years.length === 0 } }), reload)}>Add year</Button>
    </Card>
  );
}

function ClassesCard({ classes, reload }: { classes: SchoolClass[]; reload: () => void }) {
  const form = useForm({ name: "", order: "" });
  return (
    <Card title={<StepTitle n={2}>Classes</StepTitle>} description="Grade 1, Grade 2… in order." icon={Layers}>
      {classes.length === 0 ? <Empty>No classes yet. Add Grade 1, Grade 2 and so on.</Empty> : (
        <Row wrap gap={6} style={{ marginBottom: 14 }}>{classes.map((x) => <Badge key={x.id}>{x.name}</Badge>)}</Row>
      )}
      <Grid cols={3} gap={12}>
        <Span span={2}><Field label="Class name" placeholder="Grade 5" {...form.bind("name")} /></Span>
        <Field label="Order" keyboardType="number-pad" placeholder={String(classes.length + 1)} {...form.bind("order")} />
        {form.error && <Span span={3}><Alert>{form.error}</Alert></Span>}
      </Grid>
      <Button variant="secondary" busy={form.busy} style={{ alignSelf: "flex-start", marginTop: 12 }}
        onPress={form.submit((v) => api("classes/", { method: "POST", body: { name: v.name, order: Number(v.order || classes.length + 1) } }), reload)}>Add class</Button>
    </Card>
  );
}

function SubjectsCard({ subjects, reload }: { subjects: Subject[]; reload: () => void }) {
  const form = useForm({ name: "", code: "" });
  return (
    <Card title={<StepTitle n={4}>Subjects</StepTitle>} description="One list for the whole school." icon={BookMarked}>
      {subjects.length === 0 ? <Empty>No subjects yet.</Empty> : (
        <Row wrap gap={6} style={{ marginBottom: 14 }}>{subjects.map((s) => <Badge key={s.id}>{`${s.name}${s.code ? ` (${s.code})` : ""}`}</Badge>)}</Row>
      )}
      <Grid cols={3} gap={12}>
        <Span span={2}><Field label="Subject" placeholder="Maths" {...form.bind("name")} /></Span>
        <Field label="Code" optional placeholder="MATH" autoCapitalize="characters" {...form.bind("code")} />
        {form.error && <Span span={3}><Alert>{form.error}</Alert></Span>}
      </Grid>
      <Button variant="secondary" busy={form.busy} style={{ alignSelf: "flex-start", marginTop: 12 }}
        onPress={form.submit((v) => api("subjects/", { method: "POST", body: compact(v) }), reload)}>Add subject</Button>
    </Card>
  );
}

function SectionsCard({ sections, classes, teachers, currentYear, reload }: { sections: Section[]; classes: SchoolClass[]; teachers: Teacher[]; currentYear: AcademicYear | null; reload: () => void }) {
  const form = useForm({ school_class: "", name: "", class_teacher: "" });
  const toast = useToast();
  const teacherOptions = [{ value: "", label: "None" }, ...teachers.map((t) => ({ value: t.id, label: t.name }))];
  const setTeacher = async (section: Section, teacher: string) => {
    try {
      await api(`sections/${section.id}/`, { method: "PATCH", body: { class_teacher: teacher || null } });
      toast.success(`Class teacher saved for ${section.display_name}.`);
    } catch (e) {
      toast.error(e);
    }
    reload();
  };
  return (
    <Card title={<StepTitle n={3}>{`Sections${currentYear ? ` for ${currentYear.name}` : ""}`}</StepTitle>} description="Each with a class teacher, who takes the roll call." icon={Rows3}>
      {!currentYear ? <Empty>Add an academic year first.</Empty> : (
        <>
          {sections.length === 0 ? <Empty>No sections yet. Add 5-A, 5-B and so on.</Empty> : (
            <DataTable rows={sections} rowKey={(s) => s.id}
              columns={[
                { header: "Section", cell: (s) => <Txt size="sm" weight="medium">{s.display_name}</Txt> },
                { header: "Students", align: "right", cell: (s) => String(s.student_count) },
                { header: "Class teacher", flex: 2, cell: (s) => <View style={{ minWidth: 160, flex: 1 }}><Select value={s.class_teacher ?? ""} onChange={(v) => setTeacher(s, v)} options={teacherOptions} placeholder="None" /></View> },
              ]} />
          )}
          <Grid cols={{ base: 1, sm: 3 }} gap={12} style={{ marginTop: 14 }}>
            <Select label="Class" {...form.bind("school_class")} options={classes.map((x) => ({ value: x.id, label: x.name }))} />
            <Field label="Section" placeholder="A" autoCapitalize="characters" {...form.bind("name")} />
            <Select label="Class teacher" {...form.bind("class_teacher")} options={teacherOptions} placeholder="None" />
            {form.error && <Span span={3}><Alert>{form.error}</Alert></Span>}
          </Grid>
          <Button variant="secondary" busy={form.busy} style={{ alignSelf: "flex-start", marginTop: 12 }}
            onPress={form.submit((v) => api("sections/", { method: "POST", body: compact({ ...v, academic_year: currentYear.id }) }), reload)}>Add section</Button>
        </>
      )}
    </Card>
  );
}

function AssignmentsCard({ sections, subjects, teachers }: { sections: Section[]; subjects: Subject[]; teachers: Teacher[] }) {
  const [sectionId, setSectionId] = useState("");
  const current = sectionId || sections[0]?.id || "";
  const assignments = useApi<Page<SectionSubject>>(current ? `section-subjects/?section=${current}` : null);
  const form = useForm({ subject: "", teacher: "" });
  const list = rows(assignments.data);
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

  return (
    <Card title={<StepTitle n={5}>Who teaches what</StepTitle>} description="Give each section its subjects, then allocate a teacher to each." icon={UserCheck}>
      {sections.length === 0 ? <Empty>Add sections first.</Empty> : (
        <>
          <View style={{ maxWidth: 320, marginBottom: 14 }}>
            <Select label="Section" value={current} onChange={setSectionId} options={sections.map((s) => ({ value: s.id, label: s.display_name }))} />
          </View>
          {list.length === 0 ? <Empty>No subjects for this section yet.</Empty> : (
            <DataTable rows={list} rowKey={(r) => r.id}
              columns={[
                { header: "Subject", cell: (r) => <Txt size="sm" weight="medium">{r.subject_name}</Txt> },
                { header: "Teacher", flex: 2, cell: (r) => <View style={{ minWidth: 160, flex: 1 }}><Select value={r.teacher ?? ""} onChange={(v) => changeTeacher(r, v)} options={teacherOptions} placeholder="Not assigned" /></View> },
              ]} />
          )}
          <Grid cols={{ base: 1, sm: 3 }} gap={12} style={{ marginTop: 14 }}>
            <Select label="Subject" {...form.bind("subject")} options={subjects.filter((s) => !list.some((r) => r.subject === s.id)).map((s) => ({ value: s.id, label: s.name }))} />
            <Select label="Teacher" {...form.bind("teacher")} options={teacherOptions} placeholder="Not assigned" />
            <View style={{ justifyContent: "flex-end" }}>
              <Button variant="secondary" busy={form.busy} disabled={!form.values.subject}
                onPress={form.submit((v) => api("section-subjects/", { method: "POST", body: compact({ ...v, section: current }) }), assignments.reload)}>Add subject to section</Button>
            </View>
            {form.error && <Span span={3}><Alert>{form.error}</Alert></Span>}
          </Grid>
        </>
      )}
    </Card>
  );
}
