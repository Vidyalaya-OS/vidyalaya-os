import { FileSpreadsheet } from "lucide-react-native";
import { useState } from "react";
import { TextInput, View } from "react-native";
import { DateField } from "@/components/Calendar";
import { useDialog } from "@/components/dialog";
import { useStaffSections } from "@/components/sections";
import { useToast } from "@/components/toast";
import { Alert, Badge, Button, Card, DataTable, Empty, Enter, ErrorState, Field, Grid, LinkText, Loading, PageHeader, Row, Screen, Select, Stack, Txt, go } from "@/components/ui";
import { api, ApiError, Page } from "@/lib/api";
import { formatDate, num } from "@/lib/format";
import { useSession } from "@/lib/session";
import { FONTS, useTheme } from "@/lib/theme";
import type { AcademicYear, Exam, ExamTerm, GradeBand, GradeScale, SchoolClass, Subject } from "@/lib/types";
import { rows, useApi } from "@/lib/useApi";
import { useForm } from "@/lib/useForm";

const DEFAULT_BANDS: GradeBand[] = [
  { min: 91, grade: "A1" }, { min: 81, grade: "A2" }, { min: 71, grade: "B1" }, { min: 61, grade: "B2" },
  { min: 51, grade: "C1" }, { min: 41, grade: "C2" }, { min: 33, grade: "D" }, { min: 0, grade: "E" },
];

export default function ExamsPage() {
  const { hasRole } = useSession();
  const isAdmin = hasRole("admin");
  const terms = useApi<ExamTerm[]>("exam-terms/");
  const [term, setTerm] = useState("");
  const chosen = term || terms.data?.[0]?.id || "";
  const exams = useApi<Exam[]>(chosen ? `exams/?exam_term=${chosen}${isAdmin ? "" : "&mine=true"}` : null);

  return (
    <Screen>
      <PageHeader title="Tests & marks" subtitle={isAdmin ? "Set up terms and tests, then publish results when marks are in." : "Enter marks for the tests of subjects you teach."} />
      <Stack gap={16}>
        {isAdmin && (
          <Grid cols={{ base: 1, lg: 2 }} gap={16}>
            <TermsCard terms={terms.data ?? []} reload={terms.reload} />
            <GradeScaleCard />
          </Grid>
        )}
        <Card title="Tests" icon={FileSpreadsheet}>
          {terms.data && terms.data.length > 0 && (
            <Select label="Term" value={chosen} onChange={setTerm} style={{ marginBottom: 14, maxWidth: 360 }} options={terms.data.map((t) => ({ value: t.id, label: t.name }))} />
          )}
          {terms.error && !terms.data ? <ErrorState message={terms.error} onRetry={terms.reload} /> : !terms.data ? <Loading variant="table" /> : terms.data.length === 0 ? <Empty>{isAdmin ? "Add an exam term first, such as Unit test 1." : "No exam terms yet."}</Empty> : (
            <>
              {isAdmin && chosen && <CreateTests term={chosen} onDone={exams.reload} />}
              {exams.error && !exams.data ? <ErrorState message={exams.error} onRetry={exams.reload} /> : !exams.data ? <Loading variant="table" /> : exams.data.length === 0 ? <Empty>No tests in this term yet.</Empty> : (
                <ExamTable exams={exams.data} isAdmin={isAdmin} reload={exams.reload} />
              )}
            </>
          )}
        </Card>
      </Stack>
    </Screen>
  );
}

