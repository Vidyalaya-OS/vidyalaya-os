"use client";

import { useState } from "react";
import { Alert, Badge, ButtonLink, Card, DataTable, Empty, Field, Loading, PageHeader, statusTone } from "@/components/ui";
import { api, ApiError, Page } from "@/lib/api";
import { rows, useApi } from "@/lib/useApi";

type School = {
  id: string;
  name: string;
  subdomain: string;
  board: string;
  plan: string;
  status: "active" | "suspended" | "archived";
  usage: { students: number; teachers: number; admins: number };
};

export default function PlatformHome() {
  const [search, setSearch] = useState("");
  const { data, error, loading, reload } = useApi<Page<School>>(`platform/schools/?search=${encodeURIComponent(search)}`);
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const schools = rows(data);
  const live = schools.filter((s) => s.status === "active");

  const act = async (school: School, action: "suspend" | "activate" | "archive" | "resend-admin-invite") => {
    if (action === "archive" && !confirm(`Archive ${school.name}? Nobody will be able to open it.`)) return;
    try {
      const res = await api<{ detail?: string | null; sent?: boolean }>(`platform/schools/${school.id}/${action}/`, { method: "POST", school: null });
      setNotice({ tone: "success", text: action === "resend-admin-invite" ? (res.sent ? "Invite sent to the admin." : res.detail ?? "Nothing sent.") : `${school.name} is now ${action === "activate" ? "active" : action === "suspend" ? "suspended (read-only)" : "archived"}.` });
      reload();
    } catch (e) {
      setNotice({ tone: "error", text: e instanceof ApiError ? e.message : "That did not work." });
    }
  };

  return (
    <>
      <PageHeader title="Schools" subtitle="Onboard schools and keep an eye on them." actions={<ButtonLink href="/platform/new">Onboard a school</ButtonLink>} />
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label="Schools live" value={live.length} />
        <Stat label="Students" value={live.reduce((n, s) => n + s.usage.students, 0)} />
        <Stat label="Teachers" value={live.reduce((n, s) => n + s.usage.teachers, 0)} />
      </div>
      {notice && <div className="mb-4"><Alert tone={notice.tone}>{notice.text}</Alert></div>}
      <Card>
        <Field label="Search" placeholder="Name or address" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-4 max-w-xs" />
        {error && <Alert>{error}</Alert>}
        {loading && !data ? (
          <Loading />
        ) : schools.length === 0 ? (
          <Empty>No schools yet. Onboard the first one.</Empty>
        ) : (
          <DataTable
            rows={schools}
            rowKey={(s) => s.id}
            columns={[
              { header: "School", cell: (s) => <><div className="font-medium">{s.name}</div><div className="text-xs text-soft">{s.subdomain}</div></> },
              { header: "Plan", cell: (s) => s.plan },
              { header: "Students", cell: (s) => s.usage.students },
              { header: "Teachers", cell: (s) => s.usage.teachers },
              { header: "Status", cell: (s) => <Badge tone={statusTone(s.status)}>{s.status}</Badge> },
              {
                header: "Actions",
                cell: (s) => (
                  <div className="flex flex-wrap justify-end gap-2 text-xs sm:justify-start">
                    {s.status === "active" && <button className="text-brand" onClick={() => act(s, "suspend")}>Suspend</button>}
                    {s.status !== "active" && <button className="text-brand" onClick={() => act(s, "activate")}>Reactivate</button>}
                    {s.status !== "archived" && <button className="text-red-600" onClick={() => act(s, "archive")}>Archive</button>}
                    <button className="text-brand" onClick={() => act(s, "resend-admin-invite")}>Resend admin invite</button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>
      <p className="mt-4 text-xs text-soft">You see head counts only. Student records stay private to each school.</p>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3 sm:p-4">
      <div className="text-xs text-soft sm:text-sm">{label}</div>
      <div className="mt-1 text-xl font-semibold sm:text-2xl">{value}</div>
    </div>
  );
}
