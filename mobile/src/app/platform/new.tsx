import { ArrowLeft, ArrowRight, Building2, CalendarRange, Check, CircleCheckBig, Crown, Globe, Mail, MailCheck, Phone, Rocket, Sparkles, UserCog } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { Aurora } from "@/components/brand";
import { DateField } from "@/components/Calendar";
import { useToast } from "@/components/toast";
import { Alert, Avatar, Button, Card, Chip, Enter, Eyebrow, Field, Grid, LinkText, PageHeader, Press, Row, Screen, Select, Span, Stack, StickyBar, Txt, go, useLayout } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAppConfig } from "@/lib/config";
import { formatDate } from "@/lib/format";
import type { Icon } from "@/lib/nav";
import { useTheme } from "@/lib/theme";
import { compact } from "@/lib/useForm";

const EMPTY = {
  name: "", subdomain: "", board: "", address: "", plan: "trial", timezone: "Asia/Kolkata", currency: "INR",
  admin_name: "", admin_email: "", admin_phone: "",
  academic_year_name: "", academic_year_start: "", academic_year_end: "",
};
type Form = typeof EMPTY;
type Key = keyof Form;

const STEPS: { title: string; hint: string; icon: Icon; fields: Key[] }[] = [
  { title: "School", hint: "Name, address and plan", icon: Building2, fields: ["name", "subdomain", "board", "address", "plan", "timezone", "currency"] },
  { title: "Academic year", hint: "Optional", icon: CalendarRange, fields: ["academic_year_name", "academic_year_start", "academic_year_end"] },
  { title: "First admin", hint: "Who runs the school", icon: UserCog, fields: ["admin_name", "admin_email", "admin_phone"] },
  { title: "Review", hint: "Check and send", icon: Rocket, fields: [] },
];

const SUBDOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "Green Valley Public School" -> "green-valley-public-school". */
function slugify(name: string) {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63).replace(/-+$/, "");
}

/** An academic year from April to March, the most common pattern in India. */
function suggestYear() {
  const now = new Date();
  const start = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return { academic_year_name: `${start}-${String(start + 1).slice(2)}`, academic_year_start: `${start}-04-01`, academic_year_end: `${start + 1}-03-31` };
}

/** The checks for one step, shown under each field (the web relies on the
 * browser for the required ones). */
function stepErrors(f: Form, step: number, reserved: string[]): Partial<Record<Key, string>> {
  const out: Partial<Record<Key, string>> = {};
  if (step === 0) {
    if (!f.name.trim()) out.name = "Enter the school's name.";
    if (!f.subdomain) out.subdomain = "Choose a web address.";
    else if (!SUBDOMAIN.test(f.subdomain)) out.subdomain = "Use lowercase letters, digits and hyphens, starting and ending with a letter or digit.";
    else if (reserved.includes(f.subdomain)) out.subdomain = "This address is reserved. Choose another.";
  }
  if (step === 1) {
    const year = [f.academic_year_name, f.academic_year_start, f.academic_year_end];
    if (year.some(Boolean)) {
      if (!f.academic_year_name) out.academic_year_name = "Name the year, like 2026-27.";
      if (!f.academic_year_start) out.academic_year_start = "Choose the first day.";
      if (!f.academic_year_end) out.academic_year_end = "Choose the last day.";
      if (f.academic_year_start && f.academic_year_end && f.academic_year_end <= f.academic_year_start) out.academic_year_end = "The year must end after it starts.";
    }
  }
  if (step === 2) {
    if (!f.admin_name.trim()) out.admin_name = "Enter the admin's name.";
    if (!f.admin_email.trim()) out.admin_email = "Enter the admin's email.";
    else if (!EMAIL.test(f.admin_email.trim())) out.admin_email = "Enter a valid email address.";
    if (f.admin_phone && f.admin_phone.replace(/[^\d]/g, "").length < 7) out.admin_phone = "Enter a full phone number, or leave it empty.";
  }
  return out;
}

