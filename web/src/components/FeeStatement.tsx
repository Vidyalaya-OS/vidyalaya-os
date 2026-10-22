"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert, Badge, Button, Card, DataTable, Empty, Field, Loading, Select, Stat } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { formatDate, money, todayIso } from "@/lib/format";
import { FeeHead, FeeStatement as Statement } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { compact, useForm } from "@/lib/useForm";

export const MODES = [
  { key: "cash", label: "Cash" },
  { key: "cheque", label: "Cheque" },
  { key: "bank_transfer", label: "Bank transfer" },
  { key: "online", label: "Online" },
  { key: "other", label: "Other" },
];

/** A student's dues, what is paid and what remains, and their receipts.
 * Admins can also record payments, give discounts and reverse mistakes. */
export function FeeStatement({ studentId, isAdmin }: { studentId: string; isAdmin: boolean }) {
  const data = useApi<Statement>(`fees/students/${studentId}`);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  if (data.error) return <Alert>{data.error}</Alert>;
  if (!data.data) return <Loading />;
  const s = data.data;
  const cur = s.currency;
  const done = (text: string) => { setNotice({ tone: "success", text }); data.reload(); };
  const fail = (e: unknown) => setNotice({ tone: "error", text: e instanceof ApiError ? e.message : "That did not work." });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total due" value={money(s.totals.due, cur)} hint={Number(s.totals.discount) ? `after ${money(s.totals.discount, cur)} discount` : s.academic_year_name} />
        <Stat label="Paid" value={money(s.totals.paid, cur)} tone="good" />
        <Stat label="Remaining" value={money(s.totals.remaining, cur)} tone={Number(s.totals.remaining) > 0 ? "warn" : "good"} />
        <Stat label="Overdue" value={money(s.totals.overdue, cur)} tone={Number(s.totals.overdue) > 0 ? "bad" : undefined}
          hint={s.totals.next_due ? `Next: ${money(s.totals.next_due.remaining, cur)} by ${formatDate(s.totals.next_due.due_date)}` : undefined} />
      </div>
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      {isAdmin && Number(s.totals.remaining) > 0 && (
        <RecordPayment key={s.totals.remaining} studentId={studentId} remaining={s.totals.remaining} currency={cur} onDone={(receipt) => done(`Payment recorded. Receipt ${receipt}.`)} />
      )}
      <Card title="Fees">
        {s.dues.length === 0 ? <Empty>No fees billed for {s.academic_year_name} yet.</Empty> : (
          <DataTable
            rows={s.dues}
            rowKey={(d) => d.id}
            columns={[
              { header: "Fee", cell: (d) => <><div className="font-medium">{d.name}</div>{Number(d.discount) > 0 && <div className="text-xs text-soft">Discount {money(d.discount, cur)}{d.discount_reason ? `: ${d.discount_reason}` : ""}</div>}</> },
              { header: "Due by", cell: (d) => formatDate(d.due_date) },
              { header: "Amount", cell: (d) => money(Number(d.amount) - Number(d.discount), cur) },
              { header: "Paid", cell: (d) => money(d.paid, cur) },
              { header: "Remaining", cell: (d) => <span className="font-medium">{money(d.remaining, cur)}</span> },
              { header: "Status", cell: (d) => Number(d.remaining) <= 0 ? <Badge tone="good">Paid</Badge> : d.is_overdue ? <Badge tone="bad">Overdue</Badge> : Number(d.paid) > 0 ? <Badge tone="warn">Part paid</Badge> : <Badge>Due</Badge> },
              ...(isAdmin ? [{ header: "", cell: (d: Statement["dues"][number]) => <Discount due={d} onDone={() => done("Discount saved.")} onError={fail} /> }] : []),
            ]}
          />
        )}
        {isAdmin && <AddCharge studentId={studentId} onDone={() => done("Charge added.")} />}
      </Card>
      <Card title="Payments and receipts">
        {s.payments.length === 0 ? <Empty>No payments yet.</Empty> : (
          <DataTable
            rows={s.payments}
            rowKey={(p) => p.id}
            columns={[
              { header: "Receipt", cell: (p) => <Link className="font-medium text-brand" href={`/app/fees/receipts/${p.id}`}>{p.receipt_no}</Link> },
              { header: "Date", cell: (p) => formatDate(p.paid_on) },
              { header: "Amount", cell: (p) => <span className={Number(p.amount) < 0 ? "text-red-700 dark:text-red-300" : ""}>{money(p.amount, cur)}</span> },
              { header: "Mode", cell: (p) => MODES.find((m) => m.key === p.mode)?.label ?? p.mode },
              { header: "Note", cell: (p) => p.is_reversal ? `Reverses ${p.reverses_receipt_no}` : p.is_reversed ? <Badge tone="bad">Reversed</Badge> : p.reference || "-" },
              ...(isAdmin ? [{
                header: "",
                cell: (p: Statement["payments"][number]) => !p.is_reversal && !p.is_reversed ? (
                  <button className="text-xs text-red-600" onClick={() => {
                    const reason = prompt(`Reverse ${p.receipt_no}? Give a reason (for example, cheque bounced).`);
                    if (reason) api(`payments/${p.id}/reverse/`, { method: "POST", body: { reason } }).then(() => done(`${p.receipt_no} reversed.`), fail);
                  }}>Reverse</button>
                ) : null,
              }] : []),
            ]}
          />
        )}
      </Card>
    </div>
  );
}

