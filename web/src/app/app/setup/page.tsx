"use client";

import { useState } from "react";
import { Alert, Badge, Button, Card, DataTable, Empty, Field, PageHeader, Select } from "@/components/ui";
import { api, Page } from "@/lib/api";
import { AcademicYear, SchoolClass, Section, SectionSubject, Subject, Teacher } from "@/lib/types";
import { rows, useApi } from "@/lib/useApi";
import { compact, useForm } from "@/lib/useForm";

export default function SetupPage() {
  const years = useApi<Page<AcademicYear>>("academic-years/");
  const classes = useApi<Page<SchoolClass>>("classes/");
  const subjects = useApi<Page<Subject>>("subjects/");
  const sections = useApi<Page<Section>>("sections/");
  const teachers = useApi<Page<Teacher>>("teachers/?status=active");

  return (
    <>
      <PageHeader title="Classes & subjects" subtitle="Set up the academic year, classes, sections and subjects, then assign teachers." />
      <div className="grid gap-5 lg:grid-cols-2">
        <YearsCard years={rows(years.data)} reload={years.reload} />
        <ClassesCard classes={rows(classes.data)} reload={() => { classes.reload(); sections.reload(); }} />
        <SubjectsCard subjects={rows(subjects.data)} reload={subjects.reload} />
        <SectionsCard
          sections={rows(sections.data)}
          classes={rows(classes.data)}
          teachers={rows(teachers.data)}
          currentYear={rows(years.data).find((y) => y.is_current) ?? null}
          reload={sections.reload}
        />
      </div>
      <div className="mt-5">
        <AssignmentsCard sections={rows(sections.data)} subjects={rows(subjects.data)} teachers={rows(teachers.data)} />
      </div>
    </>
  );
}