export default function NewSchool() {
  const { c, tone } = useTheme();
  const { lg } = useLayout();
  const [form, setForm] = useState<Form>(EMPTY);
  const [step, setStep] = useState(0);
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ name: string; email: string } | null>(null);
  const toast = useToast();
  // Plans, boards, time zones and currencies come from the API's config.
  const config = useAppConfig();
  const PLANS = config.plans.map((p) => ({ key: p.key, label: p.label, text: p.description }));

  const update = (patch: Partial<Form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(patch) as Key[]) delete next[k];
      return next;
    });
  };
  const bind = (key: Key) => ({ value: form[key], error: errors[key], onChangeText: (t: string) => update({ [key]: t }) });

  const next = () => {
    const found = stepErrors(form, step, config.reserved_subdomains);
    if (Object.keys(found).length) {
      setErrors((e) => ({ ...e, ...found }));
      return;
    }
    setError(null);
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  const submit = async () => {
    if (step < STEPS.length - 1) return next();
    setBusy(true);
    setError(null);
    try {
      await api("platform/schools/", { method: "POST", body: compact({ ...form, admin_email: form.admin_email.trim() }), school: null });
      toast.success(`${form.name} is ready. The admin's invite is on its way.`);
      setDone({ name: form.name, email: form.admin_email.trim() });
    } catch (err) {
      if (err instanceof ApiError && err.status) {
        const fields = err.fields as Partial<Record<Key, string>>;
        setErrors(fields);
        // Take the person to the first step with a problem.
        const first = STEPS.findIndex((s) => s.fields.some((k) => fields[k]));
        if (first >= 0) setStep(first);
        const general = (err.fields as Record<string, string>).non_field_errors;
        setError(general ?? (first >= 0 ? "Some details need another look. They are highlighted." : err.message));
      } else setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (done) return <Success name={done.name} email={done.email} onAnother={() => { setDone(null); setForm(EMPTY); setStep(0); setSlugTouched(false); setErrors({}); }} />;

  const planLabel = PLANS.find((p) => p.key === form.plan)?.label ?? form.plan;

  return (
    <Screen>
      <PageHeader back="Schools" title="Onboard a school" subtitle="The school's admin gets an email invite to set their password and finish setup." />

      <Grid cols={4} gap={8} style={{ marginBottom: 18 }}>
        {STEPS.map((s, i) => {
          const state = i < step ? "done" : i === step ? "now" : "next";
          const IconC = state === "done" ? Check : s.icon;
          return (
            <Press key={s.title} disabled={i > step} onPress={() => setStep(i)} accessibilityLabel={`Step ${i + 1}: ${s.title}`} accessibilityState={{ selected: state === "now" }} style={{ gap: 8 }}>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: c.muted, overflow: "hidden" }}>
                <View style={{ height: 6, width: state === "next" ? "0%" : "100%", backgroundColor: state === "done" ? tone.good.solid : c.brand }} />
              </View>
              <Row gap={8}>
                <View style={{ width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: state === "done" ? tone.good.solid : state === "now" ? c.brand : c.muted, transform: [{ scale: state === "now" ? 1.08 : 1 }] }}>
                  <IconC size={16} color={state === "next" ? c.soft : "#fff"} />
                </View>
                {lg && (
                  <View style={{ flex: 1 }}>
                    <Txt size="sm" weight="semibold" soft={state === "next"} numberOfLines={1}>{s.title}</Txt>
                    <Txt size="xs" soft numberOfLines={1}>{s.hint}</Txt>
                  </View>
                )}
              </Row>
            </Press>
          );
        })}
      </Grid>
      {!lg && <Txt size="sm" weight="semibold" style={{ marginBottom: 12 }}>Step {step + 1} of {STEPS.length}: {STEPS[step].title} <Txt size="sm" soft>· {STEPS[step].hint}</Txt></Txt>}

      <Row align="flex-start" gap={18}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Stack gap={16}>
            {error && <Alert>{error}</Alert>}
            <Enter key={step}>
              <Stack gap={16}>
                {step === 0 && (
                  <>
                    <Card title="About the school" icon={Building2}>
                      <Grid cols={{ base: 1, sm: 2 }} gap={12}>
                        <Field label="School name" maxLength={200} placeholder="Green Valley Public School" autoCapitalize="words" {...bind("name")}
                          onChangeText={(t) => update({ name: t, ...(slugTouched ? {} : { subdomain: slugify(t) }) })} />
                        <Field label="Web address" icon={Globe} maxLength={63} placeholder="greenvalley" autoCapitalize="none" autoCorrect={false} {...bind("subdomain")}
                          onChangeText={(t) => { setSlugTouched(true); update({ subdomain: t.toLowerCase().replace(/\s+/g, "-") }); }}
                          hint="The school's own address. Filled in from the name; you can change it." />
                        <Span span={2}>
                          <Field label="Board" optional placeholder="CBSE, ICSE, State board" maxLength={100} {...bind("board")} />
                          <Row wrap gap={6} style={{ marginTop: 8 }}>
                            {config.boards.map((b) => <Chip key={b} label={b} on={form.board === b} onPress={() => update({ board: b })} />)}
                          </Row>
                        </Span>
                        <Span span={2}><Field label="Address" optional placeholder="Street, city, PIN" {...bind("address")} /></Span>
                      </Grid>
                    </Card>
                    <Card title="Plan" icon={Crown} description="You can change it later.">
                      <Grid cols={{ base: 1, sm: 3 }} gap={10}>
                        {PLANS.map((p) => {
                          const on = form.plan === p.key;
                          return (
                            <Press key={p.key} onPress={() => update({ plan: p.key })} accessibilityRole="radio" accessibilityState={{ checked: on }}
                              style={{ borderRadius: 18, borderWidth: 2, borderColor: on ? c.brand : c.line, backgroundColor: on ? c.brandSoft : "transparent", padding: 14 }}>
                              {on && (
                                <Enter style={{ position: "absolute", top: 10, right: 10 }}>
                                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: c.brand, alignItems: "center", justifyContent: "center" }}><Check size={12} color={c.onBrand} strokeWidth={3} /></View>
                                </Enter>
                              )}
                              <Row gap={6}>{p.key === "premium" && <Crown size={16} color="#f59e0b" />}<Txt weight="semibold">{p.label}</Txt></Row>
                              <Txt size="xs" soft style={{ marginTop: 4, paddingRight: 18 }}>{p.text}</Txt>
                            </Press>
                          );
                        })}
                      </Grid>
                      {errors.plan && <Txt size="xs" weight="medium" color={tone.bad.fg} style={{ marginTop: 8 }}>{errors.plan}</Txt>}
                    </Card>
                    <Card title="Local settings" icon={Globe}>
                      <Grid cols={{ base: 1, sm: 2 }} gap={12}>
                        <Select label="Time zone" value={form.timezone} error={errors.timezone} onChange={(v) => update({ timezone: v })} options={config.timezones.map((t) => ({ value: t, label: t.replace("_", " ") }))} />
                        <Select label="Currency" value={form.currency} error={errors.currency} onChange={(v) => update({ currency: v })} options={config.currencies.map((x) => ({ value: x.code, label: `${x.code} · ${x.name}` }))} />
                      </Grid>
                    </Card>
                  </>
                )}

                {step === 1 && (
                  <Card title="Academic year" icon={CalendarRange} description="Optional. Fill all three, or leave them for the admin to add later."
                    actions={<Button size="sm" variant="soft" icon={Sparkles} onPress={() => update(suggestYear())}>Use April to March</Button>}>
                    <Grid cols={{ base: 1, sm: 3 }} gap={12}>
                      <Field label="Name" placeholder="2026-27" maxLength={20} {...bind("academic_year_name")} />
                      <DateField label="Starts" clearable value={form.academic_year_start} error={errors.academic_year_start} onChange={(v) => update({ academic_year_start: v })} />
                      <DateField label="Ends" clearable min={form.academic_year_start || undefined} value={form.academic_year_end} error={errors.academic_year_end} onChange={(v) => update({ academic_year_end: v })} />
                    </Grid>
                  </Card>
                )}

                {step === 2 && (
                  <Card title="First admin" icon={UserCog} description="This person gets an email with a link to set their password. They can then add teachers, students and parents.">
                    <Grid cols={{ base: 1, sm: 2 }} gap={12}>
                      <Field label="Full name" maxLength={200} autoComplete="off" placeholder="Priya Sharma" autoCapitalize="words" {...bind("admin_name")} />
                      <Field label="Email" icon={Mail} keyboardType="email-address" autoCapitalize="none" autoComplete="off" placeholder="principal@school.com" {...bind("admin_email")} />
                      <Field label="Phone" optional icon={Phone} keyboardType="phone-pad" autoComplete="off" placeholder="+91 98765 43210" {...bind("admin_phone")} />
                    </Grid>
                  </Card>
                )}

                {step === 3 && (
                  <Card title="Check the details" icon={Rocket} description="Nothing is created until you press the button below.">
                    <Grid cols={{ base: 1, sm: 2 }} gap={10}>
                      <ReviewRow label="School" value={form.name} onEdit={() => setStep(0)} />
                      <ReviewRow label="Web address" value={form.subdomain} onEdit={() => setStep(0)} />
                      <ReviewRow label="Board" value={form.board || "-"} onEdit={() => setStep(0)} />
                      <ReviewRow label="Plan" value={planLabel} onEdit={() => setStep(0)} />
                      <ReviewRow label="Time zone and currency" value={`${form.timezone} · ${form.currency}`} onEdit={() => setStep(0)} />
                      <ReviewRow label="Academic year" value={form.academic_year_name ? `${form.academic_year_name} (${formatDate(form.academic_year_start)} to ${formatDate(form.academic_year_end)})` : "Added later by the admin"} onEdit={() => setStep(1)} />
                      <ReviewRow label="Admin" value={form.admin_name} onEdit={() => setStep(2)} />
                      <ReviewRow label="Admin email" value={form.admin_email} onEdit={() => setStep(2)} />
                    </Grid>
                  </Card>
                )}
              </Stack>
            </Enter>
            {!lg && <Txt size="xs" soft>The admin&apos;s invite link stays valid for {config.invite_valid_days} days. If it runs out, use Resend admin invite on the Schools page.</Txt>}
          </Stack>
        </View>
        {lg && (
          <View style={{ width: 300, gap: 10 }}>
            <Eyebrow>Preview</Eyebrow>
            <Preview name={form.name} subdomain={form.subdomain} board={form.board} plan={planLabel} year={form.academic_year_name} admin={form.admin_name} />
            <Txt size="xs" soft>The admin&apos;s invite link stays valid for {config.invite_valid_days} days. If it runs out, use Resend admin invite on the Schools page.</Txt>
          </View>
        )}
      </Row>

      <StickyBar style={{ justifyContent: "space-between" }}>
        <Button variant="secondary" icon={ArrowLeft} disabled={step === 0} onPress={() => setStep((s) => Math.max(0, s - 1))}>Back</Button>
        {step < STEPS.length - 1 ? (
          <Button iconRight={ArrowRight} onPress={submit}>Continue</Button>
        ) : (
          <Button icon={MailCheck} busy={busy} onPress={submit}>Create school and send invite</Button>
        )}
      </StickyBar>
    </Screen>
  );
}

