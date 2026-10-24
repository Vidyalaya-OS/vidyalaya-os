import { Archive, Building2, CircleCheck, CirclePlus, Crown, GraduationCap, Headset, Mail, PauseCircle, Search, Sparkles, Users, Wallet } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { Aurora, FloatingLogo } from "@/components/brand";
import { BarList, Donut } from "@/components/charts";
import { ContactDetails } from "@/components/ContactDetails";
import { useDialog } from "@/components/dialog";
import { useToast } from "@/components/toast";
import {
  Avatar, Badge, Button, Card, CountUp, DataTable, Empty, Enter, ErrorState, Field, Grid, Loading, Ping, Press, Row, Screen, Stack, Stagger, Stat, Txt,
  go, statusTone, useLayout,
} from "@/components/ui";
import { api, Page } from "@/lib/api";
import { CONTACT } from "@/lib/contact";
import { money } from "@/lib/format";
import type { Icon } from "@/lib/nav";
import { useTheme } from "@/lib/theme";
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

const PLAN_LABEL: Record<Plan, string> = { trial: "Trial", standard: "Standard", premium: "Premium" };

const FILTERS: { key: Status | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "suspended", label: "Suspended" },
  { key: "archived", label: "Archived" },
];

export default function PlatformHome() {
  const { c } = useTheme();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Status | "all">("all");
  const [pending, setPending] = useState<string | null>(null);
  const term = useDebounced(search);
  const { data, error, reload } = useApi<Page<School>>(`platform/schools/?search=${encodeURIComponent(term)}`);
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
    <Screen>
      <Hero liveCount={data ? live.length : null} />
      <Stack gap={18}>
        <Grid cols={{ base: 2, lg: 4 }} gap={12}>
          <Stat label="Schools live" value={data ? live.length : "-"} icon={Building2} hint={data ? `${schools.length - live.length} suspended or archived` : undefined} />
          <Stat label="Students" value={data ? totals.students : "-"} icon={GraduationCap} hint="In live schools" />
          <Stat label="Teachers" value={data ? totals.teachers : "-"} icon={Users} hint="In live schools" />
          <Stat label="Fees this year" value={data ? <CountUp value={totals.fees} format={(n) => money(Math.round(n))} /> : "-"} icon={Wallet} tone="good" hint="Collected, current academic year" />
        </Grid>

        <Card title="All schools" icon={Building2} description="Change a school's status or send its admin a new invite."
          actions={<Button size="sm" icon={CirclePlus} onPress={() => go("/platform/new")}>Onboard a school</Button>}>
          <Stack gap={12} style={{ marginBottom: 14 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {FILTERS.map((f) => {
                const on = filter === f.key;
                return (
                  <Press key={f.key} onPress={() => setFilter(f.key)} accessibilityRole="tab" accessibilityState={{ selected: on }} scale={0.95}
                    style={{ minHeight: 36, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 99, borderWidth: 1, paddingHorizontal: 14, borderColor: on ? c.brand : c.line, backgroundColor: on ? c.brand : "transparent" }}>
                    <Txt size="sm" weight="medium" color={on ? c.onBrand : c.soft}>{f.label}</Txt>
                    {data && (
                      <View style={{ borderRadius: 99, paddingHorizontal: 6, backgroundColor: on ? "rgba(255,255,255,0.25)" : c.muted }}>
                        <Txt size="xs" tabular color={on ? c.onBrand : c.soft}>{count(f.key)}</Txt>
                      </View>
                    )}
                  </Press>
                );
              })}
            </ScrollView>
            <View style={{ maxWidth: 380 }}>
              <Field label="Search schools" icon={Search} placeholder="Name or web address" value={search} onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} returnKeyType="search" />
            </View>
          </Stack>
          {error && !data ? <ErrorState message={error} onRetry={reload} /> : !data ? <Loading variant="table" /> : shown.length === 0 ? (
            <Empty icon={Building2} title={term || filter !== "all" ? "No schools match" : "No schools yet"}
              action={!term && filter === "all" ? <Button onPress={() => go("/platform/new")}>Onboard the first school</Button> : undefined}>
              {term || filter !== "all" ? "Try another name or filter." : "Each school gets its own private portal and admin."}
            </Empty>
          ) : (
            <DataTable rows={shown} rowKey={(s) => s.id}
              columns={[
                { header: "School", flex: 2, cell: (s) => (
                  <Row gap={10}>
                    <Avatar name={s.name} size="sm" />
                    <View style={{ flex: 1 }}><Txt size="sm" weight="semibold">{s.name}</Txt><Txt size="xs" soft>{s.subdomain}{s.board ? ` · ${s.board}` : ""}</Txt></View>
                  </Row>
                ) },
                { header: "Plan", cell: (s) => <PlanBadge plan={s.plan} /> },
                { header: "Students", align: "right", cell: (s) => <Txt size="sm" weight="medium" tabular>{s.usage.students}</Txt> },
                { header: "Teachers", align: "right", cell: (s) => <Txt size="sm" weight="medium" tabular>{s.usage.teachers}</Txt> },
                { header: "Fees this year", flex: 1.6, align: "right", cell: (s) => <Txt size="sm" weight="medium" tabular>{money(s.usage.fees_collected, s.currency)}</Txt> },
                { header: "Status", flex: 1.3, cell: (s) => <StatusBadge status={s.status} /> },
                { header: "", flex: 3.4, cell: (s) => (
                  <Row wrap gap={8}>
                    <StatusSwitch school={s} pending={pending} onChange={(a) => act(s, a)} />
                    <Button size="sm" variant="secondary" icon={Mail} busy={pending === `${s.id}:resend-admin-invite`} disabled={pending !== null || s.status === "archived"}
                      onPress={() => act(s, "resend-admin-invite")} accessibilityLabel="Email the school's first admin a new link to set their password">Resend admin invite</Button>
                  </Row>
                ) },
              ]} />
          )}
        </Card>

        <Grid cols={{ base: 1, md: 2, lg: 3 }} gap={18}>
          <Card title="Students per school" icon={GraduationCap} description="Live schools">
            {!data ? <Loading variant="text" /> : live.length === 0 ? <Empty>No live schools yet.</Empty> : (
              <BarList valueLabel="Students" format={() => ""} items={live.map((s) => ({ label: s.name, value: (s.usage.students / maxStudents) * 100, note: String(s.usage.students) }))} />
            )}
          </Card>
          <Card title="Plans" icon={Crown} description="Schools that are not archived">
            {!data ? <Loading variant="text" /> : (
              <Donut size={128}
                centre={<View style={{ alignItems: "center" }}><Txt size="xl" weight="bold" tabular>{plans.reduce((n, p) => n + p.n, 0)}</Txt><Txt size="xxs" soft>schools</Txt></View>}
                segments={plans.map((p) => ({ label: PLAN_LABEL[p.plan], value: p.n, tone: p.plan === "premium" ? "warn" : p.plan === "standard" ? "brand" : "neutral" }))} />
            )}
          </Card>
          <Card title="Needs a look" icon={Sparkles} description="Suspended, or missing an admin or teachers">
            {!data ? <Loading variant="text" /> : attention.length === 0 ? (
              <Empty icon={CircleCheck}>Every live school has an admin and teachers.</Empty>
            ) : (
              <Stagger gap={8}>
                {attention.map((s) => (
                  <Row key={s.id} justify="space-between" gap={10} style={{ borderRadius: 12, borderWidth: 1, borderColor: c.line, paddingHorizontal: 12, paddingVertical: 10 }}>
                    <Txt size="sm" weight="medium" numberOfLines={1} style={{ flex: 1 }}>{s.name}</Txt>
                    <Badge tone="warn">{s.status === "suspended" ? "Suspended" : s.usage.admins === 0 ? "No admin" : "No teachers"}</Badge>
                  </Row>
                ))}
              </Stagger>
            )}
          </Card>
        </Grid>
        <Card title="Support and contact" icon={Headset} description={`Questions about Vidyalaya OS, your plan or a school? Reach ${CONTACT.productOwner}, the product owner.`}>
          <ContactDetails />
        </Card>
        <Txt size="sm" soft>You see head counts and fee totals only. Student records stay private to each school.</Txt>
      </Stack>
    </Screen>
  );
}

