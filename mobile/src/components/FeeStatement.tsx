import { Banknote, CalendarClock, CircleCheckBig, Landmark, Plus, Receipt, ReceiptText, Smartphone, Wallet } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { api } from "@/lib/api";
import { formatDate, money, todayIso } from "@/lib/format";
import type { Icon } from "@/lib/nav";
import { useTheme } from "@/lib/theme";
import type { FeeHead, FeeStatement as Statement } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { compact, useForm } from "@/lib/useForm";
import { DateField } from "./Calendar";
import { useDialog } from "./dialog";
import { useToast } from "./toast";
import { Alert, Badge, Button, Card, Chip, DataTable, Empty, Enter, ErrorState, Field, Grid, LinkText, Loading, Press, Row, Select, Stack, Stat, Txt } from "./ui";

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
  const { tone } = useTheme();
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

  const reverse = async (p: Statement["payments"][number]) => {
    const v = await dialog.prompt({
      title: `Reverse receipt ${p.receipt_no}?`,
      body: "Payments are never edited or deleted. A reversing entry is added, and the fees it paid become due again.",
      fields: [{ name: "reason", label: "Reason", required: true, placeholder: "For example, cheque bounced" }],
      confirmLabel: "Reverse payment",
      danger: true,
    });
    if (v?.reason) api(`payments/${p.id}/reverse/`, { method: "POST", body: { reason: v.reason } }).then(() => done(`${p.receipt_no} reversed.`), fail);
  };

  const discount = async (due: Statement["dues"][number]) => {
    const v = await dialog.prompt({
      title: `Discount on ${due.name}`,
      body: `The fee is ${due.amount}. Enter 0 to remove a discount.`,
      fields: [
        { name: "discount", label: "Discount amount", type: "number", initial: due.discount, required: true },
        { name: "reason", label: "Reason", initial: due.discount_reason, placeholder: "For example, sibling or scholarship" },
      ],
      confirmLabel: "Save discount",
    });
    if (!v) return;
    api(`fee-dues/${due.id}/`, { method: "PATCH", body: { discount: v.discount || "0", discount_reason: v.reason } }).then(() => done("Discount saved."), fail);
  };

  return (
    <Stack gap={18}>
      <Grid cols={{ base: 2, lg: 4 }} gap={12}>
        <Stat label="Total due" value={money(s.totals.due, cur)} hint={Number(s.totals.discount) ? `after ${money(s.totals.discount, cur)} discount` : s.academic_year_name} />
        <Stat label="Paid" value={money(s.totals.paid, cur)} tone="good" progress={billed > 0 ? (Number(s.totals.paid) / billed) * 100 : null} />
        <Stat label="Remaining" value={money(s.totals.remaining, cur)} tone={Number(s.totals.remaining) > 0 ? "warn" : "good"} />
        <Stat label="Overdue" value={money(s.totals.overdue, cur)} tone={Number(s.totals.overdue) > 0 ? "bad" : undefined}
          hint={s.totals.next_due ? `Next: ${money(s.totals.next_due.remaining, cur)} by ${formatDate(s.totals.next_due.due_date)}` : undefined} />
      </Grid>
      {!isAdmin && <FamilyBanner s={s} />}
      {isAdmin && Number(s.totals.remaining) > 0 && (
        <RecordPayment key={s.totals.remaining} studentId={studentId} remaining={s.totals.remaining} overdue={s.totals.overdue} currency={cur} onDone={(receipt) => done(`Payment recorded. Receipt ${receipt}.`)} />
      )}
      <Card title="Fees" icon={ReceiptText}>
        {s.dues.length === 0 ? <Empty>No fees billed for {s.academic_year_name} yet.</Empty> : (
          <DataTable rows={s.dues} rowKey={(d) => d.id}
            columns={[
              { header: "Fee", flex: 2, cell: (d) => <View><Txt size="sm" weight="medium">{d.name}</Txt>{Number(d.discount) > 0 && <Txt size="xs" soft>Discount {money(d.discount, cur)}{d.discount_reason ? `: ${d.discount_reason}` : ""}</Txt>}</View> },
              { header: "Due by", cell: (d) => formatDate(d.due_date) },
              { header: "Amount", align: "right", cell: (d) => money(Number(d.amount) - Number(d.discount), cur) },
              { header: "Paid", align: "right", cell: (d) => money(d.paid, cur) },
              { header: "Remaining", align: "right", cell: (d) => <Txt size="sm" weight="semibold" tabular>{money(d.remaining, cur)}</Txt> },
              { header: "Status", cell: (d) => Number(d.remaining) <= 0 ? <Badge tone="good">Paid</Badge> : d.is_overdue ? <Badge tone="bad">Overdue</Badge> : Number(d.paid) > 0 ? <Badge tone="warn">Part paid</Badge> : <Badge>Due</Badge> },
              ...(isAdmin ? [{ header: "", cell: (d: Statement["dues"][number]) => <LinkText onPress={() => discount(d)}>Discount</LinkText> }] : []),
            ]} />
        )}
        {isAdmin && <AddCharge studentId={studentId} onDone={() => done("Charge added.")} />}
      </Card>
      <Card title="Payments and receipts" icon={Receipt}>
        {s.payments.length === 0 ? <Empty>No payments yet.</Empty> : (
          <DataTable rows={s.payments} rowKey={(p) => p.id}
            columns={[
              { header: "Receipt", cell: (p) => <LinkText href={`/app/fees/receipts/${p.id}`}>{p.receipt_no}</LinkText> },
              { header: "Date", cell: (p) => formatDate(p.paid_on) },
              { header: "Amount", align: "right", cell: (p) => <Txt size="sm" tabular color={Number(p.amount) < 0 ? tone.bad.fg : undefined}>{money(p.amount, cur)}</Txt> },
              { header: "Mode", cell: (p) => MODES.find((m) => m.key === p.mode)?.label ?? p.mode },
              { header: "Note", cell: (p) => p.is_reversal ? `Reverses ${p.reverses_receipt_no}` : p.is_reversed ? <Badge tone="bad">Reversed</Badge> : p.reference || "-" },
              ...(isAdmin ? [{ header: "", cell: (p: Statement["payments"][number]) => !p.is_reversal && !p.is_reversed ? <LinkText color={tone.bad.solid} onPress={() => reverse(p)}>Reverse</LinkText> : null }] : []),
            ]} />
        )}
      </Card>
    </Stack>
  );
}

