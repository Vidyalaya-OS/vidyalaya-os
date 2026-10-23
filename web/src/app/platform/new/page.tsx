"use client";

import {
  ArrowLeft, ArrowRight, Building2, CalendarRange, Check, CircleCheckBig, Crown, Globe, Mail, MailCheck, Phone, Rocket, Sparkles, UserCog,
} from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { Tilt } from "@/components/motion";
import { useToast } from "@/components/toast";
import { Alert, Avatar, Button, ButtonLink, Card, Field, PageHeader, Select, StickyBar, cx } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { compact } from "@/lib/useForm";

const EMPTY = {
  name: "", subdomain: "", board: "", address: "", plan: "trial", timezone: "Asia/Kolkata", currency: "INR",
  admin_name: "", admin_email: "", admin_phone: "",
  academic_year_name: "", academic_year_start: "", academic_year_end: "",
};
type Form = typeof EMPTY;
type Key = keyof Form;

const STEPS: { title: string; hint: string; icon: React.ComponentType<{ className?: string }>; fields: Key[] }[] = [
  { title: "School", hint: "Name, address and plan", icon: Building2, fields: ["name", "subdomain", "board", "address", "plan", "timezone", "currency"] },
  { title: "Academic year", hint: "Optional", icon: CalendarRange, fields: ["academic_year_name", "academic_year_start", "academic_year_end"] },
  { title: "First admin", hint: "Who runs the school", icon: UserCog, fields: ["admin_name", "admin_email", "admin_phone"] },
  { title: "Review", hint: "Check and send", icon: Rocket, fields: [] },
];

const PLANS = [
  { key: "trial", label: "Trial", text: "Try every feature free while the school sets up." },
  { key: "standard", label: "Standard", text: "Attendance, homework, tests, report cards and fees." },
  { key: "premium", label: "Premium", text: "Everything in Standard, plus priority support." },
];

const BOARDS = ["CBSE", "ICSE", "State board", "IB", "Cambridge"];
const TIMEZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York", "UTC"];
const CURRENCIES = [["INR", "Indian rupee"], ["AED", "UAE dirham"], ["SGD", "Singapore dollar"], ["GBP", "Pound sterling"], ["USD", "US dollar"], ["EUR", "Euro"]];
// Addresses the platform keeps for itself (mirrors RESERVED_SUBDOMAINS in the API).
const RESERVED = ["www", "api", "admin", "app", "platform", "static", "media", "mail"];
const SUBDOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

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

