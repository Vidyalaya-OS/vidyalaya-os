"use client";

import { ArrowRight, Check, ChevronDown, LogIn, Mail, Play, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ThemeButton } from "@/components/AppShell";
import { Logo, Logo3D } from "@/components/brand";
import { ContactDetails } from "@/components/ContactDetails";
import { Reveal, Tilt } from "@/components/motion";
import { ButtonLink, buttonClass, cx } from "@/components/ui";
import { CONTACT, contactLinks } from "@/lib/contact";
import { PromoVideo } from "./PromoVideo";
import { FAQ, FEATURES, ROLES, RoleKey, STEPS, TRUST } from "./content";

/** The public front page: what the system is, and what it means for each
 * kind of person who uses it. */
export function Landing() {
  return (
    <div className="min-h-dvh overflow-x-clip">
      <TopBar />
      <Hero />
      <PromoVideo />
      <RoleExplorer />
      <HowItWorks />
      <Features />
      <Trust />
      <Faq />
      <Contact />
      <Footer />
    </div>
  );
}

function TopBar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={cx("sticky top-0 z-40 transition duration-300", scrolled ? "border-b border-line bg-surface/80 backdrop-blur-md" : "bg-transparent")}>
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="Vidyalaya OS home"><Logo subtitle={false} /></Link>
        <nav aria-label="Page" className="ml-4 hidden items-center gap-1 text-sm font-medium text-soft md:flex">
          {[["#video", "Video"], ["#roles", "Who it's for"], ["#how", "How it works"], ["#features", "Features"], ["#faq", "Questions"], ["#contact", "Contact"]].map(([href, label]) => (
            <a key={href} href={href} className="rounded-lg px-3 py-2 transition hover:bg-muted hover:text-ink">{label}</a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <ThemeButton />
          <ButtonLink href="/login" size="sm"><LogIn aria-hidden /> Sign in</ButtonLink>
        </div>
      </div>
    </header>
  );
}

const FLOATERS = [
  { text: "Attendance marked · 32 of 34 present", dot: "bg-green-500", className: "left-0 top-6", delay: "0s" },
  { text: "Fee received · ₹12,000", dot: "bg-brand", className: "-right-2 top-1/3", delay: "-2s" },
  { text: "Maths quiz · 9 / 10", dot: "bg-amber-500", className: "bottom-8 left-4", delay: "-4s" },
];

function Hero() {
  return (
    <section className="relative">
      <div className="pointer-events-none absolute inset-x-0 -top-16 h-[36rem] bg-[radial-gradient(60%_60%_at_70%_30%,var(--brand-soft),transparent)]" aria-hidden />
      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pb-24 lg:pt-16">
        <div className="animate-rise">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-soft shadow-xs">
            <Sparkles className="size-3.5 text-brand" aria-hidden /> Vidyalaya OS · the school operating system
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
            One calm place for your{" "}
            <span className="bg-gradient-to-r from-brand via-indigo-500 to-violet-500 bg-clip-text text-transparent">whole school</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-soft">
            Timetables, attendance, homework, quizzes, report cards and fees, shared between the school office, teachers, students and parents.
            Everyone signs in to the same app and sees the part that is meant for them.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/login" size="lg">Sign in <ArrowRight aria-hidden /></ButtonLink>
            <a href="#roles" className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-5 font-medium shadow-xs transition hover:bg-muted">
              What it does for me <ChevronDown className="size-4" aria-hidden />
            </a>
            <a href="#video" className="inline-flex min-h-12 items-center gap-2 rounded-xl px-4 font-medium text-brand transition hover:bg-brand-soft">
              <Play className="size-4 fill-current" aria-hidden /> Watch the video
            </a>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-soft">
            {["Works on phones and computers", "Light and dark mode", "Each school's data kept private"].map((t) => (
              <li key={t} className="flex items-center gap-1.5"><Check className="size-4 text-green-600" aria-hidden />{t}</li>
            ))}
          </ul>
        </div>
        <div className="relative mx-auto -my-6 aspect-square w-full max-w-[17rem] sm:my-0 sm:max-w-md">
          <div className="absolute inset-8 rounded-full bg-gradient-to-br from-brand/25 via-violet-400/20 to-sky-300/25 blur-3xl" aria-hidden />
          <Logo3D size={360} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 scale-[0.7] sm:scale-100" />
          {FLOATERS.map((f) => (
            <div key={f.text} className={cx("absolute hidden animate-float items-center gap-2 rounded-2xl border border-line bg-surface/90 px-3.5 py-2.5 text-sm font-medium shadow-[var(--shadow-lift)] backdrop-blur sm:flex", f.className)} style={{ animationDelay: f.delay }}>
              <span className={cx("size-2.5 rounded-full", f.dot)} aria-hidden />
              {f.text}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function RoleExplorer() {
  const [role, setRole] = useState<RoleKey>("parent");
  useEffect(() => {
    // Links like /#role-teacher open on that role.
    const fromHash = () => {
      const key = window.location.hash.replace("#role-", "") as RoleKey;
      if (ROLES.some((r) => r.key === key)) setRole(key);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);
  const r = ROLES.find((x) => x.key === role) ?? ROLES[0];
  const Icon = r.icon;

  return (
    <section id="roles" className="scroll-mt-20 border-y border-line bg-surface py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand">Who it&apos;s for</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Choose who you are</h2>
          <p className="mt-3 text-soft">The same system looks different for each person. Pick your role to see what your portal does for you.</p>
        </Reveal>

        <div role="tablist" aria-label="Roles" className="scrollbar-none -mx-4 mt-8 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:justify-center sm:px-0">
          {ROLES.map((x) => {
            const XIcon = x.icon;
            const on = x.key === role;
            return (
              <button
                key={x.key}
                type="button"
                role="tab"
                id={`tab-${x.key}`}
                aria-selected={on}
                aria-controls="role-panel"
                onClick={() => setRole(x.key)}
                className={cx(
                  "flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition duration-200",
                  on ? "-translate-y-0.5 border-transparent bg-ink text-surface shadow-[var(--shadow-lift)]" : "border-line bg-surface text-soft hover:text-ink",
                )}
              >
                <span className={cx("flex size-6 items-center justify-center rounded-full bg-gradient-to-br text-white", x.accent)}><XIcon className="size-3.5" aria-hidden /></span>
                {x.label}
              </button>
            );
          })}
        </div>

        <div id="role-panel" role="tabpanel" aria-labelledby={`tab-${r.key}`} key={r.key} className="mt-10 grid animate-enter items-start gap-8 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <div className="flex items-center gap-3">
              <span className={cx("flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg", r.accent)}><Icon className="size-6" aria-hidden /></span>
              <div>
                <p className="text-sm font-semibold text-soft">{r.label} portal</p>
                <h3 className="text-2xl font-bold tracking-tight">{r.tagline}</h3>
              </div>
            </div>
            <p className="mt-5 text-lg leading-relaxed text-soft">{r.meaning}</p>
            <ul className="stagger mt-6 grid gap-3 sm:grid-cols-2">
              {r.can.map((c) => {
                const CIcon = c.icon;
                return (
                  <li key={c.title} className="rounded-2xl border border-line bg-background/60 p-4">
                    <CIcon className="size-5 text-brand" aria-hidden />
                    <p className="mt-2 font-semibold">{c.title}</p>
                    <p className="mt-1 text-sm text-soft">{c.text}</p>
                  </li>
                );
              })}
            </ul>
            <p className="mt-6 rounded-2xl bg-brand-soft px-4 py-3 text-sm"><strong>How you sign in: </strong>{r.signIn}</p>
          </div>

          <div className="space-y-5">
            <Tilt className="rounded-3xl">
              <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-[var(--shadow-pop)]">
                <div className={cx("flex items-center gap-2 bg-gradient-to-r px-4 py-3 text-white", r.accent)}>
                  <span className="flex gap-1.5" aria-hidden><span className="size-2.5 rounded-full bg-white/60" /><span className="size-2.5 rounded-full bg-white/40" /><span className="size-2.5 rounded-full bg-white/30" /></span>
                  <span className="ml-2 text-sm font-semibold">{r.preview.title}</span>
                </div>
                <ul className="divide-y divide-line">
                  {r.preview.rows.map((row) => (
                    <li key={row.label} className="flex items-center justify-between px-5 py-3.5 text-sm">
                      <span className="text-soft">{row.label}</span>
                      <span className={cx("font-bold tabular-nums", row.tone === "good" ? "text-green-600" : row.tone === "warn" ? "text-amber-600" : row.tone === "bad" ? "text-red-600" : "text-ink")}>{row.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Tilt>
            <div className="rounded-3xl border border-line p-5">
              <p className="text-sm font-semibold uppercase tracking-wider text-soft">A day with Vidyalaya OS</p>
              <ol className="mt-4 space-y-4">
                {r.day.map((d, i) => (
                  <li key={d.time} className="relative flex gap-4">
                    {i < r.day.length - 1 && <span className="absolute left-[1.05rem] top-9 h-[calc(100%-1rem)] w-px bg-line" aria-hidden />}
                    <span className={cx("flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[0.65rem] font-bold text-white", r.accent)}>{i + 1}</span>
                    <div>
                      <p className="text-xs font-semibold text-soft">{d.time}</p>
                      <p className="text-sm">{d.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-20 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand">How it works</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">From a new school to a busy Monday, in four steps</h2>
        </Reveal>
        <ol className="mt-10 grid gap-4 md:grid-cols-4">
          {STEPS.map((s, i) => {
            const SIcon = s.icon;
            return (
              <Reveal key={s.title} delay={i * 90}>
                <li className="relative h-full rounded-3xl border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
                  <span className="text-5xl font-extrabold text-brand/15">{i + 1}</span>
                  <SIcon className="absolute right-5 top-5 size-6 text-brand" aria-hidden />
                  <p className="mt-2 font-semibold">{s.title}</p>
                  <p className="mt-1 text-sm text-soft">{s.text}</p>
                </li>
              </Reveal>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="features" className="scroll-mt-20 bg-surface py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand">Features</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Everything a school day needs</h2>
        </Reveal>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => {
            const FIcon = f.icon;
            return (
              <Reveal key={f.title} delay={(i % 4) * 70}>
                <Tilt className="h-full rounded-3xl">
                  <div className="h-full rounded-3xl border border-line bg-background/60 p-5 transition hover:shadow-[var(--shadow-lift)]">
                    <span className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-violet-500 text-white shadow-md shadow-brand/30"><FIcon className="size-5" aria-hidden /></span>
                    <p className="mt-4 font-semibold">{f.title}</p>
                    <p className="mt-1 text-sm text-soft">{f.text}</p>
                  </div>
                </Tilt>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Trust() {
  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl bg-aurora p-8 text-white sm:p-12">
            <div className="bg-grid absolute inset-0" aria-hidden />
            <div className="relative">
              <h2 className="max-w-xl text-3xl font-bold tracking-tight">Private by design</h2>
              <div className="mt-8 grid gap-6 md:grid-cols-3">
                {TRUST.map((t) => {
                  const TIcon = t.icon;
                  return (
                    <div key={t.title}>
                      <span className="flex size-11 items-center justify-center rounded-2xl bg-white/15 backdrop-blur"><TIcon className="size-5" aria-hidden /></span>
                      <p className="mt-3 font-semibold">{t.title}</p>
                      <p className="mt-1 text-sm text-white/80">{t.text}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 pb-16 sm:pb-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <Reveal className="text-center">
          <h2 className="text-3xl font-bold tracking-tight">Questions people ask</h2>
        </Reveal>
        <div className="mt-8 space-y-3">
          {FAQ.map((f, i) => (
            <Reveal key={f.q} delay={i * 50}>
              <details id={i === 0 ? "parent-code" : undefined} className="group rounded-2xl border border-line bg-surface p-5 shadow-xs open:shadow-[var(--shadow-card)]" open={i === 0}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                  {f.q}
                  <ChevronDown className="size-5 shrink-0 text-soft transition group-open:rotate-180" aria-hidden />
                </summary>
                <p className="mt-3 text-soft">{f.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Contact() {
  return (
    <section id="contact" className="scroll-mt-20 border-t border-line bg-surface py-16 sm:py-20">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand">Contact</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Talk to us</h2>
          <p className="mt-3 text-soft">Want Vidyalaya OS for your school, or have a question? Write or call, and {CONTACT.productOwner} will get back to you.</p>
        </Reveal>
        <Reveal delay={80}>
          <ContactDetails className="mt-10" />
        </Reveal>
        <div className="mt-8 flex justify-center">
          <a href={contactLinks.email} className={buttonClass("primary", "lg")}><Mail aria-hidden /> Email us</a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-soft sm:flex-row sm:px-6">
        <Logo />
        <div className="text-center">
          <p>For owners, admins, teachers, students and parents.</p>
          <p className="mt-1">
            Product owner: {CONTACT.productOwner} · <a href={contactLinks.email} className="hover:text-ink hover:underline">{CONTACT.email}</a> · <a href={contactLinks.phone} className="whitespace-nowrap hover:text-ink hover:underline">{CONTACT.phoneLabel}</a>
          </p>
        </div>
        <Link href="/login" className="font-semibold text-brand hover:underline">Sign in</Link>
      </div>
    </footer>
  );
}