const MODE_ICONS: Record<string, Icon> = { cash: Banknote, cheque: ReceiptText, bank_transfer: Landmark, online: Smartphone, other: Wallet };
const REFERENCE_HINT: Record<string, string> = { cash: "Optional", cheque: "Cheque number", bank_transfer: "Bank reference (UTR)", online: "Transaction ID", other: "Optional" };

function RecordPayment({ studentId, remaining, overdue, currency, onDone }: { studentId: string; remaining: string; overdue: string; currency: string; onDone: (receipt: string) => void }) {
  const { c } = useTheme();
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
  const save = () => {
    const p = check();
    setProblem(p);
    if (p) return;
    form.submit(async (v) => {
      const res = await api<{ receipt_no: string }>("payments/", { method: "POST", body: { student: studentId, ...compact(v) } });
      onDone(res.receipt_no);
    })();
  };

  return (
    <Card title="Record a payment" icon={Banknote} description="Oldest fees are paid first. A receipt number is issued straight away." border={c.brand + "4d"}>
      <Stack gap={14}>
        {form.error && <Alert>{form.error}</Alert>}
        <Grid cols={{ base: 1, md: 3 }} gap={12}>
          <View>
            <Field label={`Amount (${currency})`} keyboardType="decimal-pad" {...form.bind("amount")} error={problem ?? form.errors.amount} onChangeText={(t) => { form.set("amount", t); setProblem(null); }} />
            <Row wrap gap={6} style={{ marginTop: 8 }}>
              {quick.map((q) => <Chip key={q.label} label={`${q.label} · ${money(q.value, currency)}`} on={form.values.amount === q.value} onPress={() => { form.set("amount", q.value); setProblem(null); }} />)}
            </Row>
          </View>
          <DateField label="Date" value={form.values.paid_on} onChange={(v) => form.set("paid_on", v)} max={todayIso()} hint="Can't be in the future." error={form.errors.paid_on} />
          <Field label={needsReference ? `Reference (${REFERENCE_HINT[form.values.mode]})` : "Reference (optional)"} placeholder={REFERENCE_HINT[form.values.mode]} maxLength={100} {...form.bind("reference")} />
        </Grid>
        <View>
          <Txt size="sm" weight="medium" style={{ marginBottom: 6 }}>Paid by</Txt>
          <Grid cols={{ base: 2, md: 5 }} gap={8}>
            {MODES.map((m) => {
              const IconC = MODE_ICONS[m.key] ?? Wallet;
              const on = form.values.mode === m.key;
              return (
                <Press key={m.key} onPress={() => form.set("mode", m.key)} scale={0.95} accessibilityRole="radio" accessibilityState={{ checked: on }}
                  style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 2, paddingHorizontal: 12, borderColor: on ? c.brand : c.line, backgroundColor: on ? c.brandSoft : c.surface }}>
                  <IconC size={16} color={on ? c.brand : c.soft} />
                  <Txt size="sm" weight="medium" color={on ? c.brand : c.soft} numberOfLines={1}>{m.label}</Txt>
                </Press>
              );
            })}
          </Grid>
        </View>
        <Field label="Note" optional maxLength={500} {...form.bind("notes")} />
        <Button icon={Receipt} busy={form.busy} onPress={save}>Save and issue receipt</Button>
      </Stack>
    </Card>
  );
}

