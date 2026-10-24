import { CircleCheck, Coins, Layers, Phone, PieChart, Plus, Search, TriangleAlert, Wallet, X } from "lucide-react-native";
import { useState } from "react";
import { Linking, View } from "react-native";
import { DateField } from "@/components/Calendar";
import { Ring, SplitBars } from "@/components/charts";
import { useDialog } from "@/components/dialog";
import { useToast } from "@/components/toast";
import {
  Alert, Avatar, Badge, Button, Card, Checkbox, Chip, DataTable, Empty, Enter, ErrorState, Field, Grid, IconButton, LinkText, Loading, PageHeader, Row, Screen,
  Select, Span, Stack, Stat, Tabs, Txt, go,
} from "@/components/ui";
import { api, ApiError, Page } from "@/lib/api";
import { money, todayIso } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import type { AcademicYear, BalanceRow, FeeHead, FeeStructure, FeeTotals, SchoolClass } from "@/lib/types";
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
    <Screen>
      <PageHeader title="Fees" subtitle={`Payments are recorded here; online payment comes later.${summary.data ? ` ${summary.data.academic_year}.` : ""}`} />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        { key: "overview", label: "Overview" },
        { key: "students", label: "Students" },
        { key: "defaulters", label: "Overdue" },
        { key: "setup", label: "Structure" },
      ]} />
      <Enter key={tab}>
        {tab === "overview" && (summary.data ? <Overview s={summary.data} /> : summary.error ? <ErrorState message={summary.error} onRetry={summary.reload} /> : <Loading variant="stats" />)}
        {tab === "students" && <Balances currency={currency} />}
        {tab === "defaulters" && <Defaulters currency={currency} />}
        {tab === "setup" && <Setup currency={currency} onChange={summary.reload} key={school?.school.id} />}
      </Enter>
    </Screen>
  );
}

function Overview({ s }: { s: Summary }) {
  const { c: col, tone } = useTheme();
  const c = s.currency;
  const billed = Number(s.totals.due) - Number(s.totals.discount);
  const share = billed > 0 ? Number(s.totals.paid) / billed : 0;
  return (
    <Stack gap={18}>
      <Grid cols={{ base: 2, lg: 4 }} gap={12}>
        <Stat label="Collected today" value={money(s.collected_today, c)} icon={Coins} />
        <Stat label="This month" value={money(s.collected_this_month, c)} icon={Wallet} />
        <Stat label="This year" value={money(s.collected_this_year, c)} icon={CircleCheck} tone="good" progress={billed > 0 ? share * 100 : null}
          hint={billed > 0 ? `${Math.round(share * 100)}% of ${money(billed, c)} billed` : undefined} />
        <Stat label="Outstanding" value={money(s.totals.remaining, c)} icon={TriangleAlert} hint={`${money(s.totals.overdue, c)} overdue`} tone={Number(s.totals.overdue) > 0 ? "bad" : undefined} />
      </Grid>
      {s.by_class.length > 0 && (
        <Card title="Collected and still due" icon={PieChart}>
          <Row wrap gap={18} style={{ marginBottom: 18, borderRadius: 18, backgroundColor: col.muted + "80", padding: 14 }}>
            <Ring value={billed > 0 ? Math.round(share * 100) : null} size={92} label="collected" tone={billed > 0 && share >= 0.75 ? "good" : "warn"} />
            <View style={{ flex: 1, minWidth: 180 }}>
              <Txt weight="semibold">{money(s.totals.paid, c)} of {money(billed, c)} collected</Txt>
              <Txt size="sm" soft>{money(s.totals.remaining, c)} still to come in, {money(s.totals.overdue, c)} of it overdue. The Overdue tab lists who to call.</Txt>
            </View>
          </Row>
          <SplitBars labels={["Collected", "Still due"]} format={(n) => money(n, c)} items={s.by_class.map((r) => ({ label: r.class_name, a: Number(r.paid), b: Number(r.remaining) }))} />
        </Card>
      )}
      <Card title="By class" icon={Layers}>
        {s.by_class.length === 0 ? <Empty>No fees billed yet. Set up the fee structure, then bill students.</Empty> : (
          <DataTable rows={s.by_class} rowKey={(r) => r.school_class ?? "none"}
            columns={[
              { header: "Class", flex: 1.4, cell: (r) => <Txt size="sm" weight="medium">{r.class_name}</Txt> },
              { header: "Billed", align: "right", cell: (r) => money(Number(r.due) - Number(r.discount), c) },
              { header: "Collected", align: "right", cell: (r) => money(r.paid, c) },
              { header: "Remaining", align: "right", cell: (r) => money(r.remaining, c) },
              { header: "Overdue", align: "right", cell: (r) => <Txt size="sm" tabular weight={Number(r.overdue) > 0 ? "medium" : "regular"} color={Number(r.overdue) > 0 ? tone.bad.fg : undefined}>{money(r.overdue, c)}</Txt> },
            ]} />
        )}
      </Card>
      {s.by_mode.length > 0 && (
        <Card title="Collected by mode" icon={Coins}>
          <Grid cols={{ base: 2, sm: 4 }} gap={10}>
            {s.by_mode.map((m) => (
              <View key={m.mode} style={{ borderRadius: 12, backgroundColor: col.muted, paddingHorizontal: 12, paddingVertical: 10 }}>
                <Txt size="xs" soft style={{ textTransform: "capitalize" }}>{m.mode.replace("_", " ")}</Txt>
                <Txt size="sm" weight="semibold" tabular>{money(m.amount, c)}</Txt>
              </View>
            ))}
          </Grid>
        </Card>
      )}
    </Stack>
  );
}

