"use client";

import Link from "next/link";
import { useState } from "react";
import { Banknote, CalendarClock, CircleCheckBig, Landmark, Receipt, ReceiptText, Smartphone, Wallet } from "lucide-react";
import { useDialog } from "@/components/dialog";
import { useToast } from "@/components/toast";
import { Alert, Badge, Button, Card, DataTable, Empty, ErrorState, Field, Loading, Select, Stat, cx } from "@/components/ui";
import { api } from "@/lib/api";
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
  const toast = useToast();
  const dialog = useDialog();
  if (data.error && !data.data) return <ErrorState message={data.error} onRetry={data.reload} />;
  if (!data.data) return <Loading variant="stats" />;
  const s = data.data;
  const cur = s.currency;
  const done = (text: string) => { toast.success(text); data.reload(); };
  const fail = (e: unknown) => toast.error(e);
  const billed = Number(s.totals.due) - Number(s.totals.discount);

  return (
    <div className="space-y-5">
      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total due" value={money(s.totals.due, cur)} hint={Number(s.totals.discount) ? `after ${money(s.totals.discount, cur)} discount` : s.academic_year_name} />
        <Stat label="Paid" value={money(s.totals.paid, cur)} tone="good" progress={billed > 0 ? (Number(s.totals.paid) / billed) * 100 : null} />
        <Stat label="Remaining" value={money(s.totals.remaining, cur)} tone={Number(s.totals.remaining) > 0 ? "warn" : "good"} />
        <Stat label="Overdue" value={money(s.totals.overdue, cur)} tone={Number(s.totals.overdue) > 0 ? "bad" : undefined}
          hint={s.totals.next_due ? `Next: ${money(s.totals.next_due.remaining, cur)} by ${formatDate(s.totals.next_due.due_date)}` : undefined} />
      </div>
      {!isAdmin && <FamilyBanner s={s} />}
      {isAdmin && Number(s.totals.remaining) > 0 && (
        <RecordPayment key={s.totals.remaining} studentId={studentId} remaining={s.totals.remaining} overdue={s.totals.overdue} currency={cur} onDone={(receipt) => done(`Payment recorded. Receipt ${receipt}.`)} />
      )}
      <Card title="Fees" icon={<ReceiptText aria-hidden />}>
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
      <Card title="Payments and receipts" icon={<Receipt aria-hidden />}>
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
                  <button className="text-sm font-medium text-red-600" onClick={async () => {
                    const v = await dialog.prompt({
                      title: `Reverse receipt ${p.receipt_no}?`,
                      body: "Payments are never edited or deleted. A reversing entry is added, and the fees it paid become due again.",
                      fields: [{ name: "reason", label: "Reason", required: true, placeholder: "For example, cheque bounced" }],
                      confirmLabel: "Reverse payment",
                      danger: true,
                    });
                    if (v?.reason) api(`payments/${p.id}/reverse/`, { method: "POST", body: { reason: v.reason } }).then(() => done(`${p.receipt_no} reversed.`), fail);
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

const MODE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = { cash: Banknote, cheque: ReceiptText, bank_transfer: Landmark, online: Smartphone, other: Wallet };
const REFERENCE_HINT: Record<string, string> = { cash: "Optional", cheque: "Cheque number", bank_transfer: "Bank reference (UTR)", online: "Transaction ID", other: "Optional" };

function RecordPayment({ studentId, remaining, overdue, currency, onDone }: { studentId: string; remaining: string; overdue: string; currency: string; onDone: (receipt: string) => void }) {
  const form = useForm({ amount: remaining, paid_on: todayIso(), mode: "cash", reference: "", notes: "" });
  const [problem, setProblem] = useState<string | null>(null);
  const max = Number(remaining);
  const quick = [
    { label: "Full balance", value: remaining },
    ...(Number(overdue) > 0 && Number(overdue) < max ? [{ label: "Overdue only", value: overdue }] : []),
    ...(max >= 2 ? [{ label: "Half", value: (Math.round((max / 2) * 100) / 100).toFixed(2) }] : []),
  ];
  const needsReference = ["cheque", "bank_transfer", "online"].includes(form.values.mode);

  const check = () => {
    const amount = Number(form.values.amount);
    if (!form.values.amount || !(amount > 0)) return "Enter an amount more than zero.";
    if (amount > max) return `That is more than the ${money(remaining, currency)} still due.`;
    if (!/^\d+(\.\d{1,2})?$/.test(form.values.amount)) return "Use at most two decimal places.";
    return null;
  };

  return (
    <Card title="Record a payment" icon={<Banknote aria-hidden />} description="Oldest fees are paid first. A receipt number is issued straight away." className="border-brand/30">
      <form
        onSubmit={(e) => {
          const p = check();
          setProblem(p);
          if (p) {
            e.preventDefault();
            return;
          }
          return form.submit(async (v) => {
            const res = await api<{ receipt_no: string }>("payments/", { method: "POST", body: { student: studentId, ...compact(v) } });
            onDone(res.receipt_no);
          })(e);
        }}
        noValidate
        className="space-y-4"
      >
        {form.error && <Alert>{form.error}</Alert>}
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Field label={`Amount (${currency})`} type="number" inputMode="decimal" min="0.01" max={remaining} step="0.01" {...form.bind("amount")} error={problem ?? form.errors.amount}
              onChange={(e) => { form.bind("amount").onChange(e); setProblem(null); }} />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {quick.map((q) => (
                <button key={q.label} type="button" onClick={() => { form.setValues((v) => ({ ...v, amount: q.value })); setProblem(null); }}
                  className={cx("rounded-full border px-2.5 py-1 text-xs font-medium transition", form.values.amount === q.value ? "border-brand bg-brand-soft text-brand" : "border-line text-soft hover:text-ink")}>
                  {q.label} · {money(q.value, currency)}
                </button>
              ))}
            </div>
          </div>
          <Field label="Date" type="date" max={todayIso()} required {...form.bind("paid_on")} hint="Can't be in the future." />
          <Field label={needsReference ? `Reference (${REFERENCE_HINT[form.values.mode]})` : "Reference (optional)"} placeholder={REFERENCE_HINT[form.values.mode]} maxLength={100} {...form.bind("reference")} />
        </div>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Paid by</legend>
          <div role="radiogroup" aria-label="Paid by" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {MODES.map((m) => {
              const Icon = MODE_ICONS[m.key] ?? Wallet;
              const on = form.values.mode === m.key;
              return (
                <button key={m.key} type="button" role="radio" aria-checked={on} onClick={() => form.setValues((v) => ({ ...v, mode: m.key }))}
                  className={cx("flex min-h-12 items-center gap-2 rounded-xl border-2 px-3 text-sm font-medium transition duration-150 active:scale-95", on ? "border-brand bg-brand-soft text-brand" : "border-line text-soft hover:border-soft/40 hover:text-ink")}>
                  <Icon className="size-4 shrink-0" aria-hidden /> {m.label}
                </button>
              );
            })}
          </div>
        </fieldset>
        <Field label="Note (optional)" maxLength={500} {...form.bind("notes")} />
        <Button type="submit" busy={form.busy}><Receipt aria-hidden /> Save and issue receipt</Button>
      </form>
    </Card>
  );
}

function Discount({ due, onDone, onError }: { due: Statement["dues"][number]; onDone: () => void; onError: (e: unknown) => void }) {
  const dialog = useDialog();
  return (
    <button
      className="text-sm font-medium text-brand"
      onClick={async () => {
        const v = await dialog.prompt({
          title: `Discount on ${due.name}`,
          body: `The fee is ${due.amount}. Enter 0 to remove a discount.`,
          fields: [
            { name: "discount", label: "Discount amount", type: "number", min: "0", step: "0.01", initial: due.discount, required: true },
            { name: "reason", label: "Reason", initial: due.discount_reason, placeholder: "For example, sibling or scholarship" },
          ],
          confirmLabel: "Save discount",
        });
        if (!v) return;
        api(`fee-dues/${due.id}/`, { method: "PATCH", body: { discount: v.discount || "0", discount_reason: v.reason } }).then(onDone, onError);
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
      className="mt-4 grid animate-enter gap-3 rounded-2xl border border-line bg-muted/40 p-4 sm:grid-cols-4"
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

/** For students and parents: the one thing to know, in plain words. */
function FamilyBanner({ s }: { s: Statement }) {
  const cur = s.currency;
  if (Number(s.totals.due) === 0) return null;
  if (Number(s.totals.remaining) <= 0) {
    return (
      <div className="flex animate-rise items-center gap-4 rounded-3xl border border-green-200 bg-green-50 p-5 dark:border-green-900 dark:bg-green-950/40">
        <CircleCheckBig className="size-10 shrink-0 text-green-600" aria-hidden />
        <div><p className="text-lg font-bold">All fees for {s.academic_year_name} are paid</p><p className="text-sm text-soft">Thank you. Every receipt is listed below.</p></div>
      </div>
    );
  }
  const overdue = Number(s.totals.overdue) > 0;
  const next = s.totals.next_due;
  return (
    <div className={cx("flex animate-rise flex-wrap items-center gap-4 rounded-3xl border p-5", overdue ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40" : "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40")}>
      <CalendarClock className={cx("size-10 shrink-0", overdue ? "text-red-600" : "text-amber-600")} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-lg font-bold">{overdue ? `${money(s.totals.overdue, cur)} is overdue` : next ? `Next: ${money(next.remaining, cur)} by ${formatDate(next.due_date)}` : `${money(s.totals.remaining, cur)} still to pay`}</p>
        <p className="text-sm text-soft">Pay at the school office; your receipt then appears here. {money(s.totals.remaining, cur)} is left for {s.academic_year_name}.</p>
      </div>
    </div>
  );
}