function Hero({ liveCount }: { liveCount: number | null }) {
  const { c } = useTheme();
  const { md } = useLayout();
  return (
    <Enter style={{ marginBottom: 18 }}>
      <Aurora radius={26} style={{ padding: md ? 28 : 20 }}>
        <Row gap={20} justify="space-between">
          <View style={{ flex: 1, maxWidth: 560 }}>
            <Row gap={6} style={{ alignSelf: "flex-start", borderRadius: 99, backgroundColor: "rgba(255,255,255,0.16)", paddingHorizontal: 12, paddingVertical: 4 }}>
              <Crown size={13} color="#fff" />
              <Txt size="xs" weight="semibold" upper color="#fff">Platform owner</Txt>
            </Row>
            <Txt size={md ? "3xl" : "2xl"} weight="bold" color="#fff" style={{ marginTop: 12 }}>Your schools at a glance</Txt>
            <Txt color="rgba(255,255,255,0.85)" style={{ marginTop: 6 }}>
              {liveCount == null ? "Loading your schools…" : liveCount === 1 ? "1 school is live." : `${liveCount} schools are live.`} Onboard a new school, see how each one is growing, and pause or archive one with a tap.
            </Txt>
            <Press onPress={() => go("/platform/new")} style={{ marginTop: 18, alignSelf: "flex-start", minHeight: 46, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 14, backgroundColor: "#fff", paddingHorizontal: 16 }}>
              <CirclePlus size={17} color={c.brand} />
              <Txt size="sm" weight="semibold" color="#2f5bea">Onboard a school</Txt>
            </Press>
          </View>
          {md && <FloatingLogo size={170} />}
        </Row>
      </Aurora>
    </Enter>
  );
}