function Balances({ currency }: { currency: string }) {
  const { tone } = useTheme();
  const classes = useApi<Page<SchoolClass>>("classes/");
  const [klass, setKlass] = useState("");
  const [search, setSearch] = useState("");
  const [owing, setOwing] = useState(false);
  const term = useDebounced(search);
  const data = useApi<{ students: BalanceRow[] }>(`fees/balances?school_class=${klass}&search=${encodeURIComponent(term)}${owing ? "&status=owing" : ""}`);
  return (
    <Card title="Student balances" icon={Wallet} description="Tap a student to record a payment or see receipts.">
      <Grid cols={{ base: 1, md: 3 }} gap={12} style={{ marginBottom: 14 }}>
        <Field label="Search" icon={Search} placeholder="Name or admission no." value={search} onChangeText={setSearch} autoCorrect={false} returnKeyType="search" />
        <Select label="Class" value={klass} onChange={setKlass} options={[{ value: "", label: "All classes" }, ...rows(classes.data).map((c) => ({ value: c.id, label: c.name }))]} />
        <Checkbox label="Only students who still owe" checked={owing} onChange={setOwing} style={{ alignSelf: "flex-end" }} />
      </Grid>
      {data.error && !data.data ? <ErrorState message={data.error} onRetry={data.reload} /> : !data.data ? <Loading variant="table" /> : data.data.students.length === 0 ? <Empty>No students match.</Empty> : (
        <DataTable rows={data.data.students} rowKey={(r) => r.student} onRowPress={(r) => go(`/app/fees/students/${r.student}`)}
          columns={[
            { header: "Student", flex: 2, cell: (r) => (
              <Row gap={10}>
                <Avatar name={r.name} size="sm" />
                <View style={{ flex: 1 }}><Txt size="sm" weight="medium">{r.name}</Txt><Txt size="xs" soft>{r.section_name} · Adm. {r.admission_no}</Txt></View>
              </Row>
            ) },
            { header: "Billed", align: "right", cell: (r) => money(Number(r.due) - Number(r.discount), currency) },
            { header: "Paid", align: "right", cell: (r) => money(r.paid, currency) },
            { header: "Remaining", align: "right", cell: (r) => <Txt size="sm" weight="semibold" tabular>{money(r.remaining, currency)}</Txt> },
            { header: "Overdue", align: "right", cell: (r) => <Txt size="sm" tabular soft={!(Number(r.overdue) > 0)} color={Number(r.overdue) > 0 ? tone.bad.fg : undefined}>{money(r.overdue, currency)}</Txt> },
          ]} />
      )}
    </Card>
  );
}

