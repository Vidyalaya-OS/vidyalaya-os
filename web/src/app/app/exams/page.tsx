"use client";

import { FileSpreadsheet } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useDialog } from "@/components/dialog";
import { useStaffSections } from "@/components/sections";
import { useToast } from "@/components/toast";
import { Alert, Badge, Button, ButtonLink, Card, DataTable, Empty, ErrorState, Field, Loading, PageHeader, Select } from "@/components/ui";
import { api, ApiError, Page } from "@/lib/api";
import { formatDate, num } from "@/lib/format";
import { useSession } from "@/lib/session";
import { AcademicYear, Exam, ExamTerm, GradeBand, GradeScale, SchoolClass, Subject } from "@/lib/types";
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
    <>
      <PageHeader title="Tests & marks" subtitle={isAdmin ? "Set up terms and tests, then publish results when marks are in." : "Enter marks for the tests of subjects you teach."} />
      <div className="grid gap-5">
        {isAdmin && (
          <div className="grid gap-5 lg:grid-cols-2">
            <TermsCard terms={terms.data ?? []} reload={terms.reload} />
            <GradeScaleCard />
          </div>
        )}
        <Card
          title="Tests"
          icon={<FileSpreadsheet aria-hidden />}
          actions={terms.data && terms.data.length > 0 ? (
            <Select label="Term" value={chosen} onChange={(e) => setTerm(e.target.value)}>
              {terms.data.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          ) : undefined}
        >
          {terms.error && !terms.data ? <ErrorState message={terms.error} onRetry={terms.reload} /> : !terms.data ? <Loading variant="table" /> : terms.data.length === 0 ? <Empty>{isAdmin ? "Add an exam term first, such as Unit test 1." : "No exam terms yet."}</Empty> : (
            <>
              {isAdmin && chosen && <CreateTests term={chosen} onDone={exams.reload} />}
              {exams.error && !exams.data ? <ErrorState message={exams.error} onRetry={exams.reload} /> : !exams.data ? <Loading variant="table" /> : exams.data.length === 0 ? <Empty>No tests in this term yet.</Empty> : (
                <ExamTable exams={exams.data} isAdmin={isAdmin} reload={exams.reload} />
              )}
            </>
          )}
        </Card>
      </div>
    </>
  );
}

function ExamTable({ exams, isAdmin, reload }: { exams: Exam[]; isAdmin: boolean; reload: () => void }) {
  const toast = useToast();
  const dialog = useDialog();
  const act = async (e: Exam, what: "publish" | "unpublish") => {
    if (what === "unpublish" && !(await dialog.confirm({ title: "Unpublish these results?", body: "Students and parents stop seeing them, and the marks unlock for editing.", confirmLabel: "Unpublish", danger: true }))) return;
    try {
      await api(`exams/${e.id}/${what}/`, { method: "POST", body: {} });
      toast.success(what === "publish" ? `${e.subject_name} results published for ${e.section_name}.` : "Results unpublished. Marks can be edited again.");
    } catch (err) {
      if (err instanceof ApiError && what === "publish" && (err.data as { missing?: string[] })?.missing) {
        const missing = (err.data as { missing: string[] }).missing;
        const ok = await dialog.confirm({
          title: "Some marks are missing",
          body: `${missing.length} mark${missing.length === 1 ? " is" : "s are"} not entered yet (${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "…" : ""}). Publish anyway?`,
          confirmLabel: "Publish anyway",
        });
        if (ok) {
          await api(`exams/${e.id}/publish/`, { method: "POST", body: { allow_missing: true } }).then(() => toast.success("Results published."), (x) => toast.error(x));
        }
      } else toast.error(err);
    }
    reload();
  };
  return (
    <>
      <DataTable
        rows={exams}
        rowKey={(e) => e.id}
        columns={[
          { header: "Section", cell: (e) => e.section_name },
          { header: "Subject", cell: (e) => <Link className="font-medium text-brand" href={`/app/exams/${e.id}`}>{e.subject_name}</Link> },
          { header: "Date", cell: (e) => formatDate(e.date) },
          { header: "Out of", cell: (e) => num(e.max_marks) },
          { header: "Marks in", cell: (e) => `${e.marks_entered} / ${e.students}` },
          { header: "Status", cell: (e) => <Badge tone={e.status === "published" ? "good" : "warn"}>{e.status === "published" ? "Published" : "Entering marks"}</Badge> },
          {
            header: "Actions",
            cell: (e) => (
              <div className="flex justify-end gap-4 text-sm font-medium sm:justify-start">
                <Link className="text-brand" href={`/app/exams/${e.id}`}>{e.status === "published" ? "View" : "Enter marks"}</Link>
                {isAdmin && e.status === "draft" && <button className="text-brand" onClick={() => act(e, "publish")}>Publish</button>}
                {isAdmin && e.status === "published" && <button className="text-red-600" onClick={() => act(e, "unpublish")}>Unpublish</button>}
              </div>
            ),
          },
        ]}
      />
    </>
  );
}