function PlanBadge({ plan }: { plan: Plan }) {
  const { dark } = useTheme();
  const look = {
    trial: dark ? { bg: "#082f49", fg: "#7dd3fc" } : { bg: "#e0f2fe", fg: "#075985" },
    standard: dark ? { bg: "#1e1b4b", fg: "#a5b4fc" } : { bg: "#e0e7ff", fg: "#3730a3" },
    premium: dark ? { bg: "#78350f", fg: "#fde68a" } : { bg: "#fde68a", fg: "#78350f" },
  }[plan] ?? { bg: "#e0f2fe", fg: "#075985" };
  return (
    <Row gap={4} style={{ alignSelf: "flex-start", borderRadius: 99, backgroundColor: look.bg, paddingHorizontal: 10, paddingVertical: 3 }}>
      {plan === "premium" && <Crown size={12} color={look.fg} />}
      <Txt size="xs" weight="semibold" color={look.fg}>{PLAN_LABEL[plan] ?? plan}</Txt>
    </Row>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const dot = status === "active" ? "#22c55e" : status === "suspended" ? "#f59e0b" : "#ef4444";
  return (
    <Row gap={8}>
      {status === "active" ? <Ping color={dot} /> : <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dot }} />}
      <Badge tone={statusTone(status)}>{status === "suspended" ? "Suspended" : status === "archived" ? "Archived" : "Active"}</Badge>
    </Row>
  );
}

const SWITCH: { status: Status; action: Action; label: string; icon: Icon; on: string }[] = [
  { status: "active", action: "activate", label: "Active", icon: CircleCheck, on: "#16a34a" },
  { status: "suspended", action: "suspend", label: "Suspend", icon: PauseCircle, on: "#f59e0b" },
  { status: "archived", action: "archive", label: "Archive", icon: Archive, on: "#dc2626" },
];

/** Three buttons for a school's status; the current one is lit. */
function StatusSwitch({ school, pending, onChange }: { school: School; pending: string | null; onChange: (a: Action) => void }) {
  const { c } = useTheme();
  return (
    <View accessibilityLabel={`Status of ${school.name}`} style={{ flexDirection: "row", borderRadius: 12, borderWidth: 1, borderColor: c.line, backgroundColor: c.muted + "99", padding: 2 }}>
      {SWITCH.map(({ status, action, label, icon: IconC, on }) => {
        const current = school.status === status;
        const busy = pending === `${school.id}:${action}`;
        const disabled = current || pending !== null;
        return (
          <Press key={status} onPress={() => onChange(action)} disabled={disabled} scale={0.94} accessibilityRole="button" accessibilityState={{ selected: current, disabled }}
            style={{ minHeight: 34, flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 10, paddingHorizontal: 10, backgroundColor: current ? on : "transparent", opacity: !current && pending !== null ? 0.5 : 1 }}>
            {busy ? <ActivityIndicator size="small" color={c.soft} /> : <IconC size={14} color={current ? "#fff" : c.soft} />}
            <Txt size="xs" weight="semibold" color={current ? "#fff" : c.soft}>{label}</Txt>
          </Press>
        );
      })}
    </View>
  );
}
