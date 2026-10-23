"use client";

import { CircleCheck, Coins, Layers, Phone, PieChart, Plus, Search, TriangleAlert, Wallet, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SplitBars } from "@/components/charts";
import { useDialog } from "@/components/dialog";
import { useToast } from "@/components/toast";
import { Alert, Avatar, Badge, Button, Card, Checkbox, DataTable, Empty, ErrorState, Field, Loading, PageHeader, Select, Stat, Tabs, cx } from "@/components/ui";
import { api, ApiError, Page } from "@/lib/api";
import { money, todayIso } from "@/lib/format";
import { useSession } from "@/lib/session";
import { AcademicYear, BalanceRow, FeeHead, FeeStructure, FeeTotals, SchoolClass } from "@/lib/types";
import { rows, useApi, useDebounced } from "@/lib/useApi";
import { useForm } from "@/lib/useForm";

type Tab = "overview" | "students" | "defaulters" | "setup";
type Summary = {
  academic_year: string;
  currency: string;
  collected_today: string;
  collected_this_month: string;
  collected_this_year: string;
  totals: FeeTotals;
  by_class: (FeeTotals & { school_class: string | null; class_name: string })[];
  by_mode: { mode: string; amount: string }[];
};

export default function FeesPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const { school } = useSession();
  const summary = useApi<Summary>("fees/summary");
  const currency = summary.data?.currency ?? "INR";
  return (
    <>
      <PageHeader title="Fees" subtitle={`Payments are recorded here; online payment comes later.${summary.data ? ` ${summary.data.academic_year}.` : ""}`} />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        { key: "overview", label: "Overview" },
        { key: "students", label: "Students" },
        { key: "defaulters", label: "Overdue" },
        { key: "setup", label: "Fee structure" },
      ]} />
      <div key={tab} className="animate-enter">
        {tab === "overview" && (summary.data ? <Overview s={summary.data} /> : summary.error ? <ErrorState message={summary.error} onRetry={summary.reload} /> : <Loading variant="stats" />)}
        {tab === "students" && <Balances currency={currency} />}
        {tab === "defaulters" && <Defaulters currency={currency} />}
        {tab === "setup" && <Setup currency={currency} onChange={summary.reload} key={school?.school.id} />}
      </div>
    </>
  );
}