function AddCharge({ studentId, onDone }: { studentId: string; onDone: () => void }) {
  const { c } = useTheme();
  const heads = useApi<FeeHead[]>("fee-heads/");
  const [open, setOpen] = useState(false);
  const form = useForm({ fee_head: "", name: "", amount: "", due_date: todayIso() });
  if (!open) return <Button variant="ghost" icon={Plus} style={{ marginTop: 12 }} onPress={() => setOpen(true)}>Add a one-off charge</Button>;
  return (
    <Enter style={{ marginTop: 14 }}>
      <View style={{ borderRadius: 18, borderWidth: 1, borderColor: c.line, backgroundColor: c.muted + "66", padding: 14, gap: 12 }}>
        {form.error && <Alert>{form.error}</Alert>}
        <Grid cols={{ base: 1, md: 2 }} gap={12}>
          <Select label="Fee head" {...form.bind("fee_head")} options={(heads.data ?? []).map((h) => ({ value: h.id, label: h.name }))} />
          <Field label="Description" placeholder="Lost library book" {...form.bind("name")} />
          <Field label="Amount" keyboardType="decimal-pad" {...form.bind("amount")} />
          <DateField label="Due by" value={form.values.due_date} onChange={(v) => form.set("due_date", v)} error={form.errors.due_date} />
        </Grid>
        <Row gap={8}>
          <Button variant="secondary" busy={form.busy} onPress={form.submit((v) => api("fee-dues/", { method: "POST", body: { student: studentId, ...v } }), () => { setOpen(false); onDone(); })}>Add charge</Button>
          <Button variant="ghost" onPress={() => setOpen(false)}>Cancel</Button>
        </Row>
      </View>
    </Enter>
  );
}

/** For students and parents: the one thing to know, in plain words. */
function FamilyBanner({ s }: { s: Statement }) {
  const { tone } = useTheme();
  const cur = s.currency;
  if (Number(s.totals.due) === 0) return null;
  if (Number(s.totals.remaining) <= 0) {
    return (
      <Enter>
        <Row gap={14} style={{ borderRadius: 22, borderWidth: 1, borderColor: tone.good.border, backgroundColor: tone.good.bg, padding: 18 }}>
          <CircleCheckBig size={38} color={tone.good.solid} />
          <View style={{ flex: 1 }}>
            <Txt size="lg" weight="bold">All fees for {s.academic_year_name} are paid</Txt>
            <Txt size="sm" soft>Thank you. Every receipt is listed below.</Txt>
          </View>
        </Row>
      </Enter>
    );
  }
  const overdue = Number(s.totals.overdue) > 0;
  const next = s.totals.next_due;
  const t = overdue ? tone.bad : tone.warn;
  return (
    <Enter>
      <Row gap={14} style={{ borderRadius: 22, borderWidth: 1, borderColor: t.border, backgroundColor: t.bg, padding: 18 }}>
        <CalendarClock size={38} color={t.solid} />
        <View style={{ flex: 1 }}>
          <Txt size="lg" weight="bold">{overdue ? `${money(s.totals.overdue, cur)} is overdue` : next ? `Next: ${money(next.remaining, cur)} by ${formatDate(next.due_date)}` : `${money(s.totals.remaining, cur)} still to pay`}</Txt>
          <Txt size="sm" soft>Pay at the school office; your receipt then appears here. {money(s.totals.remaining, cur)} is left for {s.academic_year_name}.</Txt>
        </View>
      </Row>
    </Enter>
  );
}