function YearsCard({ years, reload }: { years: AcademicYear[]; reload: () => void }) {
  const form = useForm({ name: "", start_date: "", end_date: "" });
  const [error, setError] = useState<string | null>(null);
  const makeCurrent = async (y: AcademicYear) => {
    try {
      await api(`academic-years/${y.id}/`, { method: "PATCH", body: { is_current: true } });
      reload();
    } catch (e) {
      setError(String(e));
    }
  };
  return (
    <Card title="Academic years">
      {error && <Alert>{error}</Alert>}
      {years.length === 0 ? <Empty>No academic year yet.</Empty> : (
        <ul className="mb-4 space-y-2 text-sm">
          {years.map((y) => (
            <li key={y.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
              <span><span className="font-medium">{y.name}</span> <span className="text-soft">{y.start_date} to {y.end_date}</span></span>
              {y.is_current ? <Badge tone="good">Current</Badge> : <button className="text-xs text-brand" onClick={() => makeCurrent(y)}>Make current</button>}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={form.submit((v) => api("academic-years/", { method: "POST", body: { ...v, is_current: years.length === 0 } }), reload)} className="grid gap-3 sm:grid-cols-3">
        <Field label="Name" placeholder="2026-27" required {...form.bind("name")} />
        <Field label="Starts" type="date" required {...form.bind("start_date")} />
        <Field label="Ends" type="date" required {...form.bind("end_date")} />
        {form.error && <div className="sm:col-span-3"><Alert>{form.error}</Alert></div>}
        <Button type="submit" busy={form.busy} variant="secondary" className="sm:col-span-3 sm:justify-self-start">Add year</Button>
      </form>
    </Card>
  );
}

function ClassesCard({ classes, reload }: { classes: SchoolClass[]; reload: () => void }) {
  const form = useForm({ name: "", order: "" });
  return (
    <Card title="Classes">
      {classes.length === 0 ? <Empty>No classes yet. Add Grade 1, Grade 2 and so on.</Empty> : (
        <div className="mb-4 flex flex-wrap gap-2">{classes.map((c) => <Badge key={c.id}>{c.name}</Badge>)}</div>
      )}
      <form onSubmit={form.submit((v) => api("classes/", { method: "POST", body: { name: v.name, order: Number(v.order || classes.length + 1) } }), reload)} className="grid gap-3 sm:grid-cols-3">
        <Field label="Class name" placeholder="Grade 5" required {...form.bind("name")} className="sm:col-span-2" />
        <Field label="Order" type="number" min={0} placeholder={String(classes.length + 1)} {...form.bind("order")} />
        {form.error && <div className="sm:col-span-3"><Alert>{form.error}</Alert></div>}
        <Button type="submit" busy={form.busy} variant="secondary" className="sm:col-span-3 sm:justify-self-start">Add class</Button>
      </form>
    </Card>
  );
}

function SubjectsCard({ subjects, reload }: { subjects: Subject[]; reload: () => void }) {
  const form = useForm({ name: "", code: "" });
  return (
    <Card title="Subjects">
      {subjects.length === 0 ? <Empty>No subjects yet.</Empty> : (
        <div className="mb-4 flex flex-wrap gap-2">{subjects.map((s) => <Badge key={s.id}>{s.name}{s.code ? ` (${s.code})` : ""}</Badge>)}</div>
      )}
      <form onSubmit={form.submit((v) => api("subjects/", { method: "POST", body: compact(v) }), reload)} className="grid gap-3 sm:grid-cols-3">
        <Field label="Subject" placeholder="Maths" required {...form.bind("name")} className="sm:col-span-2" />
        <Field label="Code" placeholder="MATH" {...form.bind("code")} />
        {form.error && <div className="sm:col-span-3"><Alert>{form.error}</Alert></div>}
        <Button type="submit" busy={form.busy} variant="secondary" className="sm:col-span-3 sm:justify-self-start">Add subject</Button>
      </form>
    </Card>
  );
}

function SectionsCard({ sections, classes, teachers, currentYear, reload }: { sections: Section[]; classes: SchoolClass[]; teachers: Teacher[]; currentYear: AcademicYear | null; reload: () => void }) {
  const form = useForm({ school_class: "", name: "", class_teacher: "" });
  const setTeacher = async (section: Section, teacher: string) => {
    await api(`sections/${section.id}/`, { method: "PATCH", body: { class_teacher: teacher || null } });
    reload();
  };
  return (
    <Card title={`Sections${currentYear ? ` for ${currentYear.name}` : ""}`}>
      {!currentYear ? <Empty>Add an academic year first.</Empty> : (
        <>
          {sections.length === 0 ? <Empty>No sections yet. Add 5-A, 5-B and so on.</Empty> : (
            <DataTable
              rows={sections}
              rowKey={(s) => s.id}
              columns={[
                { header: "Section", cell: (s) => <span className="font-medium">{s.display_name}</span> },
                { header: "Students", cell: (s) => s.student_count },
                {
                  header: "Class teacher",
                  cell: (s) => (
                    <select className="rounded-md border border-line bg-surface px-2 py-1 text-sm" value={s.class_teacher ?? ""} onChange={(e) => setTeacher(s, e.target.value)} aria-label={`Class teacher for ${s.display_name}`}>
                      <option value="">None</option>
                      {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  ),
                },
              ]}
            />
          )}
          <form onSubmit={form.submit((v) => api("sections/", { method: "POST", body: compact({ ...v, academic_year: currentYear.id }) }), reload)} className="mt-4 grid gap-3 sm:grid-cols-3">
            <Select label="Class" required {...form.bind("school_class")}>
              <option value="">Choose…</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Field label="Section" placeholder="A" required {...form.bind("name")} />
            <Select label="Class teacher" {...form.bind("class_teacher")}>
              <option value="">None</option>
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
            {form.error && <div className="sm:col-span-3"><Alert>{form.error}</Alert></div>}
            <Button type="submit" busy={form.busy} variant="secondary" className="sm:col-span-3 sm:justify-self-start">Add section</Button>
          </form>
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

  const changeTeacher = async (row: SectionSubject, teacher: string) => {
    await api(`section-subjects/${row.id}/`, { method: "PATCH", body: { teacher: teacher || null } });
    assignments.reload();
  };

  return (
    <Card title="Who teaches what">
      {sections.length === 0 ? <Empty>Add sections first.</Empty> : (
        <>
          <Select label="Section" value={current} onChange={(e) => setSectionId(e.target.value)} className="mb-4 max-w-xs">
            {sections.map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
          </Select>
          {list.length === 0 ? <Empty>No subjects for this section yet.</Empty> : (
            <DataTable
              rows={list}
              rowKey={(r) => r.id}
              columns={[
                { header: "Subject", cell: (r) => r.subject_name },
                {
                  header: "Teacher",
                  cell: (r) => (
                    <select className="rounded-md border border-line bg-surface px-2 py-1 text-sm" value={r.teacher ?? ""} onChange={(e) => changeTeacher(r, e.target.value)} aria-label={`Teacher for ${r.subject_name}`}>
                      <option value="">Not assigned</option>
                      {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  ),
                },
              ]}
            />
          )}
          <form onSubmit={form.submit((v) => api("section-subjects/", { method: "POST", body: compact({ ...v, section: current }) }), assignments.reload)} className="mt-4 grid gap-3 sm:grid-cols-3">
            <Select label="Subject" required {...form.bind("subject")}>
              <option value="">Choose…</option>
              {subjects.filter((s) => !list.some((r) => r.subject === s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <Select label="Teacher" {...form.bind("teacher")}>
              <option value="">Not assigned</option>
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
            <div className="flex items-end"><Button type="submit" busy={form.busy} variant="secondary">Add subject to section</Button></div>
            {form.error && <div className="sm:col-span-3"><Alert>{form.error}</Alert></div>}
          </form>
        </>
      )}
    </Card>
  );
}