function Overview({ s }: { s: Summary }) {
  const c = s.currency;
  const billed = Number(s.totals.due) - Number(s.totals.discount);
  return (
    <div className="space-y-5">
      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Collected today" value={money(s.collected_today, c)} icon={<Coins aria-hidden />} />
        <Stat label="This month" value={money(s.collected_this_month, c)} icon={<Wallet aria-hidden />} />
        <Stat label="This year" value={money(s.collected_this_year, c)} icon={<CircleCheck aria-hidden />} tone="good" progress={billed > 0 ? (Number(s.totals.paid) / billed) * 100 : null} hint={billed > 0 ? `${Math.round((Number(s.totals.paid) / billed) * 100)}% of ${money(billed, c)} billed` : undefined} />
        <Stat label="Outstanding" value={money(s.totals.remaining, c)} icon={<TriangleAlert aria-hidden />} hint={`${money(s.totals.overdue, c)} overdue`} tone={Number(s.totals.overdue) > 0 ? "bad" : undefined} />
      </div>
      {s.by_class.length > 0 && (
        <Card title="Collected and still due" icon={<PieChart aria-hidden />}>
          <SplitBars labels={["Collected", "Still due"]} format={(n) => money(n, c)} items={s.by_class.map((r) => ({ label: r.class_name, a: Number(r.paid), b: Number(r.remaining) }))} />
        </Card>
      )}
      <Card title="By class" icon={<Layers aria-hidden />}>
        {s.by_class.length === 0 ? <Empty>No fees billed yet. Set up the fee structure, then bill students.</Empty> : (
          <DataTable
            rows={s.by_class}
            rowKey={(r) => r.school_class ?? "none"}
            columns={[
              { header: "Class", cell: (r) => r.class_name },
              { header: "Billed", cell: (r) => money(Number(r.due) - Number(r.discount), c) },
              { header: "Collected", cell: (r) => money(r.paid, c) },
              { header: "Remaining", cell: (r) => money(r.remaining, c) },
              { header: "Overdue", cell: (r) => <span className={Number(r.overdue) > 0 ? "font-medium text-red-700 dark:text-red-300" : ""}>{money(r.overdue, c)}</span> },
            ]}
          />
        )}
      </Card>
      {s.by_mode.length > 0 && (
        <Card title="Collected by mode" icon={<Coins aria-hidden />}>
          <ul className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {s.by_mode.map((m) => <li key={m.mode} className="rounded-xl bg-muted/60 px-3 py-2.5"><span className="block text-xs capitalize text-soft">{m.mode.replace("_", " ")}</span> <span className="font-semibold tabular-nums">{money(m.amount, c)}</span></li>)}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Balances({ currency }: { currency: string }) {
  const router = useRouter();
  const classes = useApi<Page<SchoolClass>>("classes/");
  const [klass, setKlass] = useState("");
  const [search, setSearch] = useState("");
  const [owing, setOwing] = useState(false);
  const term = useDebounced(search);
  const data = useApi<{ students: BalanceRow[] }>(`fees/balances?school_class=${klass}&search=${encodeURIComponent(term)}${owing ? "&status=owing" : ""}`);
  return (
    <Card title="Student balances" icon={<Wallet aria-hidden />} description="Tap a student to record a payment or see receipts.">
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Field label="Search" icon={<Search aria-hidden />} type="search" placeholder="Name or admission no." value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select label="Class" value={klass} onChange={(e) => setKlass(e.target.value)}>
          <option value="">All classes</option>
          {rows(classes.data).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Checkbox className="self-end" label="Only students who still owe" checked={owing} onChange={(e) => setOwing(e.target.checked)} />
      </div>
      {data.error && !data.data ? <ErrorState message={data.error} onRetry={data.reload} /> : !data.data ? <Loading variant="table" /> : data.data.students.length === 0 ? <Empty>No students match.</Empty> : (
        <DataTable
          rows={data.data.students}
          rowKey={(r) => r.student}
          onRowClick={(r) => router.push(`/app/fees/students/${r.student}`)}
          columns={[
            { header: "Student", cell: (r) => <span className="flex items-center gap-3"><Avatar name={r.name} size="sm" /><span><span className="block font-medium">{r.name}</span><span className="block text-xs text-soft">{r.section_name} · Adm. {r.admission_no}</span></span></span> },
            { header: "Billed", cell: (r) => money(Number(r.due) - Number(r.discount), currency) },
            { header: "Paid", cell: (r) => money(r.paid, currency) },
            { header: "Remaining", cell: (r) => <span className="font-medium">{money(r.remaining, currency)}</span> },
            { header: "Overdue", cell: (r) => <span className={Number(r.overdue) > 0 ? "text-red-700 dark:text-red-300" : "text-soft"}>{money(r.overdue, currency)}</span> },
          ]}
        />
      )}
    </Card>
  );
}

type Defaulter = BalanceRow & { parents: { name: string; email: string | null; phone: string | null }[] };

function Defaulters({ currency }: { currency: string }) {
  const data = useApi<{ as_of: string; students: Defaulter[] }>("fees/defaulters");
  if (data.error && !data.data) return <ErrorState message={data.error} onRetry={data.reload} />;
  if (!data.data) return <Loading variant="table" />;
  return (
    <Card title={`${data.data.students.length} student${data.data.students.length === 1 ? "" : "s"} with overdue fees`} icon={<TriangleAlert aria-hidden />} description="Largest first. Tap a phone number to call the parent.">
      {data.data.students.length === 0 ? <Empty icon={<CircleCheck aria-hidden />} title="Nobody is overdue">Every due date so far has been paid.</Empty> : (
        <DataTable
          rows={data.data.students}
          rowKey={(r) => r.student}
          columns={[
            { header: "Student", cell: (r) => <Link className="font-medium text-brand" href={`/app/fees/students/${r.student}`}>{r.name}</Link> },
            { header: "Section", cell: (r) => r.section_name },
            { header: "Overdue", cell: (r) => <span className="font-medium text-red-700 dark:text-red-300">{money(r.overdue, currency)}</span> },
            { header: "Remaining", cell: (r) => money(r.remaining, currency) },
            { header: "Parent", cell: (r) => r.parents.length === 0 ? "-" : (
              <span className="flex flex-col gap-1">
                {r.parents.map((p) => (
                  <span key={p.name + (p.phone ?? p.email ?? "")} className="flex flex-wrap items-center justify-end gap-x-2 sm:justify-start">
                    <span>{p.name}</span>
                    {p.phone ? <a className="inline-flex items-center gap-1 font-medium text-brand hover:underline" href={`tel:${p.phone}`}><Phone className="size-3.5" aria-hidden />{p.phone}</a> : p.email ? <a className="text-brand hover:underline" href={`mailto:${p.email}`}>{p.email}</a> : null}
                  </span>
                ))}
              </span>
            ) },
          ]}
        />
      )}
    </Card>
  );
}

function Setup({ currency, onChange }: { currency: string; onChange: () => void }) {
  const heads = useApi<FeeHead[]>("fee-heads/");
  const structures = useApi<FeeStructure[]>("fee-structures/");
  const classes = useApi<Page<SchoolClass>>("classes/");
  const years = useApi<Page<AcademicYear>>("academic-years/");
  const year = rows(years.data).find((y) => y.is_current);
  const toast = useToast();
  const dialog = useDialog();
  const [billing, setBilling] = useState(false);
  const headForm = useForm({ name: "" });

  const bill = async () => {
    setBilling(true);
    try {
      const r = await api<{ created: number; updated: number }>("fee-structures/generate-dues/", { method: "POST", body: {} });
      toast.success(`Billing is up to date: ${r.created} new fees added, ${r.updated} changed.`);
      structures.reload();
      onChange();
    } catch (e) {
      toast.error(e, "Could not bill students.");
    } finally {
      setBilling(false);
    }
  };

  const remove = async (s: FeeStructure) => {
    if (!(await dialog.confirm({ title: `Remove ${s.fee_head_name} for ${s.class_name}?`, body: "Unpaid fees billed from it are removed too. Paid fees and receipts are kept.", confirmLabel: "Remove fee", danger: true }))) return;
    try {
      await api(`fee-structures/${s.id}/`, { method: "DELETE" });
      toast.success("Fee removed.");
      structures.reload();
    } catch (e) {
      toast.error(e, "Could not remove.");
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Fee heads" icon={<Coins aria-hidden />}>
          <ul className="mb-3 flex flex-wrap gap-2 text-sm">
            {(heads.data ?? []).map((h) => <li key={h.id}><Badge tone="info">{h.name}</Badge></li>)}
          </ul>
          <form onSubmit={headForm.submit((v) => api("fee-heads/", { method: "POST", body: v }), heads.reload)} className="flex items-end gap-2">
            <Field label="New fee head" placeholder="Transport" required {...headForm.bind("name")} error={headForm.errors.name} className="flex-1" />
            <Button type="submit" variant="secondary" busy={headForm.busy}>Add</Button>
          </form>
        </Card>
        <div className="lg:col-span-2">
          <NewStructure heads={heads.data ?? []} classes={rows(classes.data)} year={year} currency={currency} onSaved={structures.reload} />
        </div>
      </div>
      <Card title="Fee structure" icon={<Layers aria-hidden />} actions={<Button onClick={bill} busy={billing}>Bill students</Button>}>
        <p className="mb-3 text-sm text-soft">After adding or changing fees, press Bill students. New students get their fees, and fees nobody has paid yet follow the changes.</p>
        {structures.error && !structures.data ? <ErrorState message={structures.error} onRetry={structures.reload} /> : !structures.data ? <Loading variant="table" /> : structures.data.length === 0 ? <Empty>No fees set for this year yet.</Empty> : (
          <DataTable
            rows={structures.data}
            rowKey={(s) => s.id}
            columns={[
              { header: "Class", cell: (s) => s.class_name },
              { header: "Fee", cell: (s) => s.fee_head_name },
              { header: "Amount", cell: (s) => money(s.amount, currency) },
              { header: "Installments", cell: (s) => s.installments.map((i) => `${i.name}: ${money(i.amount, currency)} by ${i.due_date}`).join("; ") },
              { header: "Students billed", cell: (s) => s.students_billed },
              { header: "", cell: (s) => <button className="text-sm font-medium text-red-600" onClick={() => remove(s)}>Remove</button> },
            ]}
          />
        )}
      </Card>
    </div>
  );
}

function NewStructure({ heads, classes, year, currency, onSaved }: { heads: FeeHead[]; classes: SchoolClass[]; year?: AcademicYear; currency: string; onSaved: () => void }) {
  const [classIds, setClassIds] = useState<string[]>([]);
  const [head, setHead] = useState("");
  const [parts, setParts] = useState([{ name: "Term 1", due_date: year?.start_date ?? todayIso(), amount: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const total = parts.reduce((n, p) => n + Number(p.amount || 0), 0);
  const toast = useToast();

  if (!year) return <Card title="Add a fee" icon={<Plus aria-hidden />}><p className="text-sm text-soft">Set the current academic year first.</p></Card>;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      for (const school_class of classIds) {
        await api("fee-structures/", {
          method: "POST",
          body: { academic_year: year.id, school_class, fee_head: head, amount: total.toFixed(2), installments: parts.map((p) => ({ ...p, amount: Number(p.amount || 0).toFixed(2) })) },
        });
      }
      toast.success(`Fee saved for ${classIds.length} class${classIds.length === 1 ? "" : "es"}. Press Bill students to add it to their accounts.`);
      setClassIds([]);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  const setPart = (i: number, patch: Partial<(typeof parts)[number]>) => setParts((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  return (
    <Card title="Add a fee" icon={<Plus aria-hidden />}>
      <form onSubmit={save} className="space-y-3">
        {error && <Alert>{error}</Alert>}
        <Select label="Fee head" required value={head} onChange={(e) => setHead(e.target.value)}>
          <option value="">Choose…</option>
          {heads.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </Select>
        <fieldset>
          <legend className="mb-1 text-sm font-medium">For classes</legend>
          <div className="flex flex-wrap gap-2 text-sm">
            {classes.map((c) => {
              const on = classIds.includes(c.id);
              return (
                <label key={c.id} className={cx("flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 transition", on ? "border-brand bg-brand-soft font-medium text-brand" : "border-line hover:border-brand/40")}>
                  <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={on} onChange={(e) => setClassIds((ids) => e.target.checked ? [...ids, c.id] : ids.filter((x) => x !== c.id))} />
                  {c.name}
                </label>
              );
            })}
          </div>
        </fieldset>
        <div>
          <div className="mb-1 text-sm font-medium">Installments</div>
          {parts.map((p, i) => (
            <div key={i} className="mb-2 grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
              <input aria-label="Installment name" className="min-h-11 min-w-0 rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-[var(--ring)]" value={p.name} onChange={(e) => setPart(i, { name: e.target.value })} required />
              <input aria-label="Due date" type="date" className="min-h-11 min-w-0 rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-[var(--ring)]" value={p.due_date} onChange={(e) => setPart(i, { due_date: e.target.value })} required />
              <input aria-label="Amount" type="number" min="0.01" step="0.01" placeholder="Amount" className="min-h-11 min-w-0 rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-[var(--ring)]" value={p.amount} onChange={(e) => setPart(i, { amount: e.target.value })} required />
              <button type="button" className="rounded-lg px-2 text-red-600 hover:bg-red-50 disabled:opacity-30 dark:hover:bg-red-950" disabled={parts.length === 1} onClick={() => setParts((ps) => ps.filter((_, j) => j !== i))} aria-label="Remove installment"><X className="size-4" aria-hidden /></button>
            </div>
          ))}
          <button type="button" className="text-sm font-medium text-brand hover:underline" onClick={() => setParts((ps) => [...ps, { name: `Term ${ps.length + 1}`, due_date: ps[ps.length - 1].due_date, amount: "" }])}>+ Add installment</button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" busy={busy} disabled={!head || classIds.length === 0 || total <= 0}>Save fee</Button>
          <span className="text-sm text-soft">Total {money(total, currency)} per student</span>
        </div>
      </form>
    </Card>
  );
}