type Defaulter = BalanceRow & { parents: { name: string; email: string | null; phone: string | null }[] };

function Defaulters({ currency }: { currency: string }) {
  const { c, tone } = useTheme();
  const data = useApi<{ as_of: string; students: Defaulter[] }>("fees/defaulters");
  if (data.error && !data.data) return <ErrorState message={data.error} onRetry={data.reload} />;
  if (!data.data) return <Loading variant="table" />;
  const list = data.data.students;
  return (
    <Card title={`${list.length} student${list.length === 1 ? "" : "s"} with overdue fees`} icon={TriangleAlert} description="Largest first. Tap a phone number to call the parent.">
      {list.length === 0 ? <Empty icon={CircleCheck} title="Nobody is overdue">Every due date so far has been paid.</Empty> : (
        <DataTable rows={list} rowKey={(r) => r.student}
          columns={[
            { header: "Student", flex: 1.6, cell: (r) => <LinkText href={`/app/fees/students/${r.student}`}>{r.name}</LinkText> },
            { header: "Section", cell: (r) => r.section_name },
            { header: "Overdue", align: "right", cell: (r) => <Txt size="sm" weight="semibold" tabular color={tone.bad.fg}>{money(r.overdue, currency)}</Txt> },
            { header: "Remaining", align: "right", cell: (r) => money(r.remaining, currency) },
            { header: "Parent", flex: 2, cell: (r) => r.parents.length === 0 ? "-" : (
              <Stack gap={4}>
                {r.parents.map((p) => (
                  <Row key={p.name + (p.phone ?? p.email ?? "")} wrap gap={8}>
                    <Txt size="sm">{p.name}</Txt>
                    {p.phone ? (
                      <Row gap={4}><Phone size={13} color={c.brand} /><LinkText onPress={() => Linking.openURL(`tel:${p.phone}`)}>{p.phone}</LinkText></Row>
                    ) : p.email ? <LinkText onPress={() => Linking.openURL(`mailto:${p.email}`)}>{p.email}</LinkText> : null}
                  </Row>
                ))}
              </Stack>
            ) },
          ]} />
      )}
    </Card>
  );
}

function Setup({ currency, onChange }: { currency: string; onChange: () => void }) {
  const { tone } = useTheme();
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
    <Stack gap={18}>
      <Grid cols={{ base: 1, lg: 3 }} gap={18}>
        <Card title="Fee heads" icon={Coins}>
          <Row wrap gap={6} style={{ marginBottom: 12 }}>
            {(heads.data ?? []).map((h) => <Badge key={h.id} tone="info">{h.name}</Badge>)}
          </Row>
          <Row gap={8} align="flex-end">
            <View style={{ flex: 1 }}><Field label="New fee head" placeholder="Transport" {...headForm.bind("name")} /></View>
            <Button variant="secondary" busy={headForm.busy} onPress={headForm.submit((v) => api("fee-heads/", { method: "POST", body: v }), heads.reload)}>Add</Button>
          </Row>
          {headForm.error && <Alert style={{ marginTop: 10 }}>{headForm.error}</Alert>}
        </Card>
        <Span span={2}>
          <NewStructure heads={heads.data ?? []} classes={rows(classes.data)} year={year} loaded={Boolean(years.data)} currency={currency} onSaved={structures.reload} />
        </Span>
      </Grid>
      <Card title="Fee structure" icon={Layers} actions={<Button size="sm" onPress={bill} busy={billing}>Bill students</Button>}>
        <Txt size="sm" soft style={{ marginBottom: 12 }}>After adding or changing fees, press Bill students. New students get their fees, and fees nobody has paid yet follow the changes.</Txt>
        {structures.error && !structures.data ? <ErrorState message={structures.error} onRetry={structures.reload} /> : !structures.data ? <Loading variant="table" /> : structures.data.length === 0 ? <Empty>No fees set for this year yet.</Empty> : (
          <DataTable rows={structures.data} rowKey={(s) => s.id}
            columns={[
              { header: "Class", cell: (s) => <Txt size="sm" weight="medium">{s.class_name}</Txt> },
              { header: "Fee", cell: (s) => s.fee_head_name },
              { header: "Amount", align: "right", cell: (s) => money(s.amount, currency) },
              { header: "Installments", flex: 2.4, cell: (s) => s.installments.map((i) => `${i.name}: ${money(i.amount, currency)} by ${i.due_date}`).join("; ") },
              { header: "Billed", align: "right", cell: (s) => String(s.students_billed) },
              { header: "", cell: (s) => <LinkText color={tone.bad.solid} onPress={() => remove(s)}>Remove</LinkText> },
            ]} />
        )}
      </Card>
    </Stack>
  );
}