/** Checks that need more than one field, or know about the platform's rules. */
function extraErrors(f: Form, step: number): Partial<Record<Key, string>> {
  const out: Partial<Record<Key, string>> = {};
  if (step === 0 && f.subdomain) {
    if (!SUBDOMAIN.test(f.subdomain)) out.subdomain = "Use lowercase letters, digits and hyphens, starting and ending with a letter or digit.";
    else if (RESERVED.includes(f.subdomain)) out.subdomain = "This address is reserved. Choose another.";
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
  if (step === 2 && f.admin_phone && f.admin_phone.replace(/[^\d]/g, "").length < 7) out.admin_phone = "Enter a full phone number, or leave it empty.";
  return out;
}

export default function NewSchool() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [step, setStep] = useState(0);
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ name: string; email: string } | null>(null);
  const stepRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  const update = (patch: Partial<Form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(patch) as Key[]) delete next[k];
      return next;
    });
  };
  const bind = (key: Key) => ({
    value: form[key],
    error: errors[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => update({ [key]: e.target.value }),
  });

  /** Runs the browser's checks (shown under each field) and ours for one step. */
  const validStep = (i: number) => {
    const controls = stepRef.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select") ?? [];
    let ok = true;
    for (const el of controls) if (!el.checkValidity()) ok = false;
    const extra = extraErrors(form, i);
    if (Object.keys(extra).length) {
      setErrors((e) => ({ ...e, ...extra }));
      ok = false;
    }
    return ok;
  };

  const next = () => {
    if (!validStep(step)) return;
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step < STEPS.length - 1) return next();
    setBusy(true);
    setError(null);
    try {
      await api("platform/schools/", { method: "POST", body: compact(form), school: null });
      toast.success(`${form.name} is ready. The admin's invite is on its way.`);
      setDone({ name: form.name, email: form.admin_email });
    } catch (err) {
      if (err instanceof ApiError) {
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

  if (done) return <Success name={done.name} email={done.email} onAnother={() => { setDone(null); setForm(EMPTY); setStep(0); setSlugTouched(false); }} />;

  return (
    <>
      <PageHeader back={{ href: "/platform", label: "Schools" }} title="Onboard a school" subtitle="The school's admin gets an email invite to set their password and finish setup." />

      <ol className="mb-6 grid grid-cols-4 gap-2" aria-label="Steps">
        {STEPS.map((s, i) => {
          const state = i < step ? "done" : i === step ? "now" : "next";
          const Icon = state === "done" ? Check : s.icon;
          return (
            <li key={s.title}>
              <button
                type="button"
                disabled={i > step}
                onClick={() => setStep(i)}
                aria-current={state === "now" ? "step" : undefined}
                className="group flex w-full flex-col gap-2 text-left disabled:cursor-default"
              >
                <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <span className={cx("block h-full rounded-full bg-gradient-to-r from-brand to-violet-500 transition-all duration-500", state === "next" ? "w-0" : "w-full")} />
                </span>
                <span className="flex items-center gap-2">
                  <span className={cx("flex size-8 shrink-0 items-center justify-center rounded-xl transition duration-300 [&_svg]:size-4",
                    state === "done" ? "bg-green-600 text-white" : state === "now" ? "scale-110 bg-brand text-white shadow-lg shadow-brand/30 dark:text-slate-950" : "bg-muted text-soft")}>
                    <Icon aria-hidden />
                  </span>
                  <span className="hidden min-w-0 sm:block">
                    <span className={cx("block truncate text-sm font-semibold", state === "next" ? "text-soft" : "text-ink")}>{s.title}</span>
                    <span className="block truncate text-xs text-soft">{s.hint}</span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <form onSubmit={submit} noValidate={false} className="min-w-0 space-y-4">
          {error && <Alert>{error}</Alert>}
          <div ref={stepRef} key={step} className="animate-enter space-y-4">
            {step === 0 && (
              <>
                <Card title="About the school" icon={<Building2 aria-hidden />}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="School name" required autoFocus maxLength={200} placeholder="Green Valley Public School"
                      {...bind("name")}
                      onChange={(e) => update({ name: e.target.value, ...(slugTouched ? {} : { subdomain: slugify(e.target.value) }) })}
                    />
                    <Field
                      label="Web address" required icon={<Globe aria-hidden />} maxLength={63} placeholder="greenvalley"
                      pattern="[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?" title="Use lowercase letters, digits and hyphens, starting and ending with a letter or digit."
                      {...bind("subdomain")}
                      onChange={(e) => { setSlugTouched(true); update({ subdomain: e.target.value.toLowerCase().replace(/\s+/g, "-") }); }}
                      hint="The school's own address. Filled in from the name; you can change it."
                    />
                    <div className="sm:col-span-2">
                      <Field label="Board" placeholder="CBSE, ICSE, State board" maxLength={100} {...bind("board")} />
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {BOARDS.map((b) => (
                          <button key={b} type="button" onClick={() => update({ board: b })}
                            className={cx("rounded-full border px-3 py-1 text-xs font-medium transition", form.board === b ? "border-brand bg-brand-soft text-brand" : "border-line text-soft hover:text-ink")}>
                            {b}
                          </button>
                        ))}
                      </div>
                    </div>
                    <Field label="Address" className="sm:col-span-2" placeholder="Street, city, PIN" {...bind("address")} />
                  </div>
                </Card>
                <Card title="Plan" icon={<Crown aria-hidden />} description="You can change it later.">
                  <div role="radiogroup" aria-label="Plan" className="grid gap-3 sm:grid-cols-3">
                    {PLANS.map((p) => {
                      const on = form.plan === p.key;
                      return (
                        <button key={p.key} type="button" role="radio" aria-checked={on} onClick={() => update({ plan: p.key })}
                          className={cx("relative rounded-2xl border-2 p-4 text-left transition duration-200 hover:-translate-y-0.5",
                            on ? "border-brand bg-brand-soft shadow-[var(--shadow-lift)]" : "border-line hover:border-soft/40")}>
                          {on && <span className="absolute right-3 top-3 flex size-5 animate-pop items-center justify-center rounded-full bg-brand text-white dark:text-slate-950"><Check className="size-3" aria-hidden /></span>}
                          <span className="flex items-center gap-1.5 font-semibold">{p.key === "premium" && <Crown className="size-4 text-amber-500" aria-hidden />}{p.label}</span>
                          <span className="mt-1 block text-xs text-soft">{p.text}</span>
                        </button>
                      );
                    })}
                  </div>
                  {errors.plan && <p className="mt-2 text-xs font-medium text-red-600">{errors.plan}</p>}
                </Card>
                <Card title="Local settings" icon={<Globe aria-hidden />}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Select label="Time zone" {...bind("timezone")}>
                      {TIMEZONES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
                    </Select>
                    <Select label="Currency" {...bind("currency")}>
                      {CURRENCIES.map(([code, label]) => <option key={code} value={code}>{code} · {label}</option>)}
                    </Select>
                  </div>
                </Card>
              </>
            )}

            {step === 1 && (
              <Card
                title="Academic year"
                icon={<CalendarRange aria-hidden />}
                description="Optional. Fill all three, or leave them for the admin to add later."
                actions={<Button size="sm" variant="soft" onClick={() => update(suggestYear())}><Sparkles aria-hidden /> Use April to March</Button>}
              >
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Name" placeholder="2026-27" maxLength={20} {...bind("academic_year_name")} />
                  <Field label="Starts" type="date" {...bind("academic_year_start")} />
                  <Field label="Ends" type="date" min={form.academic_year_start || undefined} {...bind("academic_year_end")} />
                </div>
              </Card>
            )}

            {step === 2 && (
              <Card title="First admin" icon={<UserCog aria-hidden />} description="This person gets an email with a link to set their password. They can then add teachers, students and parents.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Full name" required autoFocus maxLength={200} autoComplete="off" placeholder="Priya Sharma" {...bind("admin_name")} />
                  <Field label="Email" type="email" required icon={<Mail aria-hidden />} autoComplete="off" placeholder="principal@school.com" {...bind("admin_email")} />
                  <Field label="Phone (optional)" type="tel" icon={<Phone aria-hidden />} autoComplete="off" placeholder="+91 98765 43210" {...bind("admin_phone")} />
                </div>
              </Card>
            )}

            {step === 3 && (
              <Card title="Check the details" icon={<Rocket aria-hidden />} description="Nothing is created until you press the button below.">
                <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                  <Row label="School" value={form.name} onEdit={() => setStep(0)} />
                  <Row label="Web address" value={form.subdomain} onEdit={() => setStep(0)} />
                  <Row label="Board" value={form.board || "-"} onEdit={() => setStep(0)} />
                  <Row label="Plan" value={PLANS.find((p) => p.key === form.plan)?.label ?? form.plan} onEdit={() => setStep(0)} />
                  <Row label="Time zone and currency" value={`${form.timezone} · ${form.currency}`} onEdit={() => setStep(0)} />
                  <Row label="Academic year" value={form.academic_year_name ? `${form.academic_year_name} (${formatDate(form.academic_year_start)} to ${formatDate(form.academic_year_end)})` : "Added later by the admin"} onEdit={() => setStep(1)} />
                  <Row label="Admin" value={form.admin_name} onEdit={() => setStep(2)} />
                  <Row label="Admin email" value={form.admin_email} onEdit={() => setStep(2)} />
                </dl>
              </Card>
            )}
          </div>

          <StickyBar className="justify-between">
            <Button type="button" variant="secondary" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              <ArrowLeft aria-hidden /> Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button type="submit">Continue <ArrowRight aria-hidden /></Button>
            ) : (
              <Button type="submit" busy={busy}><MailCheck aria-hidden /> Create school and send invite</Button>
            )}
          </StickyBar>
        </form>

        <aside className="hidden lg:block">
          <div className="sticky top-6 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-soft">Preview</p>
            <Tilt className="rounded-3xl">
              <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-[var(--shadow-lift)]">
                <div className="bg-aurora relative h-24">
                  <div className="bg-grid absolute inset-0" />
                </div>
                <div className="relative -mt-8 px-5 pb-5">
                  <Avatar name={form.name || "New school"} size="lg" className="ring-4 ring-surface" />
                  <p className="mt-2 text-lg font-bold leading-tight">{form.name || "Your new school"}</p>
                  <p className="text-sm text-soft">{form.subdomain || "web-address"} {form.board && `· ${form.board}`}</p>
                  <div className="mt-4 space-y-2 text-sm">
                    <p className="flex items-center gap-2"><Crown className="size-4 text-amber-500" aria-hidden /> {PLANS.find((p) => p.key === form.plan)?.label} plan</p>
                    <p className="flex items-center gap-2"><CalendarRange className="size-4 text-brand" aria-hidden /> {form.academic_year_name || "Year added later"}</p>
                    <p className="flex items-center gap-2"><UserCog className="size-4 text-brand" aria-hidden /> {form.admin_name || "Admin not chosen yet"}</p>
                  </div>
                </div>
              </div>
            </Tilt>
            <p className="text-xs text-soft">The admin&apos;s invite link stays valid for 7 days. If it runs out, use Resend admin invite on the Schools page.</p>
          </div>
        </aside>
      </div>
    </>
  );
}

function Row({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl bg-muted/60 px-3 py-2.5">
      <div className="min-w-0">
        <dt className="text-xs text-soft">{label}</dt>
        <dd className="break-words font-medium">{value}</dd>
      </div>
      <button type="button" onClick={onEdit} className="shrink-0 text-xs font-semibold text-brand hover:underline">Edit</button>
    </div>
  );
}

function Success({ name, email, onAnother }: { name: string; email: string; onAnother: () => void }) {
  return (
    <div className="mx-auto max-w-lg animate-rise py-10 text-center">
      <span className="mx-auto flex size-20 animate-pop items-center justify-center rounded-3xl bg-gradient-to-br from-green-500 to-emerald-600 text-white shadow-xl shadow-green-600/30">
        <CircleCheckBig className="size-10" aria-hidden />
      </span>
      <h1 className="mt-6 text-3xl font-bold tracking-tight">{name} is ready</h1>
      <p className="mt-3 text-soft">
        We emailed <strong className="text-ink">{email}</strong> a link to set their password. Once they sign in, a setup checklist walks them through classes, teachers and students.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        <ButtonLink href="/platform">Back to schools</ButtonLink>
        <Button variant="secondary" onClick={onAnother}>Onboard another school</Button>
      </div>
      <p className="mt-6 text-sm text-soft">Running locally? The invite email is printed in the API&apos;s terminal window. <Link href="/platform" className="font-medium text-brand hover:underline">See all schools</Link></p>
    </div>
  );
}
