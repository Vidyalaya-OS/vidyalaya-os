"use client";

import { useParams } from "next/navigation";
import { ArrowRightLeft, History, IdCard, UsersRound } from "lucide-react";
import { useState } from "react";
import { useDialog } from "@/components/dialog";
import { StudentRecord } from "@/components/StudentRecord";
import { useToast } from "@/components/toast";
import { Alert, Avatar, Badge, Button, Card, DataTable, ErrorState, Field, Loading, PageHeader, Select, statusTone } from "@/components/ui";
import { api, Page } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Enrollment, Section, Student } from "@/lib/types";
import { rows, useApi } from "@/lib/useApi";
import { compact, useForm } from "@/lib/useForm";

export default function StudentPage() {
  const { id } = useParams<{ id: string }>();
  const { hasRole } = useSession();
  const student = useApi<Student>(`students/${id}/`);
  const history = useApi<Enrollment[]>(`students/${id}/history/`);
  const sections = useApi<Page<Section>>("sections/");
  const toast = useToast();
  const dialog = useDialog();
  const isAdmin = hasRole("admin");

  if (student.error && !student.data) return <ErrorState message={student.error} onRetry={student.reload} />;
  if (!student.data) return <><Loading variant="stats" /><div className="mt-5"><Loading variant="cards" /></div></>;
  const s = student.data;
  const reloadAll = () => { student.reload(); history.reload(); };

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      reloadAll();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <>
      <PageHeader
        back={{ href: "/app/students", label: "Students" }}
        title={<span className="flex items-center gap-3"><Avatar name={s.name} size="lg" /><span>{s.name}</span></span>}
        subtitle={`Admission no. ${s.admission_no} · ${s.current_enrollment?.section_name ?? "No section"}`}
        actions={<Badge tone={statusTone(s.status)} dot>{s.status}</Badge>}
      />
      {!isAdmin && <div className="mb-6"><StudentRecord studentId={s.id} /></div>}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Details" icon={<IdCard aria-hidden />}>
          {isAdmin ? <EditStudent student={s} onSaved={() => { toast.success("Student details saved."); reloadAll(); }} /> : (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-soft">Date of birth</dt><dd>{s.dob ?? "-"}</dd></div>
              <div><dt className="text-soft">Roll number</dt><dd>{s.current_enrollment?.roll_no ?? "-"}</dd></div>
            </dl>
          )}
        </Card>
        <Card title="Parents" icon={<UsersRound aria-hidden />}>
          {s.guardians.length === 0 ? <p className="text-sm text-soft">No parent linked.</p> : (
            <ul className="space-y-2 text-sm">
              {s.guardians.map((g) => (
                <li key={g.id} className="flex items-start justify-between gap-2 rounded-xl border border-line px-3 py-2.5">
                  <div>
                    <div className="font-medium">{g.name} {g.is_primary && <Badge>Primary</Badge>}</div>
                    <div className="text-soft">{[g.relation, g.email, g.phone].filter(Boolean).join(" · ")}</div>
                  </div>
                  {isAdmin && <button className="text-sm font-medium text-red-600" onClick={async () => {
                    if (await dialog.confirm({ title: `Unlink ${g.name}?`, body: `They will no longer see ${s.name}'s records.`, confirmLabel: "Unlink", danger: true })) {
                      run(() => api(`students/${s.id}/guardians/${g.id}/`, { method: "DELETE" }), "Parent unlinked.");
                    }
                  }}>Unlink</button>}
                </li>
              ))}
            </ul>
          )}
          {isAdmin && <AddParent studentId={s.id} onDone={() => { toast.success("Parent linked."); reloadAll(); }} />}
        </Card>
        {isAdmin && s.status === "active" && (
          <Card title="Move or leave" icon={<ArrowRightLeft aria-hidden />}>
            <MoveForm student={s} sections={rows(sections.data)} onDone={() => { toast.success("Student moved."); reloadAll(); }} />
            <div className="mt-5 border-t border-line pt-4">
              <LeaveForm onLeave={async (left_on, status) => {
                if (await dialog.confirm({ title: `Mark ${s.name} as left?`, body: "Nothing is deleted. Their attendance, marks and fees stay on record.", confirmLabel: "Mark as left", danger: true })) {
                  run(() => api(`students/${s.id}/leave/`, { method: "POST", body: { left_on, status } }), "Marked as left. Their records are kept.");
                }
              }} />
            </div>
          </Card>
        )}
        {isAdmin && s.status !== "active" && (
          <Card title="Rejoin">
            <Button variant="secondary" onClick={() => run(() => api(`students/${s.id}/rejoin/`, { method: "POST" }), "Student is active again. Assign a section.")}>Mark as active again</Button>
          </Card>
        )}
        <Card title="Class history" icon={<History aria-hidden />}>
          <DataTable
            rows={history.data ?? []}
            rowKey={(e) => e.id}
            columns={[
              { header: "Year", cell: (e) => e.academic_year_name },
              { header: "Section", cell: (e) => e.section_name },
              { header: "Roll", cell: (e) => e.roll_no ?? "-" },
              { header: "Status", cell: (e) => <Badge tone={statusTone(e.status)}>{e.status}</Badge> },
            ]}
          />
        </Card>
      </div>
      {isAdmin && s.login_status === "invited" && (s.email || s.phone) && (
        <Button variant="ghost" className="mt-4" onClick={() => run(() => api(`students/${s.id}/resend-invite/`, { method: "POST" }), "Invite sent again.")}>Resend login invite</Button>
      )}
      {isAdmin && <StudentRecord studentId={s.id} />}
    </>
  );
}