type Part = { name: string; due_date: string; amount: string };

/** Problems with one installment row, by field. */
function partProblems(p: Part, year: AcademicYear): Partial<Record<keyof Part, string>> {
  const out: Partial<Record<keyof Part, string>> = {};
  if (!p.name.trim()) out.name = "Name it, like Term 1.";
  if (!p.due_date) out.due_date = "Choose a due date.";
  else if (p.due_date < year.start_date || p.due_date > year.end_date) out.due_date = `Pick a date in ${year.name}.`;
  const n = Number(p.amount);
  if (!p.amount || !(n > 0)) out.amount = "Enter an amount more than zero.";
  else if (!/^\d+(\.\d{1,2})?$/.test(p.amount)) out.amount = "Use at most two decimal places.";
  return out;
}

function NewStructure({ heads, classes, year, loaded, currency, onSaved }: { heads: FeeHead[]; classes: SchoolClass[]; year?: AcademicYear; loaded: boolean; currency: string; onSaved: () => void }) {
  const { c, tone } = useTheme();
  const [classIds, setClassIds] = useState<string[]>([]);
  const [head, setHead] = useState("");
  const [parts, setParts] = useState<Part[]>([{ name: "Term 1", due_date: year?.start_date ?? todayIso(), amount: "" }]);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const total = parts.reduce((n, p) => n + Number(p.amount || 0), 0);
  const toast = useToast();

  if (!loaded) return <Card title="Add a fee" icon={Plus}><Loading variant="text" /></Card>;
  if (!year) return <Card title="Add a fee" icon={Plus}><Txt size="sm" soft>Set the current academic year first, under Classes &amp; subjects.</Txt></Card>;

  const problems = parts.map((p) => partProblems(p, year));
  const show = (i: number, k: keyof Part) => (checked ? problems[i][k] : undefined);

  const save = async () => {
    setChecked(true);
    if (!head || classIds.length === 0) {
      setError("Fill in the highlighted details.");
      return;
    }
    if (problems.some((p) => Object.keys(p).length)) {
      setError("Some installments need another look. They are highlighted.");
      return;
    }
    setBusy(true);
    setError(null);
    // Each class is saved on its own; if one fails, say which ones were saved.
    const saved: string[] = [];
    try {
      for (const school_class of classIds) {
        await api("fee-structures/", {
          method: "POST",
          body: { academic_year: year.id, school_class, fee_head: head, amount: total.toFixed(2), installments: parts.map((p) => ({ ...p, name: p.name.trim(), amount: Number(p.amount).toFixed(2) })) },
        });
        saved.push(school_class);
      }
      toast.success(`Fee saved for ${classIds.length} class${classIds.length === 1 ? "" : "es"}. Press Bill students to add it to their accounts.`);
      setClassIds([]);
      setChecked(false);
      onSaved();
    } catch (err) {
      const failed = classes.find((x) => x.id === classIds[saved.length])?.name ?? "a class";
      const message = err instanceof ApiError ? err.message : "Could not reach the server.";
      setError(saved.length ? `Saved for ${saved.length} class${saved.length === 1 ? "" : "es"}, but not for ${failed}: ${message}` : `${failed}: ${message}`);
      setClassIds((ids) => ids.filter((id) => !saved.includes(id)));
      if (saved.length) onSaved();
    } finally {
      setBusy(false);
    }
  };

  const setPart = (i: number, patch: Partial<Part>) => setParts((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const splitEvenly = () => {
    if (!(total > 0)) return;
    const each = Math.floor((total / parts.length) * 100) / 100;
    const last = Math.round((total - each * (parts.length - 1)) * 100) / 100;
    setParts((ps) => ps.map((p, i) => ({ ...p, amount: (i === ps.length - 1 ? last : each).toFixed(2) })));
  };

  return (
    <Card title="Add a fee" icon={Plus} description={`For ${year.name}. Split it into installments with their own due dates.`}>
      <Stack gap={16}>
        {error && <Alert>{error}</Alert>}
        <Select label="Fee head" value={head} onChange={setHead} error={checked && !head ? "Choose a fee head." : undefined} options={heads.map((h) => ({ value: h.id, label: h.name }))} />
        <View>
          <Row justify="space-between" style={{ marginBottom: 8 }}>
            <Txt size="sm" weight="medium">For classes</Txt>
            {classes.length > 1 && <LinkText size="xs" onPress={() => setClassIds(classIds.length === classes.length ? [] : classes.map((x) => x.id))}>{classIds.length === classes.length ? "Clear" : "Select all"}</LinkText>}
          </Row>
          <Row wrap gap={8}>
            {classes.map((x) => {
              const on = classIds.includes(x.id);
              return <Chip key={x.id} label={x.name} on={on} onPress={() => setClassIds((ids) => (on ? ids.filter((id) => id !== x.id) : [...ids, x.id]))} />;
            })}
          </Row>
          {checked && classIds.length === 0 && <Txt size="xs" weight="medium" color={tone.bad.fg} style={{ marginTop: 6 }}>Choose at least one class.</Txt>}
        </View>
        <View>
          <Row justify="space-between" style={{ marginBottom: 8 }}>
            <Txt size="sm" weight="medium">Installments</Txt>
            {parts.length > 1 && total > 0 && <LinkText size="xs" onPress={splitEvenly}>Split total evenly</LinkText>}
          </Row>
          <Stack gap={8}>
            {parts.map((p, i) => (
              <Enter key={i}>
                <View style={{ borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.muted + "4d", padding: 10 }}>
                  <Grid cols={{ base: 2, md: 3 }} gap={8}>
                    <Span span={2}><Field label="Name" maxLength={100} value={p.name} error={show(i, "name")} onChangeText={(t) => setPart(i, { name: t })} /></Span>
                    <DateField label="Due by" min={year.start_date} max={year.end_date} value={p.due_date} error={show(i, "due_date")} onChange={(v) => setPart(i, { due_date: v })} />
                    <Field label={`Amount (${currency})`} keyboardType="decimal-pad" placeholder="0.00" value={p.amount} error={show(i, "amount")} onChangeText={(t) => setPart(i, { amount: t })} />
                  </Grid>
                  {parts.length > 1 && (
                    <IconButton icon={X} label={`Remove ${p.name || "installment"}`} color={tone.bad.solid} size={34} style={{ position: "absolute", top: 4, right: 4 }}
                      onPress={() => setParts((ps) => ps.filter((_, j) => j !== i))} />
                  )}
                </View>
              </Enter>
            ))}
          </Stack>
          <View style={{ marginTop: 10 }}>
            <LinkText onPress={() => setParts((ps) => [...ps, { name: `Term ${ps.length + 1}`, due_date: ps[ps.length - 1].due_date, amount: "" }])}>+ Add installment</LinkText>
          </View>
        </View>
        <Row wrap justify="space-between" gap={12} style={{ borderRadius: 14, backgroundColor: c.brandSoft, paddingHorizontal: 14, paddingVertical: 12 }}>
          <Txt size="sm">Total <Txt size="sm" weight="bold" tabular>{money(total, currency)}</Txt> per student{classIds.length > 0 ? ` · ${classIds.length} class${classIds.length === 1 ? "" : "es"}` : ""}</Txt>
          <Button busy={busy} onPress={save}>Save fee</Button>
        </Row>
      </Stack>
    </Card>
  );
}
