"use client";

import { useEffect, useState } from "react";
import { cx, hashIndex } from "@/components/ui";
import { shortTime } from "@/lib/format";

export const SUBJECT_COLORS = [
  "border-l-blue-500 bg-blue-50/70 dark:bg-blue-950/40",
  "border-l-violet-500 bg-violet-50/70 dark:bg-violet-950/40",
  "border-l-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40",
  "border-l-amber-500 bg-amber-50/70 dark:bg-amber-950/40",
  "border-l-rose-500 bg-rose-50/70 dark:bg-rose-950/40",
  "border-l-cyan-500 bg-cyan-50/70 dark:bg-cyan-950/40",
  "border-l-fuchsia-500 bg-fuchsia-50/70 dark:bg-fuchsia-950/40",
  "border-l-lime-500 bg-lime-50/70 dark:bg-lime-950/40",
];

/** A colour that stays the same for a subject everywhere it is shown. */
export function subjectColor(name: string) {
  return SUBJECT_COLORS[hashIndex(name, SUBJECT_COLORS.length)];
}

function nowHm() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** The current time as HH:MM, refreshed every minute. */
export function useNow() {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(nowHm());
    const t = window.setInterval(() => setNow(nowHm()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

export type Slot = { id: string; start: string; end: string; title: string; detail?: string };

/** Today's classes as a timeline, with the class going on now marked. */
export function Schedule({ slots, live = true }: { slots: Slot[]; live?: boolean }) {
  const now = useNow();
  return (
    <ol className="stagger relative space-y-2">
      {slots.map((s) => {
        const start = shortTime(s.start);
        const end = shortTime(s.end);
        const current = live && now != null && now >= start && now < end;
        const past = live && now != null && now >= end;
        return (
          <li key={s.id} className={cx("flex gap-3 transition-opacity", past && "opacity-55")}>
            <div className="w-14 shrink-0 pt-2 text-right text-xs tabular-nums text-soft">
              <div className="font-semibold text-ink">{start}</div>
              <div>{end}</div>
            </div>
            <div className={cx("min-w-0 flex-1 rounded-xl border-l-4 px-3 py-2.5", subjectColor(s.title), current && "ring-2 ring-brand")}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-semibold">{s.title}</span>
                {current && <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-brand"><span className="size-2 animate-pulse rounded-full bg-brand" />Now</span>}
              </div>
              {s.detail && <div className="truncate text-xs text-soft">{s.detail}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
