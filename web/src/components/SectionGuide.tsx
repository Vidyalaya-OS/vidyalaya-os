"use client";

import { ArrowRight, ChevronDown, GraduationCap, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Scene3D } from "@/components/Scene3D";
import { ADMIN_GUIDES } from "@/lib/guides";
import { useSession } from "@/lib/session";

const KEY = "sms.guides.hidden";

function readHidden(): string[] {
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

/** The explainer under an admin section's title: what the section is for,
 * how to use it step by step, the rule to know, and where to go next. It can
 * be folded away; the choice is remembered per section on this device. */
export function SectionGuide() {
  const pathname = usePathname();
  const { portal } = useSession();
  const guide = portal === "admin" ? ADMIN_GUIDES[pathname] : undefined;
  const [hidden, setHidden] = useState<string[] | null>(null);

  useEffect(() => {
    // Saved on this device only, so read it after the first render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHidden(readHidden());
  }, []);

  if (!guide || hidden === null) return null;
  const folded = hidden.includes(pathname);
  const toggle = () => {
    const next = folded ? hidden.filter((p) => p !== pathname) : [...hidden, pathname];
    setHidden(next);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Remembered for this visit only.
    }
  };
  const Icon = guide.icon;

  if (folded) {
    return (
      <button onClick={toggle} className="inline-flex min-h-9 animate-fade items-center gap-2 rounded-full border border-line bg-surface px-3 text-sm font-medium text-soft shadow-xs transition hover:border-brand/40 hover:text-brand">
        <GraduationCap className="size-4" aria-hidden /> How this section works
        <ChevronDown className="size-4" aria-hidden />
      </button>
    );
  }

  return (
    <section aria-label="How this section works" className="guide-card relative animate-rise overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-card)]" style={{ "--h": guide.hue } as React.CSSProperties}>
      <div className="guide-wash pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative grid gap-4 p-4 sm:grid-cols-[9rem_1fr] sm:items-center sm:gap-6 sm:p-5">
        <div className="mx-auto hidden sm:block"><Scene3D kind={guide.scene} icon={guide.icon} hue={guide.hue} /></div>
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="guide-chip flex size-9 shrink-0 items-center justify-center rounded-xl text-white sm:hidden"><Icon className="size-5" /></span>
              <div className="min-w-0">
                <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-soft">How this section works</p>
                <h2 className="text-base font-semibold leading-snug text-ink sm:text-lg">{guide.title}</h2>
              </div>
            </div>
            <button onClick={toggle} className="-m-1 shrink-0 rounded-lg px-2 py-1 text-sm font-medium text-soft transition hover:bg-muted hover:text-ink">Hide</button>
          </div>
          <p className="mt-1.5 max-w-3xl text-sm text-soft">{guide.purpose}</p>
          <ol className="guide-steps mt-3 grid gap-2 lg:grid-cols-2">
            {guide.steps.map((s, i) => (
              <li key={s} className="flex items-start gap-2.5 text-sm" style={{ "--d": `${i * 90}ms` } as React.CSSProperties}>
                <span className="guide-chip mt-px flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white">{i + 1}</span>
                <span className="text-ink">{s}</span>
              </li>
            ))}
          </ol>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            {guide.rule ? (
              <p className="flex max-w-3xl items-start gap-2 rounded-xl bg-muted/70 px-3 py-2 text-xs text-ink">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                {guide.rule}
              </p>
            ) : <span />}
            <Link href={guide.next.href} className="group inline-flex min-h-9 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-brand transition hover:bg-brand-soft">
              Next: {guide.next.label}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
