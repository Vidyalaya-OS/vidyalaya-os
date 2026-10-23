"use client";

import { Building2, CirclePlus, GraduationCap, Search, Users, Wallet } from "lucide-react";
import { useState } from "react";
import { BarList } from "@/components/charts";
import { useDialog } from "@/components/dialog";
import { useToast } from "@/components/toast";
import { Avatar, Badge, ButtonLink, Card, DataTable, Empty, ErrorState, Field, Loading, PageHeader, Stat, statusTone } from "@/components/ui";
import { api, Page } from "@/lib/api";
import { money } from "@/lib/format";
import { rows, useApi, useDebounced } from "@/lib/useApi";

type School = {
  id: string;
  name: string;
  subdomain: string;
  board: string;
  plan: string;
  status: "active" | "suspended" | "archived";
  usage: { students: number; teachers: number; admins: number; fees_collected: string };
};

type Action = "suspend" | "activate" | "archive" | "resend-admin-invite";

/** The platform owner's home: every school, its size and status, and onboarding. */
export default function PlatformHome() {
  const [search, setSearch] = useState("");
  const term = useDebounced(search);
  const { data, error, loading, reload } = useApi<Page<School>>(`platform/schools/?search=${encodeURIComponent(term)}`);
  const toast = useToast();
  const dialog = useDialog();
  const schools = rows(data);
  const live = schools.filter((s) => s.status === "active");
  const maxStudents = Math.max(1, ...live.map((s) => s.usage.students));

  const act = async (school: School, action: Action) => {
    if (action === "archive" && !(await dialog.confirm({ title: `Archive ${school.name}?`, body: "Nobody will be able to open it. Its data is kept, and you can reactivate it later.", confirmLabel: "Archive school", danger: true }))) return;
    if (action === "suspend" && !(await dialog.confirm({ title: `Suspend ${school.name}?`, body: "People can still sign in and look, but nothing can be changed until you reactivate it.", confirmLabel: "Suspend" }))) return;
    try {
      const res = await api<{ detail?: string | null; sent?: boolean }>(`platform/schools/${school.id}/${action}/`, { method: "POST", school: null });
      if (action === "resend-admin-invite") {
        if (res.sent) toast.success("Invite sent to the admin.");
        else toast.info(res.detail ?? "Nothing sent.");
      } else toast.success(`${school.name} is now ${action === "activate" ? "active" : action === "suspend" ? "suspended (read-only)" : "archived"}.`);
      reload();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <>
      <PageHeader title="Schools" subtitle="Onboard schools and keep an eye on them." actions={<ButtonLink href="/platform/new"><CirclePlus aria-hidden /> Onboard a school</ButtonLink>} />
      <div className="stagger mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Schools live" value={data ? live.length : "-"} icon={<Building2 aria-hidden />} hint={data ? `${schools.length - live.length} suspended or archived` : undefined} />
        <Stat label="Students" value={data ? live.reduce((n, s) => n + s.usage.students, 0) : "-"} icon={<GraduationCap aria-hidden />} />
        <Stat label="Teachers" value={data ? live.reduce((n, s) => n + s.usage.teachers, 0) : "-"} icon={<Users aria-hidden />} />
        <Stat label="Fees this year" value={data ? money(live.reduce((n, s) => n + Number(s.usage.fees_collected), 0)) : "-"} icon={<Wallet aria-hidden />} tone="good" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_22rem]">
        <Card title="All schools" icon={<Building2 aria-hidden />}>
          <Field label="Search" type="search" icon={<Search aria-hidden />} placeholder="Name or web address" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-4 max-w-sm" />
          {error && !data ? (
            <ErrorState message={error} onRetry={reload} />
          ) : loading && !data ? (
            <Loading variant="table" />
          ) : schools.length === 0 ? (
            <Empty icon={<Building2 aria-hidden />} title={term ? "No schools match" : "No schools yet"} action={!term && <ButtonLink href="/platform/new">Onboard the first school</ButtonLink>}>
              {term ? "Try another name." : "Each school gets its own private portal and admin."}
            </Empty>
          ) : (
            <DataTable
              rows={schools}
              rowKey={(s) => s.id}
              columns={[
                { header: "School", cell: (s) => <span className="flex items-center gap-3"><Avatar name={s.name} size="sm" /><span className="min-w-0"><span className="block font-medium">{s.name}</span><span className="block text-xs text-soft">{s.subdomain}{s.board ? ` · ${s.board}` : ""}</span></span></span> },
                { header: "Plan", cell: (s) => <Badge tone="info">{s.plan}</Badge> },
                { header: "Students", cell: (s) => <span className="tabular-nums">{s.usage.students}</span> },
                { header: "Teachers", cell: (s) => <span className="tabular-nums">{s.usage.teachers}</span> },
                { header: "Fees this year", cell: (s) => <span className="tabular-nums">{money(s.usage.fees_collected)}</span> },
                { header: "Status", cell: (s) => <Badge tone={statusTone(s.status)} dot>{s.status}</Badge> },
                {
                  header: "",
                  cell: (s) => (
                    <div className="flex flex-wrap justify-end gap-x-4 gap-y-1 text-sm font-medium sm:justify-start">
                      {s.status === "active" && <button className="text-brand hover:underline" onClick={() => act(s, "suspend")}>Suspend</button>}
                      {s.status !== "active" && <button className="text-brand hover:underline" onClick={() => act(s, "activate")}>Reactivate</button>}
                      {s.status !== "archived" && <button className="text-red-600 hover:underline" onClick={() => act(s, "archive")}>Archive</button>}
                      <button className="text-brand hover:underline" onClick={() => act(s, "resend-admin-invite")}>Resend admin invite</button>
                    </div>
                  ),
                },
              ]}
            />
          )}
        </Card>
        <Card title="Students per school" icon={<GraduationCap aria-hidden />} description="Live schools">
          {!data ? <Loading variant="text" /> : live.length === 0 ? <Empty>No live schools yet.</Empty> : (
            <BarList format={(n) => String(Math.round((n / 100) * maxStudents))} items={live.map((s) => ({ label: s.name, value: (s.usage.students / maxStudents) * 100, note: String(s.usage.students) }))} />
          )}
        </Card>
      </div>
      <p className="mt-5 text-sm text-soft">You see head counts only. Student records stay private to each school.</p>
    </>
  );
}