function Preview({ name, subdomain, board, plan, year, admin }: { name: string; subdomain: string; board: string; plan: string; year: string; admin: string }) {
  const { c, lift } = useTheme();
  return (
    <View style={[{ overflow: "hidden", borderRadius: 24, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface }, lift]}>
      <Aurora style={{ height: 90 }} />
      <View style={{ marginTop: -30, paddingHorizontal: 18, paddingBottom: 18 }}>
        <View style={{ alignSelf: "flex-start", borderRadius: 99, borderWidth: 4, borderColor: c.surface }}><Avatar name={name || "New school"} size="lg" /></View>
        <Txt size="lg" weight="bold" style={{ marginTop: 8 }}>{name || "Your new school"}</Txt>
        <Txt size="sm" soft>{subdomain || "web-address"}{board ? ` · ${board}` : ""}</Txt>
        <Stack gap={8} style={{ marginTop: 14 }}>
          <Row gap={8}><Crown size={16} color="#f59e0b" /><Txt size="sm">{plan} plan</Txt></Row>
          <Row gap={8}><CalendarRange size={16} color={c.brand} /><Txt size="sm">{year || "Year added later"}</Txt></Row>
          <Row gap={8}><UserCog size={16} color={c.brand} /><Txt size="sm">{admin || "Admin not chosen yet"}</Txt></Row>
        </Stack>
      </View>
    </View>
  );
}

