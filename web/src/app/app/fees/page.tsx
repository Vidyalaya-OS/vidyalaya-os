"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Card, DataTable, Empty, Field, Loading, PageHeader, Select, Stat, Tabs } from "@/components/ui";
import { api, ApiError, Page } from "@/lib/api";
import { money, todayIso } from "@/lib/format";
import { useSession } from "@/lib/session";
import { AcademicYear, BalanceRow, FeeHead, FeeStructure, FeeTotals, SchoolClass } from "@/lib/types";
import { rows, useApi } from "@/lib/useApi";
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
      {summary.error && <Alert>{summary.error}</Alert>}
      {tab === "overview" && (summary.data ? <Overview s={summary.data} /> : !summary.error && <Loading />)}
      {tab === "students" && <Balances currency={currency} />}
      {tab === "defaulters" && <Defaulters currency={currency} />}
      {tab === "setup" && <Setup currency={currency} onChange={summary.reload} key={school?.school.id} />}
    </>
  );
}

function Overview({ s }: { s: Summary }) {
  const c = s.currency;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Collected today" value={money(s.collected_today, c)} />
        <Stat label="This month" value={money(s.collected_this_month, c)} />
        <Stat label="This year" value={money(s.collected_this_year, c)} tone="good" />
        <Stat label="Outstanding" value={money(s.totals.remaining, c)} hint={`${money(s.totals.overdue, c)} overdue`} tone={Number(s.totals.overdue) > 0 ? "bad" : undefined} />
      </div>
      <Card title="By class">
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
        <Card title="Collected by mode">
          <ul className="flex flex-wrap gap-4 text-sm">
            {s.by_mode.map((m) => <li key={m.mode}><span className="text-soft">{m.mode.replace("_", " ")}</span> <span className="font-medium">{money(m.amount, c)}</span></li>)}
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
  const data = useApi<{ students: BalanceRow[] }>(`fees/balances?school_class=${klass}&search=${encodeURIComponent(search)}${owing ? "&status=owing" : ""}`);
  return (
    <Card>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Field label="Search" placeholder="Name or admission no." value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select label="Class" value={klass} onChange={(e) => setKlass(e.target.value)}>
          <option value="">All classes</option>
          {rows(classes.data).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={owing} onChange={(e) => setOwing(e.target.checked)} /> Only students who still owe</label>
      </div>
      {!data.data ? <Loading /> : data.data.students.length === 0 ? <Empty>No students match.</Empty> : (
        <DataTable
          rows={data.data.students}
          rowKey={(r) => r.student}
          onRowClick={(r) => router.push(`/app/fees/students/${r.student}`)}
          columns={[
            { header: "Student", cell: (r) => <><div className="font-medium">{r.name}</div><div className="text-xs text-soft">{r.section_name} · Adm. {r.admission_no}</div></> },
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
  if (!data.data) return <Loading />;
  return (
    <Card title={`${data.data.students.length} students with overdue fees`}>
      {data.data.students.length === 0 ? <Empty>Nobody is overdue.</Empty> : (
        <DataTable
          rows={data.data.students}
          rowKey={(r) => r.student}
          columns={[
            { header: "Student", cell: (r) => <Link className="font-medium text-brand" href={`/app/fees/students/${r.student}`}>{r.name}</Link> },
            { header: "Section", cell: (r) => r.section_name },
            { header: "Overdue", cell: (r) => <span className="font-medium text-red-700 dark:text-red-300">{money(r.overdue, currency)}</span> },
            { header: "Remaining", cell: (r) => money(r.remaining, currency) },
            { header: "Parent", cell: (r) => r.parents.map((p) => `${p.name}${p.phone ? ` ${p.phone}` : p.email ? ` ${p.email}` : ""}`).join(", ") || "-" },
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
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const headForm = useForm({ name: "" });

  const bill = async () => {
    try {
      const r = await api<{ created: number; updated: number }>("fee-structures/generate-dues/", { method: "POST", body: {} });
      setNotice({ tone: "success", text: `Billing is up to date: ${r.created} new fees added, ${r.updated} changed.` });
      structures.reload();
      onChange();
    } catch (e) {
      setNotice({ tone: "error", text: e instanceof ApiError ? e.message : "Could not bill students." });
    }
  };

  const remove = async (s: FeeStructure) => {
    if (!confirm(`Remove ${s.fee_head_name} for ${s.class_name}? Unpaid fees billed from it are removed too.`)) return;
    try {
      await api(`fee-structures/${s.id}/`, { method: "DELETE" });
      structures.reload();
    } catch (e) {
      setNotice({ tone: "error", text: e instanceof ApiError ? e.message : "Could not remove." });
    }
  };

  return (
    <div className="space-y-5">
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Fee heads">
          <ul className="mb-3 flex flex-wrap gap-2 text-sm">
            {(heads.data ?? []).map((h) => <li key={h.id} className="rounded-lg border border-line px-3 py-1">{h.name}</li>)}
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
      <Card title="Fee structure" actions={<Button onClick={bill}>Bill students</Button>}>
        <p className="mb-3 text-sm text-soft">After adding or changing fees, press Bill students. New students get their fees, and fees nobody has paid yet follow the changes.</p>
        {!structures.data ? <Loading /> : structures.data.length === 0 ? <Empty>No fees set for this year yet.</Empty> : (
          <DataTable
            rows={structures.data}
            rowKey={(s) => s.id}
            columns={[
              { header: "Class", cell: (s) => s.class_name },
              { header: "Fee", cell: (s) => s.fee_head_name },
              { header: "Amount", cell: (s) => money(s.amount, currency) },
              { header: "Installments", cell: (s) => s.installments.map((i) => `${i.name}: ${money(i.amount, currency)} by ${i.due_date}`).join("; ") },
              { header: "Students billed", cell: (s) => s.students_billed },
              { header: "", cell: (s) => <button className="text-xs text-red-600" onClick={() => remove(s)}>Remove</button> },
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

  if (!year) return <Card title="Add a fee"><p className="text-sm text-soft">Set the current academic year first.</p></Card>;

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
    <Card title="Add a fee">
      <form onSubmit={save} className="space-y-3">
        {error && <Alert>{error}</Alert>}
        <Select label="Fee head" required value={head} onChange={(e) => setHead(e.target.value)}>
          <option value="">Choose…</option>
          {heads.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </Select>
        <fieldset>
          <legend className="mb-1 text-sm font-medium">For classes</legend>
          <div className="flex flex-wrap gap-3 text-sm">
            {classes.map((c) => (
              <label key={c.id} className="flex items-center gap-1">
                <input type="checkbox" checked={classIds.includes(c.id)} onChange={(e) => setClassIds((ids) => e.target.checked ? [...ids, c.id] : ids.filter((x) => x !== c.id))} />
                {c.name}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <div className="mb-1 text-sm font-medium">Installments</div>
          {parts.map((p, i) => (
            <div key={i} className="mb-2 grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
              <input aria-label="Installment name" className="min-h-10 rounded-lg border border-line bg-surface px-2 text-sm" value={p.name} onChange={(e) => setPart(i, { name: e.target.value })} required />
              <input aria-label="Due date" type="date" className="min-h-10 rounded-lg border border-line bg-surface px-2 text-sm" value={p.due_date} onChange={(e) => setPart(i, { due_date: e.target.value })} required />
              <input aria-label="Amount" type="number" min="0.01" step="0.01" placeholder="Amount" className="min-h-10 rounded-lg border border-line bg-surface px-2 text-sm" value={p.amount} onChange={(e) => setPart(i, { amount: e.target.value })} required />
              <button type="button" className="px-2 text-sm text-red-600 disabled:opacity-30" disabled={parts.length === 1} onClick={() => setParts((ps) => ps.filter((_, j) => j !== i))} aria-label="Remove installment">✕</button>
            </div>
          ))}
          <button type="button" className="text-sm text-brand" onClick={() => setParts((ps) => [...ps, { name: `Term ${ps.length + 1}`, due_date: ps[ps.length - 1].due_date, amount: "" }])}>+ Add installment</button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" busy={busy} disabled={!head || classIds.length === 0 || total <= 0}>Save fee</Button>
          <span className="text-sm text-soft">Total {money(total, currency)} per student</span>
        </div>
      </form>
    </Card>
  );
}