function CreateTests({ term, onDone }: { term: string; onDone: () => void }) {
  const classes = useApi<Page<SchoolClass>>("classes/");
  const sections = useStaffSections();
  const subjects = useApi<Page<Subject>>("subjects/");
  const [open, setOpen] = useState<"" | "class" | "one">("");
  const form = useForm({ school_class: "", section: "", subject: "", max_marks: "100", pass_marks: "", date: "" });
  const toast = useToast();
  if (!open) {
    return (
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setOpen("class")}>Add tests for a whole class</Button>
        <Button variant="ghost" onClick={() => setOpen("one")}>Add one test</Button>
      </div>
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
    <form onSubmit={submit} className="mb-5 grid animate-enter gap-3 rounded-2xl border border-line bg-muted/40 p-4 sm:grid-cols-3">
      {form.error && <div className="sm:col-span-3"><Alert>{form.error}</Alert></div>}
      {open === "class" ? (
        <Select label="Class" required {...form.bind("school_class")}>
          <option value="">Choose…</option>
          {rows(classes.data).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      ) : (
        <>
          <Select label="Section" required {...form.bind("section")}>
            <option value="">Choose…</option>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Select label="Subject" required {...form.bind("subject")}>
            <option value="">Choose…</option>
            {rows(subjects.data).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </>
      )}
      <Field label="Maximum marks" type="number" min={1} step="0.5" required {...form.bind("max_marks")} />
      <Field label="Pass marks (optional)" type="number" min={0} step="0.5" {...form.bind("pass_marks")} />
      <Field label="Date (optional)" type="date" {...form.bind("date")} />
      <div className="flex items-end gap-2 sm:col-span-3">
        <Button type="submit" busy={form.busy}>Add</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen("")}>Cancel</Button>
      </div>
    </form>
  );
}

function TermsCard({ terms, reload }: { terms: ExamTerm[]; reload: () => void }) {
  const years = useApi<Page<AcademicYear>>("academic-years/");
  const current = rows(years.data).find((y) => y.is_current);
  const form = useForm({ name: "", start_date: "", end_date: "" });
  return (
    <Card title={`Exam terms${current ? ` (${current.name})` : ""}`}>
      {terms.length > 0 && (
        <ul className="mb-4 space-y-2 text-sm">
          {terms.map((t) => (
            <li key={t.id} className="flex justify-between gap-3 rounded-xl border border-line px-3 py-2.5">
              <span className="font-medium">{t.name}</span>
              <span className="text-soft">{t.start_date ? `${formatDate(t.start_date)} to ${formatDate(t.end_date)}` : "No dates"}</span>
            </li>
          ))}
        </ul>
      )}
      {!current ? <p className="text-sm text-soft">Set the current academic year first.</p> : (
        <form
          onSubmit={form.submit((v) => api("exam-terms/", { method: "POST", body: { academic_year: current.id, name: v.name, start_date: v.start_date || null, end_date: v.end_date || null, order: terms.length + 1 } }), reload)}
          className="grid gap-3 sm:grid-cols-3"
        >
          {form.error && <div className="sm:col-span-3"><Alert>{form.error}</Alert></div>}
          <Field label="Name" placeholder="Half-yearly" required {...form.bind("name")} />
          <Field label="Starts (optional)" type="date" {...form.bind("start_date")} />
          <Field label="Ends (optional)" type="date" {...form.bind("end_date")} />
          <p className="text-xs text-soft sm:col-span-3">The dates set which days count towards attendance on the report card.</p>
          <Button type="submit" busy={form.busy} variant="secondary" className="sm:justify-self-start">Add term</Button>
        </form>
      )}
    </Card>
  );
}

function GradeScaleCard() {
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
      <p className="mb-3 text-sm text-soft">One band per line: the lowest percentage, then the grade. {current ? "" : "These are the defaults until you save your own."}</p>
      <textarea
        className="block min-h-48 w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 font-mono text-sm outline-none focus:border-brand focus:ring-4 focus:ring-[var(--ring)]"
        value={shown}
        onChange={(e) => setText(e.target.value)}
        aria-label="Grade bands"
      />
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" onClick={save}>Save scale</Button>
        <ButtonLink href="/app/report-cards" variant="secondary">Report cards</ButtonLink>
      </div>
    </Card>
  );
}