function ExamTable({ exams, isAdmin, reload }: { exams: Exam[]; isAdmin: boolean; reload: () => void }) {
  const { tone } = useTheme();
  const toast = useToast();
  const dialog = useDialog();
  const act = async (e: Exam, what: "publish" | "unpublish") => {
    if (what === "unpublish" && !(await dialog.confirm({ title: "Unpublish these results?", body: "Students and parents stop seeing them, and the marks unlock for editing.", confirmLabel: "Unpublish", danger: true }))) return;
    try {
      await api(`exams/${e.id}/${what}/`, { method: "POST", body: {} });
      toast.success(what === "publish" ? `${e.subject_name} results published for ${e.section_name}.` : "Results unpublished. Marks can be edited again.");
    } catch (err) {
      const missing = err instanceof ApiError && what === "publish" ? (err.data as { missing?: string[] })?.missing : undefined;
      if (missing) {
        const ok = await dialog.confirm({
          title: "Some marks are missing",
          body: `${missing.length} mark${missing.length === 1 ? " is" : "s are"} not entered yet (${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "…" : ""}). Publish anyway?`,
          confirmLabel: "Publish anyway",
        });
        if (ok) await api(`exams/${e.id}/publish/`, { method: "POST", body: { allow_missing: true } }).then(() => toast.success("Results published."), (x) => toast.error(x));
      } else toast.error(err);
    }
    reload();
  };
  return (
    <DataTable rows={exams} rowKey={(e) => e.id} onRowPress={(e) => go(`/app/exams/${e.id}`)}
      columns={[
        { header: "Subject", flex: 1.4, cell: (e) => <View><Txt size="sm" weight="semibold">{e.subject_name}</Txt><Txt size="xs" soft>{e.section_name}</Txt></View> },
        { header: "Date", cell: (e) => formatDate(e.date) },
        { header: "Out of", align: "right", cell: (e) => num(e.max_marks) },
        { header: "Marks in", align: "right", cell: (e) => `${e.marks_entered} / ${e.students}` },
        { header: "Status", cell: (e) => <Badge tone={e.status === "published" ? "good" : "warn"}>{e.status === "published" ? "Published" : "Entering marks"}</Badge> },
        {
          header: "", flex: 1.4,
          cell: (e) => (
            <Row gap={16} wrap>
              <LinkText href={`/app/exams/${e.id}`}>{e.status === "published" ? "View" : "Enter marks"}</LinkText>
              {isAdmin && e.status === "draft" && <LinkText onPress={() => act(e, "publish")}>Publish</LinkText>}
              {isAdmin && e.status === "published" && <LinkText color={tone.bad.solid} onPress={() => act(e, "unpublish")}>Unpublish</LinkText>}
            </Row>
          ),
        },
      ]} />
  );
}

function CreateTests({ term, onDone }: { term: string; onDone: () => void }) {
  const { c } = useTheme();
  const classes = useApi<Page<SchoolClass>>("classes/");
  const sections = useStaffSections();
  const subjects = useApi<Page<Subject>>("subjects/");
  const [open, setOpen] = useState<"" | "class" | "one">("");
  const form = useForm({ school_class: "", section: "", subject: "", max_marks: "100", pass_marks: "", date: "" });
  const toast = useToast();
  if (!open) {
    return (
      <Row wrap gap={8} style={{ marginBottom: 14 }}>
        <Button variant="secondary" onPress={() => setOpen("class")}>Add tests for a whole class</Button>
        <Button variant="ghost" onPress={() => setOpen("one")}>Add one test</Button>
      </Row>
    );
  }
  const common = { max_marks: form.values.max_marks, pass_marks: form.values.pass_marks || null, date: form.values.date || null };
  const submit = form.submit(async (v) => {
    if (open === "class") {
      const res = await api<{ created: number }>(`exam-terms/${term}/create-exams/`, { method: "POST", body: { school_class: v.school_class, ...common } });
      toast.success(`${res.created} tests added, one per subject taught in each section.`);
    } else {
      await api("exams/", { method: "POST", body: { exam_term: term, section: v.section, subject: v.subject, ...common } });
      toast.success("Test added.");
    }
  }, () => { setOpen(""); onDone(); });
  return (
    <Enter style={{ marginBottom: 16 }}>
      <View style={{ borderRadius: 18, borderWidth: 1, borderColor: c.line, backgroundColor: c.muted + "66", padding: 14, gap: 12 }}>
        {form.error && <Alert>{form.error}</Alert>}
        <Grid cols={{ base: 1, md: 3 }} gap={12}>
          {open === "class" ? (
            <Select label="Class" {...form.bind("school_class")} options={rows(classes.data).map((x) => ({ value: x.id, label: x.name }))} />
          ) : (
            <>
              <Select label="Section" {...form.bind("section")} options={sections.map((s) => ({ value: s.id, label: s.name }))} />
              <Select label="Subject" {...form.bind("subject")} options={rows(subjects.data).map((s) => ({ value: s.id, label: s.name }))} />
            </>
          )}
          <Field label="Maximum marks" keyboardType="decimal-pad" {...form.bind("max_marks")} />
          <Field label="Pass marks" optional keyboardType="decimal-pad" {...form.bind("pass_marks")} />
          <DateField label="Date" optional clearable value={form.values.date} onChange={(v) => form.set("date", v)} error={form.errors.date} />
        </Grid>
        <Row gap={8}>
          <Button busy={form.busy} onPress={submit}>Add</Button>
          <Button variant="ghost" onPress={() => setOpen("")}>Cancel</Button>
        </Row>
      </View>
    </Enter>
  );
}

