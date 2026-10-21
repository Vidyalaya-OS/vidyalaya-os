"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Badge, Button, Card, DataTable, Empty, Field, Loading, PageHeader, Select, statusTone } from "@/components/ui";
import { api, Page } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Section, Student } from "@/lib/types";
import { rows, useApi } from "@/lib/useApi";
import { compact, useForm } from "@/lib/useForm";

export default function StudentsPage() {
  const { hasRole } = useSession();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [section, setSection] = useState("");
  const [adding, setAdding] = useState(false);
  const sections = useApi<Page<Section>>("sections/");
  const query = new URLSearchParams(compact({ search, section }) as Record<string, string>).toString();
  const students = useApi<Page<Student>>(`students/?${query}`);
  const isAdmin = hasRole("admin");

  return (
    <>
      <PageHeader
        title="Students"
        subtitle={isAdmin ? "Register students and link their parents." : "Students in the sections you teach."}
        actions={isAdmin && !adding ? <Button onClick={() => setAdding(true)}>Add student</Button> : undefined}
      />
      {adding && <AddStudent sections={rows(sections.data)} onDone={() => { setAdding(false); students.reload(); }} onCancel={() => setAdding(false)} />}
      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Field label="Search" placeholder="Name or admission no." value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select label="Section" value={section} onChange={(e) => setSection(e.target.value)}>
            <option value="">All sections</option>
            {rows(sections.data).map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
          </Select>
        </div>
        {students.error && <Alert>{students.error}</Alert>}
        {students.loading && !students.data ? <Loading /> : rows(students.data).length === 0 ? (
          <Empty>No students found.</Empty>
        ) : (
          <>
            <DataTable
              rows={rows(students.data)}
              rowKey={(s) => s.id}
              onRowClick={(s) => router.push(`/app/students/${s.id}`)}
              columns={[
                { header: "Name", cell: (s) => <span className="font-medium">{s.name}</span> },
                { header: "Adm. no.", cell: (s) => s.admission_no },
                { header: "Section", cell: (s) => s.current_enrollment?.section_name ?? "-" },
                { header: "Roll", cell: (s) => s.current_enrollment?.roll_no ?? "-" },
                { header: "Parent", cell: (s) => s.guardians[0]?.name ?? "-" },
                { header: "Status", cell: (s) => <Badge tone={statusTone(s.status)}>{s.status}</Badge> },
              ]}
            />
            <p className="mt-3 text-xs text-soft">{students.data?.count} students</p>
          </>
        )}
      </Card>
    </>
  );
}

function AddStudent({ sections, onDone, onCancel }: { sections: Section[]; onDone: () => void; onCancel: () => void }) {
  const form = useForm({
    name: "", admission_no: "", dob: "", gender: "", section: "", roll_no: "", email: "", phone: "",
    guardian_name: "", guardian_relation: "", guardian_email: "", guardian_phone: "",
  });
  const save = form.submit(async (v) => {
    const guardian = compact({ name: v.guardian_name, relation: v.guardian_relation, email: v.guardian_email, phone: v.guardian_phone });
    await api("students/", {
      method: "POST",
      body: compact({
        name: v.name, admission_no: v.admission_no, dob: v.dob, gender: v.gender, section: v.section,
        roll_no: v.roll_no ? Number(v.roll_no) : undefined, email: v.email, phone: v.phone,
        guardian_list: v.guardian_name ? [{ ...guardian, is_primary: true }] : [],
      }),
    });
  }, onDone);
  const guardianError = form.errors.guardian_list;

  return (
    <Card title="New student" className="mb-5">
      <form onSubmit={save} className="space-y-4">
        {form.error && <Alert>{form.error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Full name" required {...form.bind("name")} />
          <Field label="Admission number" required {...form.bind("admission_no")} />
          <Field label="Date of birth" type="date" {...form.bind("dob")} />
          <Select label="Gender" {...form.bind("gender")}>
            <option value="">Not given</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </Select>
          <Select label="Section" {...form.bind("section")}>
            <option value="">Assign later</option>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
          </Select>
          <Field label="Roll number" type="number" min={1} {...form.bind("roll_no")} />
          <Field label="Student email" type="email" hint="Optional. Lets the student log in." {...form.bind("email")} />
          <Field label="Student phone" type="tel" {...form.bind("phone")} />
        </div>
        <h3 className="pt-2 text-sm font-semibold">Parent</h3>
        {guardianError && <Alert>{guardianError}</Alert>}
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Parent name" {...form.bind("guardian_name")} />
          <Field label="Relation" placeholder="Mother" {...form.bind("guardian_relation")} />
          <Field label="Parent email" type="email" {...form.bind("guardian_email")} />
          <Field label="Parent phone" type="tel" {...form.bind("guardian_phone")} />
        </div>
        <p className="text-xs text-soft">If the parent is already registered (same email or phone), the child is added to their account.</p>
        <div className="flex gap-2">
          <Button type="submit" busy={form.busy}>Save and send invites</Button>
          <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        </div>
      </form>
    </Card>
  );
}
