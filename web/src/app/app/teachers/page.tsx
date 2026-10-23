"use client";

import { Search, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { useDialog } from "@/components/dialog";
import { useToast } from "@/components/toast";
import { Alert, Avatar, Badge, Button, Card, DataTable, Empty, ErrorState, Field, Loading, PageHeader, statusTone } from "@/components/ui";
import { api, Page } from "@/lib/api";
import { Teacher } from "@/lib/types";
import { rows, useApi, useDebounced } from "@/lib/useApi";
import { compact, useForm } from "@/lib/useForm";

export default function TeachersPage() {
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const toast = useToast();
  const dialog = useDialog();
  const term = useDebounced(search);
  const teachers = useApi<Page<Teacher>>(`teachers/?search=${encodeURIComponent(term)}`);
  const form = useForm({ name: "", email: "", phone: "", employee_no: "", qualification: "", joined_on: "" });

  const act = async (t: Teacher, action: "leave" | "resend-invite") => {
    if (action === "leave" && !(await dialog.confirm({ title: `Mark ${t.name} as left?`, body: "Their classes become unassigned. Their records are kept.", confirmLabel: "Mark as left", danger: true }))) return;
    try {
      const res = await api<{ sent?: boolean; detail?: string }>(`teachers/${t.id}/${action}/`, { method: "POST" });
      if (action === "leave") toast.success(`${t.name} is marked as left.`);
      else if (res.sent) toast.success("Invite sent again.");
      else toast.info(res.detail ?? "Nothing sent.");
      teachers.reload();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <>
      <PageHeader title="Teachers" subtitle="Assign subjects and class teachers under Classes & subjects." actions={!adding ? <Button onClick={() => setAdding(true)}><UserPlus aria-hidden /> Add teacher</Button> : undefined} />
      {adding && (
        <Card title="New teacher" icon={<UserPlus aria-hidden />} className="mb-5 animate-enter">
          <form onSubmit={form.submit((v) => api("teachers/", { method: "POST", body: compact(v) }), () => { setAdding(false); teachers.reload(); toast.success("Teacher added. Their invite is on its way."); })} className="grid gap-4 sm:grid-cols-3">
            {form.error && <div className="sm:col-span-3"><Alert>{form.error}</Alert></div>}
            <Field label="Full name" required {...form.bind("name")} />
            <Field label="Email" type="email" {...form.bind("email")} hint="Email or phone is needed to log in." />
            <Field label="Phone" type="tel" {...form.bind("phone")} />
            <Field label="Employee number" {...form.bind("employee_no")} />
            <Field label="Qualification" {...form.bind("qualification")} />
            <Field label="Joined on" type="date" {...form.bind("joined_on")} />
            <div className="flex gap-2 sm:col-span-3">
              <Button type="submit" busy={form.busy}>Save and send invite</Button>
              <Button type="button" variant="secondary" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}
      <Card>
        <Field label="Search" icon={<Search aria-hidden />} type="search" placeholder="Name or employee no." value={search} onChange={(e) => setSearch(e.target.value)} className="mb-4 max-w-xs" />
        {teachers.error && !teachers.data ? <ErrorState message={teachers.error} onRetry={teachers.reload} /> : teachers.loading && !teachers.data ? <Loading variant="table" /> : rows(teachers.data).length === 0 ? <Empty icon={<Users aria-hidden />}>{term ? "No teachers match." : "No teachers yet."}</Empty> : (
          <DataTable
            rows={rows(teachers.data)}
            rowKey={(t) => t.id}
            columns={[
              { header: "Name", cell: (t) => <span className="flex items-center gap-3"><Avatar name={t.name} size="sm" /><span className="min-w-0"><span className="block font-medium">{t.name}</span><span className="block truncate text-xs text-soft">{t.email ?? t.phone}</span></span></span> },
              { header: "Emp. no.", cell: (t) => t.employee_no || "-" },
              { header: "Teaches", cell: (t) => t.teaches.map((x) => `${x.section_name} ${x.subject_name}`).join(", ") || "-" },
              { header: "Login", cell: (t) => <Badge tone={statusTone(t.login_status)}>{t.login_status}</Badge> },
              { header: "Status", cell: (t) => <Badge tone={statusTone(t.status)}>{t.status}</Badge> },
              {
                header: "Actions",
                cell: (t) => (
                  <div className="flex justify-end gap-4 text-sm font-medium sm:justify-start">
                    {t.login_status === "invited" && <button className="text-brand" onClick={() => act(t, "resend-invite")}>Resend invite</button>}
                    {t.status === "active" && <button className="text-red-600" onClick={() => act(t, "leave")}>Mark as left</button>}
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>
    </>
  );
}