function EditStudent({ student, onSaved }: { student: Student; onSaved: () => void }) {
  const form = useForm({ name: student.name, admission_no: student.admission_no, dob: student.dob ?? "", gender: student.gender, email: student.email ?? "", phone: student.phone ?? "" });
  return (
    <form onSubmit={form.submit((v) => api(`students/${student.id}/`, { method: "PATCH", body: { ...v, dob: v.dob || null } }), onSaved)} className="grid gap-3 sm:grid-cols-2">
      {form.error && <div className="sm:col-span-2"><Alert>{form.error}</Alert></div>}
      <Field label="Full name" required {...form.bind("name")} />
      <Field label="Admission number" required {...form.bind("admission_no")} />
      <Field label="Date of birth" type="date" {...form.bind("dob")} />
      <Select label="Gender" {...form.bind("gender")}>
        <option value="">Not given</option>
        <option value="female">Female</option>
        <option value="male">Male</option>
        <option value="other">Other</option>
      </Select>
      <Field label="Email" type="email" {...form.bind("email")} />
      <Field label="Phone" type="tel" {...form.bind("phone")} />
      <Button type="submit" busy={form.busy} variant="secondary" className="sm:justify-self-start">Save changes</Button>
    </form>
  );
}

function AddParent({ studentId, onDone }: { studentId: string; onDone: () => void }) {
  const form = useForm({ name: "", relation: "", email: "", phone: "" });
  return (
    <form onSubmit={form.submit((v) => api(`students/${studentId}/guardians/`, { method: "POST", body: compact(v) }), onDone)} className="mt-4 grid gap-3 sm:grid-cols-2">
      {form.error && <div className="sm:col-span-2"><Alert>{form.error}</Alert></div>}
      <Field label="Parent name" required {...form.bind("name")} />
      <Field label="Relation" placeholder="Father" {...form.bind("relation")} />
      <Field label="Email" type="email" {...form.bind("email")} />
      <Field label="Phone" type="tel" {...form.bind("phone")} />
      <Button type="submit" busy={form.busy} variant="secondary" className="sm:justify-self-start">Link parent</Button>
    </form>
  );
}

function MoveForm({ student, sections, onDone }: { student: Student; sections: Section[]; onDone: () => void }) {
  const form = useForm({ section: "", roll_no: "" });
  const choices = sections.filter((s) => s.id !== student.current_enrollment?.section);
  return (
    <form onSubmit={form.submit((v) => api(`students/${student.id}/move/`, { method: "POST", body: { section: v.section, roll_no: v.roll_no ? Number(v.roll_no) : null } }), onDone)} className="grid gap-3 sm:grid-cols-3">
      {form.error && <div className="sm:col-span-3"><Alert>{form.error}</Alert></div>}
      <Select label="Move to section" required {...form.bind("section")}>
        <option value="">Choose…</option>
        {choices.map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
      </Select>
      <Field label="New roll number" type="number" min={1} {...form.bind("roll_no")} />
      <div className="flex items-end"><Button type="submit" busy={form.busy} variant="secondary">Move</Button></div>
    </form>
  );
}

function LeaveForm({ onLeave }: { onLeave: (date: string, status: string) => void }) {
  const [date, setDate] = useState("");
  const [status, setStatus] = useState("left");
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Leaving date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <Select label="Reason" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="left">Left the school</option>
        <option value="graduated">Graduated</option>
      </Select>
      <div className="flex items-end">
        <Button variant="danger" disabled={!date} onClick={() => onLeave(date, status)}>Mark as left</Button>
      </div>
    </div>
  );
}