function ReviewRow({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  const { c } = useTheme();
  return (
    <Row align="flex-start" justify="space-between" gap={10} style={{ borderRadius: 12, backgroundColor: c.muted + "99", paddingHorizontal: 12, paddingVertical: 10 }}>
      <View style={{ flex: 1 }}>
        <Txt size="xs" soft>{label}</Txt>
        <Txt size="sm" weight="medium">{value}</Txt>
      </View>
      <LinkText size="xs" onPress={onEdit}>Edit</LinkText>
    </Row>
  );
}

function Success({ name, email, onAnother }: { name: string; email: string; onAnother: () => void }) {
  const { tone } = useTheme();
  return (
    <Screen>
      <Enter style={{ maxWidth: 520, width: "100%", alignSelf: "center", alignItems: "center", paddingVertical: 40 }}>
        <View style={{ width: 80, height: 80, borderRadius: 24, backgroundColor: tone.good.solid, alignItems: "center", justifyContent: "center" }}>
          <CircleCheckBig size={40} color="#fff" />
        </View>
        <Txt size="3xl" weight="bold" center style={{ marginTop: 22 }}>{name} is ready</Txt>
        <Txt soft center style={{ marginTop: 10 }}>
          We emailed <Txt weight="semibold">{email}</Txt> a link to set their password. Once they sign in, a setup checklist walks them through classes, teachers and students.
        </Txt>
        <Row wrap justify="center" gap={8} style={{ marginTop: 26 }}>
          <Button onPress={() => go("/platform")}>Back to schools</Button>
          <Button variant="secondary" onPress={onAnother}>Onboard another school</Button>
        </Row>
        <Txt size="sm" soft center style={{ marginTop: 20 }}>Running locally? The invite email is printed in the API&apos;s terminal window.</Txt>
      </Enter>
    </Screen>
  );
}