function RecordPayment({ studentId, remaining, currency, onDone }: { studentId: string; remaining: string; currency: string; onDone: (receipt: string) => void }) {
  const form = useForm({ amount: remaining, paid_on: todayIso(), mode: "cash", reference: "", notes: "" });
  return (
    <Card title="Record a payment">
      <form
        onSubmit={form.submit(async (v) => {
          const p = await api<{ receipt_no: string }>("payments/", { method: "POST", body: { student: studentId, ...compact(v) } });
          onDone(p.receipt_no);
        })}
        className="grid gap-3 sm:grid-cols-3"
      >
        {form.error && <div className="sm:col-span-3"><Alert>{form.error}</Alert></div>}
        <Field label={`Amount (${currency})`} type="number" min="0.01" step="0.01" required hint={`Up to ${money(remaining, currency)}. Oldest fees are paid first.`} {...form.bind("amount")} />
        <Field label="Date" type="date" max={todayIso()} required {...form.bind("paid_on")} />
        <Select label="Mode" {...form.bind("mode")}>
          {MODES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </Select>
        <Field label="Reference" placeholder="Cheque or transaction no." {...form.bind("reference")} />
        <Field label="Note" {...form.bind("notes")} className="sm:col-span-2" />
        <Button type="submit" busy={form.busy} className="sm:justify-self-start">Save and issue receipt</Button>
      </form>
    </Card>
  );
}

function Discount({ due, onDone, onError }: { due: Statement["dues"][number]; onDone: () => void; onError: (e: unknown) => void }) {
  return (
    <button
      className="text-xs text-brand"
      onClick={() => {
        const amount = prompt(`Discount on ${due.name} (amount ${due.amount})`, due.discount);
        if (amount == null) return;
        const reason = prompt("Reason (for example, sibling or scholarship)", due.discount_reason) ?? "";
        api(`fee-dues/${due.id}/`, { method: "PATCH", body: { discount: amount || "0", discount_reason: reason } }).then(onDone, onError);
      }}
    >
      Discount
    </button>
  );
}

function AddCharge({ studentId, onDone }: { studentId: string; onDone: () => void }) {
  const heads = useApi<FeeHead[]>("fee-heads/");
  const [open, setOpen] = useState(false);
  const form = useForm({ fee_head: "", name: "", amount: "", due_date: todayIso() });
  if (!open) return <Button variant="ghost" className="mt-3" onClick={() => setOpen(true)}>Add a one-off charge</Button>;
  return (
    <form
      onSubmit={form.submit((v) => api("fee-dues/", { method: "POST", body: { student: studentId, ...v } }), () => { setOpen(false); onDone(); })}
      className="mt-4 grid gap-3 rounded-lg border border-line p-3 sm:grid-cols-4"
    >
      {form.error && <div className="sm:col-span-4"><Alert>{form.error}</Alert></div>}
      <Select label="Fee head" required {...form.bind("fee_head")}>
        <option value="">Choose…</option>
        {(heads.data ?? []).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
      </Select>
      <Field label="Description" required placeholder="Lost library book" {...form.bind("name")} />
      <Field label="Amount" type="number" min="0.01" step="0.01" required {...form.bind("amount")} />
      <Field label="Due by" type="date" required {...form.bind("due_date")} />
      <div className="flex gap-2 sm:col-span-4">
        <Button type="submit" busy={form.busy} variant="secondary">Add charge</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}