function TermsCard({ terms, reload }: { terms: ExamTerm[]; reload: () => void }) {
  const { c } = useTheme();
  const years = useApi<Page<AcademicYear>>("academic-years/");
  const current = rows(years.data).find((y) => y.is_current);
  const form = useForm({ name: "", start_date: "", end_date: "" });
  return (
    <Card title={`Exam terms${current ? ` (${current.name})` : ""}`}>
      {terms.length > 0 && (
        <Stack gap={8} style={{ marginBottom: 14 }}>
          {terms.map((t) => (
            <Row key={t.id} justify="space-between" gap={12} style={{ borderRadius: 12, borderWidth: 1, borderColor: c.line, paddingHorizontal: 12, paddingVertical: 10 }}>
              <Txt size="sm" weight="medium">{t.name}</Txt>
              <Txt size="sm" soft>{t.start_date ? `${formatDate(t.start_date)} to ${formatDate(t.end_date)}` : "No dates"}</Txt>
            </Row>
          ))}
        </Stack>
      )}
      {!current ? <Txt size="sm" soft>Set the current academic year first.</Txt> : (
        <Stack gap={12}>
          {form.error && <Alert>{form.error}</Alert>}
          <Grid cols={{ base: 1, md: 3 }} gap={12}>
            <Field label="Name" placeholder="Half-yearly" {...form.bind("name")} />
            <DateField label="Starts" optional clearable value={form.values.start_date} onChange={(v) => form.set("start_date", v)} />
            <DateField label="Ends" optional clearable value={form.values.end_date} onChange={(v) => form.set("end_date", v)} />
          </Grid>
          <Txt size="xs" soft>The dates set which days count towards attendance on the report card.</Txt>
          <Button variant="secondary" busy={form.busy} onPress={form.submit((v) => api("exam-terms/", { method: "POST", body: { academic_year: current.id, name: v.name, start_date: v.start_date || null, end_date: v.end_date || null, order: terms.length + 1 } }), reload)}>Add term</Button>
        </Stack>
      )}
    </Card>
  );
}

function GradeScaleCard() {
  const { c } = useTheme();
  const scales = useApi<GradeScale[]>("grade-scales/");
  const current = scales.data?.find((s) => s.is_default) ?? scales.data?.[0];
  const [text, setText] = useState<string | null>(null);
  const toast = useToast();
  const bands = current?.bands ?? DEFAULT_BANDS;
  const shown = text ?? bands.map((b) => `${b.min} ${b.grade}`).join("\n");

  const save = async () => {
    const parsed = shown.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
      const [min, ...grade] = l.split(/\s+/);
      return { min: Number(min), grade: grade.join(" ") };
    });
    try {
      if (current) await api(`grade-scales/${current.id}/`, { method: "PATCH", body: { bands: parsed } });
      else await api("grade-scales/", { method: "POST", body: { name: "School scale", bands: parsed, is_default: true } });
      toast.success("Grading scale saved.");
      setText(null);
      scales.reload();
    } catch (e) {
      toast.error(e, "Could not save the grading scale.");
    }
  };

  return (
    <Card title="Grading scale">
      <Txt size="sm" soft style={{ marginBottom: 10 }}>One band per line: the lowest percentage, then the grade. {current ? "" : "These are the defaults until you save your own."}</Txt>
      <TextInput multiline value={shown} onChangeText={setText} accessibilityLabel="Grade bands" autoCapitalize="characters" autoCorrect={false} textAlignVertical="top"
        style={{ minHeight: 190, borderRadius: 12, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, paddingHorizontal: 14, paddingVertical: 10, fontFamily: FONTS.medium, fontSize: 15, lineHeight: 22, color: c.ink }} />
      <Row gap={8} style={{ marginTop: 12 }}>
        <Button variant="secondary" onPress={save}>Save scale</Button>
        <Button variant="secondary" onPress={() => go("/app/report-cards")}>Report cards</Button>
      </Row>
    </Card>
  );
}
