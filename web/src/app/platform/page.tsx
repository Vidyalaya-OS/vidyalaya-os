"use client";

import {
  Archive, Building2, CircleCheck, CirclePlus, Crown, GraduationCap, Mail, PauseCircle, Search, Sparkles, Users, Wallet,
} from "lucide-react";
import { useState } from "react";
import { Logo3D } from "@/components/brand";
import { BarList, Donut } from "@/components/charts";
import { useDialog } from "@/components/dialog";
import { Tilt } from "@/components/motion";
import { useToast } from "@/components/toast";
import { Avatar, Badge, Button, ButtonLink, Card, CountUp, DataTable, Empty, ErrorState, Field, Loading, Stat, cx, statusTone } from "@/components/ui";
import { api, Page } from "@/lib/api";
import { money } from "@/lib/format";
import { rows, useApi, useDebounced } from "@/lib/useApi";

type Status = "active" | "suspended" | "archived";
type Plan = "trial" | "standard" | "premium";

type School = {
  id: string;
  name: string;
  subdomain: string;
  board: string;
  plan: Plan;
  currency: string;
  status: Status;
  usage: { students: number; teachers: number; admins: number; fees_collected: string };
};

type Action = "suspend" | "activate" | "archive" | "resend-admin-invite";

const PLAN_STYLE: Record<Plan, { label: string; className: string }> = {
  trial: { label: "Trial", className: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300" },
  standard: { label: "Standard", className: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300" },
  premium: { label: "Premium", className: "bg-gradient-to-r from-amber-200 to-orange-200 text-amber-900 dark:from-amber-900/70 dark:to-orange-900/70 dark:text-amber-200" },
};

const FILTERS: { key: Status | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "suspended", label: "Suspended" },
  { key: "archived", label: "Archived" },
];

/** The platform owner's home: every school, its size and status, and onboarding. */
export default function PlatformHome() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Status | "all">("all");
  const [pending, setPending] = useState<string | null>(null);
  const term = useDebounced(search);
  const { data, error, loading, reload } = useApi<Page<School>>(`platform/schools/?search=${encodeURIComponent(term)}`);
  const toast = useToast();
  const dialog = useDialog();
  const schools = rows(data);
  const live = schools.filter((s) => s.status === "active");
  const shown = filter === "all" ? schools : schools.filter((s) => s.status === filter);
  const count = (k: Status | "all") => (k === "all" ? schools.length : schools.filter((s) => s.status === k).length);

  const act = async (school: School, action: Action) => {
    if (action === "archive" && !(await dialog.confirm({ title: `Archive ${school.name}?`, body: "Nobody will be able to open it. Its data is kept, and you can make it active again later.", confirmLabel: "Archive school", danger: true }))) return;
    if (action === "suspend" && !(await dialog.confirm({ title: `Suspend ${school.name}?`, body: "People can still sign in and look, but nothing can be changed until you make it active again.", confirmLabel: "Suspend school" }))) return;
    setPending(`${school.id}:${action}`);
    try {
      const res = await api<{ detail?: string | null; sent?: boolean }>(`platform/schools/${school.id}/${action}/`, { method: "POST", school: null });
      if (action === "resend-admin-invite") {
        if (res.sent) toast.success(`A fresh invite is on its way to ${school.name}'s admin.`);
        else toast.info(res.detail ?? "Nothing sent.");
      } else toast.success(`${school.name} is now ${action === "activate" ? "active" : action === "suspend" ? "suspended (read-only)" : "archived"}.`);
      reload();
    } catch (e) {
      toast.error(e);
    } finally {
      setPending(null);
    }
  };

  const totals = {
    students: live.reduce((n, s) => n + s.usage.students, 0),
    teachers: live.reduce((n, s) => n + s.usage.teachers, 0),
    fees: live.reduce((n, s) => n + Number(s.usage.fees_collected), 0),
  };
  const maxStudents = Math.max(1, ...live.map((s) => s.usage.students));
  const plans = (["trial", "standard", "premium"] as Plan[]).map((p) => ({ plan: p, n: schools.filter((s) => s.plan === p && s.status !== "archived").length }));
  const attention = schools.filter((s) => s.status === "suspended" || (s.status === "active" && (s.usage.admins === 0 || s.usage.teachers === 0)));

  return (
    <>
      <Hero liveCount={data ? live.length : null} />

      <div className="stagger mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tilt className="rounded-2xl"><Stat label="Schools live" value={data ? live.length : "-"} icon={<Building2 aria-hidden />} hint={data ? `${schools.length - live.length} suspended or archived` : undefined} /></Tilt>
        <Tilt className="rounded-2xl"><Stat label="Students" value={data ? totals.students : "-"} icon={<GraduationCap aria-hidden />} hint="In live schools" /></Tilt>
        <Tilt className="rounded-2xl"><Stat label="Teachers" value={data ? totals.teachers : "-"} icon={<Users aria-hidden />} hint="In live schools" /></Tilt>
        <Tilt className="rounded-2xl"><Stat label="Fees this year" value={data ? <CountUp value={totals.fees} format={(n) => money(Math.round(n))} /> : "-"} icon={<Wallet aria-hidden />} tone="good" hint="Collected, current academic year" /></Tilt>
      </div>

      <Card
        title="All schools"
        icon={<Building2 aria-hidden />}
        description="Change a school's status or send its admin a new invite."
        actions={<ButtonLink href="/platform/new" size="sm"><CirclePlus aria-hidden /> Onboard a school</ButtonLink>}
      >
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1" role="tablist" aria-label="Filter by status">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={cx(
                  "flex min-h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition",
                  filter === f.key ? "border-brand bg-brand text-white shadow-sm shadow-brand/30 dark:text-slate-950" : "border-line text-soft hover:border-soft/40 hover:text-ink",
                )}
              >
                {f.label}
                {data && <span className={cx("rounded-full px-1.5 text-xs tabular-nums", filter === f.key ? "bg-white/25" : "bg-muted")}>{count(f.key)}</span>}
              </button>
            ))}
          </div>
          <Field label="Search schools" type="search" icon={<Search aria-hidden />} placeholder="Name or web address" value={search} onChange={(e) => setSearch(e.target.value)} className="md:w-72" />
        </div>
        {error && !data ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && !data ? (
          <Loading variant="table" />
        ) : shown.length === 0 ? (
          <Empty icon={<Building2 aria-hidden />} title={term || filter !== "all" ? "No schools match" : "No schools yet"} action={!term && filter === "all" && <ButtonLink href="/platform/new">Onboard the first school</ButtonLink>}>
            {term || filter !== "all" ? "Try another name or filter." : "Each school gets its own private portal and admin."}
          </Empty>
        ) : (
          <DataTable
            rows={shown}
            rowKey={(s) => s.id}
            columns={[
              {
                header: "School",
                cell: (s) => (
                  <span className="flex min-w-48 items-center gap-3">
                    <Avatar name={s.name} size="sm" />
                    <span className="min-w-0">
                      <span className="block font-semibold text-ink">{s.name}</span>
                      <span className="block text-xs text-soft">{s.subdomain}{s.board ? ` · ${s.board}` : ""}</span>
                    </span>
                  </span>
                ),
              },
              { header: "Plan", cell: (s) => <PlanBadge plan={s.plan} /> },
              { header: "Students", className: "text-right", cell: (s) => <span className="font-medium tabular-nums">{s.usage.students}</span> },
              { header: "Teachers", className: "text-right", cell: (s) => <span className="font-medium tabular-nums">{s.usage.teachers}</span> },
              { header: "Fees this year", className: "text-right", cell: (s) => <span className="whitespace-nowrap font-medium tabular-nums">{money(s.usage.fees_collected, s.currency)}</span> },
              { header: "Status", cell: (s) => <StatusBadge status={s.status} /> },
              {
                header: "",
                cell: (s) => (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <StatusSwitch school={s} pending={pending} onChange={(a) => act(s, a)} />
                    <Button
                      size="sm"
                      variant="secondary"
                      busy={pending === `${s.id}:resend-admin-invite`}
                      disabled={pending !== null || s.status === "archived"}
                      onClick={() => act(s, "resend-admin-invite")}
                      title="Email the school's first admin a new link to set their password"
                    >
                      <Mail aria-hidden /> Resend admin invite
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card title="Students per school" icon={<GraduationCap aria-hidden />} description="Live schools" className="lg:col-span-1">
          {!data ? <Loading variant="text" /> : live.length === 0 ? <Empty>No live schools yet.</Empty> : (
            <BarList items={live.map((s) => ({ label: s.name, value: (s.usage.students / maxStudents) * 100, note: String(s.usage.students) }))} />
          )}
        </Card>
        <Card title="Plans" icon={<Crown aria-hidden />} description="Schools that are not archived">
          {!data ? <Loading variant="text" /> : (
            <Donut
              size={128}
              centre={<span className="flex flex-col"><span className="text-xl font-bold tabular-nums">{plans.reduce((n, p) => n + p.n, 0)}</span><span className="text-[0.7rem] text-soft">schools</span></span>}
              segments={plans.map((p) => ({ label: PLAN_STYLE[p.plan].label, value: p.n, tone: p.plan === "premium" ? "warn" : p.plan === "standard" ? "brand" : "neutral" }))}
            />
          )}
        </Card>
        <Card title="Needs a look" icon={<Sparkles aria-hidden />} description="Suspended, or missing an admin or teachers">
          {!data ? <Loading variant="text" /> : attention.length === 0 ? (
            <Empty icon={<CircleCheck aria-hidden />}>Every live school has an admin and teachers.</Empty>
          ) : (
            <ul className="stagger space-y-2">
              {attention.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5 text-sm">
                  <span className="min-w-0 truncate font-medium">{s.name}</span>
                  <Badge tone="warn">{s.status === "suspended" ? "Suspended" : s.usage.admins === 0 ? "No admin" : "No teachers"}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <p className="mt-5 text-sm text-soft">You see head counts and fee totals only. Student records stay private to each school.</p>
    </>
  );
}

function Hero({ liveCount }: { liveCount: number | null }) {
  return (
    <section className="relative mb-6 animate-rise overflow-hidden rounded-3xl bg-aurora p-6 text-white shadow-[var(--shadow-pop)] sm:p-8">
      <div className="bg-grid absolute inset-0" aria-hidden />
      <div className="pointer-events-none absolute -right-16 -top-20 size-72 animate-float rounded-full bg-white/10 blur-2xl" aria-hidden />
      <div className="relative flex items-center justify-between gap-6">
        <div className="max-w-xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider backdrop-blur">
            <Crown className="size-3.5" aria-hidden /> Platform owner
          </span>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Your schools at a glance</h1>
          <p className="mt-2 text-white/80 sm:text-lg">
            {liveCount == null ? "Loading your schools…" : liveCount === 1 ? "1 school is live." : `${liveCount} schools are live.`} Onboard a new school, see how each one is growing, and pause or archive one with a click.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <ButtonLink href="/platform/new" className="bg-white !text-brand shadow-lg hover:bg-white/90"><CirclePlus aria-hidden /> Onboard a school</ButtonLink>
          </div>
        </div>
        <Logo3D size={190} className="-my-4 hidden shrink-0 md:block" />
      </div>
    </section>
  );
}

function PlanBadge({ plan }: { plan: Plan }) {
  const p = PLAN_STYLE[plan] ?? PLAN_STYLE.trial;
  return (
    <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold", p.className)}>
      {plan === "premium" && <Crown className="size-3" aria-hidden />}
      {p.label}
    </span>
  );
}

function StatusBadge({ status }: { status: Status }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative flex size-2.5" aria-hidden>
        {status === "active" && <span className="absolute inset-0 animate-ping rounded-full bg-green-500/60" />}
        <span className={cx("relative size-2.5 rounded-full", status === "active" ? "bg-green-500" : status === "suspended" ? "bg-amber-500" : "bg-red-500")} />
      </span>
      <Badge tone={statusTone(status)}>{status === "suspended" ? "Suspended" : status === "archived" ? "Archived" : "Active"}</Badge>
    </span>
  );
}

const SWITCH: { status: Status; action: Action; label: string; icon: React.ComponentType<{ className?: string }>; on: string }[] = [
  { status: "active", action: "activate", label: "Active", icon: CircleCheck, on: "bg-green-600 text-white shadow-sm shadow-green-600/30" },
  { status: "suspended", action: "suspend", label: "Suspend", icon: PauseCircle, on: "bg-amber-500 text-white shadow-sm shadow-amber-500/30" },
  { status: "archived", action: "archive", label: "Archive", icon: Archive, on: "bg-red-600 text-white shadow-sm shadow-red-600/30" },
];

/** Three buttons for a school's status; the current one is lit. */
function StatusSwitch({ school, pending, onChange }: { school: School; pending: string | null; onChange: (a: Action) => void }) {
  return (
    <div role="group" aria-label={`Status of ${school.name}`} className="inline-flex rounded-xl border border-line bg-muted/60 p-0.5">
      {SWITCH.map(({ status, action, label, icon: Icon, on }) => {
        const current = school.status === status;
        const busy = pending === `${school.id}:${action}`;
        return (
          <button
            key={status}
            type="button"
            aria-pressed={current}
            disabled={current || pending !== null}
            onClick={() => onChange(action)}
            className={cx(
              "flex min-h-8 items-center gap-1.5 rounded-[0.6rem] px-2.5 text-xs font-semibold transition duration-200 disabled:cursor-default",
              current ? on : "text-soft hover:bg-surface hover:text-ink hover:shadow-xs active:scale-95 disabled:opacity-50",
            )}
          >
            <Icon className={cx("size-3.5", busy && "animate-spin")} aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}
