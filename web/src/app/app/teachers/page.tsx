"use client";

import { useState } from "react";
import { Alert, Badge, Button, Card, DataTable, Empty, Field, Loading, PageHeader, statusTone } from "@/components/ui";
import { api, ApiError, Page } from "@/lib/api";
import { Teacher } from "@/lib/types";
import { rows, useApi } from "@/lib/useApi";
import { compact, useForm } from "@/lib/useForm";

export default function TeachersPage() {
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const teachers = useApi<Page<Teacher>>(`teachers/?search=${encodeURIComponent(search)}`);
  const form = useForm({ name: "", email: "", phone: "", employee_no: "", qualification: "", joined_on: "" });

  const act = async (t: Teacher, action: "leave" | "resend-invite") => {
    if (action === "leave" && !confirm(`Mark ${t.name} as left? Their classes become unassigned.`)) return;
    try {
      const res = await api<{ sent?: boolean; detail?: string }>(`teachers/${t.id}/${action}/`, { method: "POST" });
      setNotice({ tone: "success", text: action === "leave" ? `${t.name} is marked as left.` : res.sent ? "Invite sent again." : res.detail ?? "Nothing sent." });
      teachers.reload();
    } catch (e) {
      setNotice({ tone: "error", text: e instanceof ApiError ? e.message : "That did not work." });
    }
  };

  return (
    <>
      <PageHeader title="Teachers" subtitle="Assign subjects and class teachers under Classes & subjects." actions={!adding ? <Button onClick={() => setAdding(true)}>Add teacher</Button> : undefined} />
      {adding && (
        <Card title="New teacher" className="mb-5">
          <form onSubmit={form.submit((v) => api("teachers/", { method: "POST", body: compact(v) }), () => { setAdding(false); teachers.reload(); })} className="grid gap-4 sm:grid-cols-3">
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
      {notice && <div className="mb-4"><Alert tone={notice.tone}>{notice.text}</Alert></div>}
      <Card>
        <Field label="Search" placeholder="Name or employee no." value={search} onChange={(e) => setSearch(e.target.value)} className="mb-4 max-w-xs" />
        {teachers.loading && !teachers.data ? <Loading /> : rows(teachers.data).length === 0 ? <Empty>No teachers yet.</Empty> : (
          <DataTable
            rows={rows(teachers.data)}
            rowKey={(t) => t.id}
            columns={[
              { header: "Name", cell: (t) => <><div className="font-medium">{t.name}</div><div className="text-xs text-soft">{t.email ?? t.phone}</div></> },
              { header: "Emp. no.", cell: (t) => t.employee_no || "-" },
              { header: "Teaches", cell: (t) => t.teaches.map((x) => `${x.section_name} ${x.subject_name}`).join(", ") || "-" },
              { header: "Login", cell: (t) => <Badge tone={statusTone(t.login_status)}>{t.login_status}</Badge> },
              { header: "Status", cell: (t) => <Badge tone={statusTone(t.status)}>{t.status}</Badge> },
              {
                header: "Actions",
                cell: (t) => (
                  <div className="flex justify-end gap-3 text-xs sm:justify-start">
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
