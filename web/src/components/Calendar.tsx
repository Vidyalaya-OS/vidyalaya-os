"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { IconButton, cx } from "@/components/ui";
import { todayIso } from "@/lib/format";

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type CalendarEvent = { id: string; date: string; title: string; kind: EventKind; detail?: string; href?: string };
export type EventKind = "homework" | "test" | "quiz" | "fee" | "overdue";

export const EVENT_STYLE: Record<EventKind, { label: string; dot: string; chip: string }> = {
  homework: { label: "Homework", dot: "bg-blue-500", chip: "bg-blue-50 text-blue-800 dark:bg-blue-950/70 dark:text-blue-200" },
  test: { label: "Test", dot: "bg-violet-500", chip: "bg-violet-50 text-violet-800 dark:bg-violet-950/70 dark:text-violet-200" },
  quiz: { label: "Quiz closes", dot: "bg-teal-500", chip: "bg-teal-50 text-teal-800 dark:bg-teal-950/70 dark:text-teal-200" },
  fee: { label: "Fee due", dot: "bg-amber-500", chip: "bg-amber-50 text-amber-900 dark:bg-amber-950/70 dark:text-amber-200" },
  overdue: { label: "Overdue fee", dot: "bg-red-500", chip: "bg-red-50 text-red-800 dark:bg-red-950/70 dark:text-red-200" },
};

export function shiftMonth(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthTitle(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** The first and last day of a month, as YYYY-MM-DD. */
export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  return { first: `${month}-01`, last: `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}` };
}

export function MonthNav({ month, onChange, min, max }: { month: string; onChange: (m: string) => void; min?: string; max?: string }) {
  const current = todayIso().slice(0, 7);
  return (
    <div className="flex items-center gap-1">
      <IconButton label="Previous month" onClick={() => onChange(shiftMonth(month, -1))} disabled={min != null && month <= min} className="disabled:opacity-30">
        <ChevronLeft aria-hidden />
      </IconButton>
      <span className="min-w-36 text-center text-sm font-semibold" aria-live="polite">{monthTitle(month)}</span>
      <IconButton label="Next month" onClick={() => onChange(shiftMonth(month, 1))} disabled={max != null && month >= max} className="disabled:opacity-30">
        <ChevronRight aria-hidden />
      </IconButton>
      {month !== current && (
        <button className="ml-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-brand hover:bg-brand-soft" onClick={() => onChange(current)}>Today</button>
      )}
    </div>
  );
}

/** A Monday-first month grid. Each day can be coloured (attendance) and carry
 * event dots or chips (due dates). Days are buttons when onSelect is given. */
export function MonthGrid({
  month,
  events = [],
  dayClass,
  dayNote,
  selected,
  onSelect,
}: {
  month: string;
  events?: CalendarEvent[];
  dayClass?: (iso: string) => string | undefined;
  dayNote?: (iso: string) => React.ReactNode;
  selected?: string | null;
  onSelect?: (iso: string) => void;
}) {
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const today = todayIso();
  const byDate = new Map<string, CalendarEvent[]>();
  for (const e of events) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);

  return (
    <div key={month} className="animate-fade">
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase tracking-wide text-soft" aria-hidden>
        {WEEKDAYS.map((w) => <div key={w} className="py-1.5"><span className="sm:hidden">{w[0]}</span><span className="hidden sm:inline">{w}</span></div>)}
      </div>
      <div className="grid grid-cols-7 gap-1" role="grid" aria-label={monthTitle(month)}>
        {cells.map((day, i) => {
          if (day == null) return <div key={`e${i}`} className="min-h-12 sm:min-h-24" />;
          const iso = `${month}-${String(day).padStart(2, "0")}`;
          const list = byDate.get(iso) ?? [];
          const isToday = iso === today;
          const isSelected = selected === iso;
          const weekend = (i % 7) >= 5;
          const content = (
            <>
              <span className={cx(
                "inline-flex size-7 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
                isToday && "bg-brand text-white dark:text-slate-950",
              )}>{day}</span>
              {dayNote && <span className="mt-0.5 block truncate text-[0.68rem] leading-tight">{dayNote(iso)}</span>}
              {list.length > 0 && (
                <>
                  <span className="mt-1 flex justify-center gap-0.5 sm:hidden" aria-hidden>
                    {list.slice(0, 3).map((e) => <span key={e.id} className={cx("size-1.5 rounded-full", EVENT_STYLE[e.kind].dot)} />)}
                  </span>
                  <span className="mt-1 hidden space-y-0.5 text-left sm:block">
                    {list.slice(0, 2).map((e) => (
                      <span key={e.id} className={cx("block truncate rounded-md px-1.5 py-0.5 text-[0.7rem] font-medium leading-4", EVENT_STYLE[e.kind].chip)}>{e.title}</span>
                    ))}
                    {list.length > 2 && <span className="block px-1.5 text-[0.7rem] text-soft">+{list.length - 2} more</span>}
                  </span>
                </>
              )}
            </>
          );
          const label = `${new Date(y, m - 1, day).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}${list.length ? `, ${list.length} item${list.length === 1 ? "" : "s"}` : ""}`;
          const cls = cx(
            "relative flex min-h-12 flex-col items-center rounded-xl border p-1 text-center transition duration-150 sm:min-h-24 sm:items-stretch sm:p-1.5 sm:text-left",
            dayClass?.(iso) ?? (weekend ? "border-transparent bg-muted/40" : "border-line/70 bg-surface"),
            isSelected && "ring-2 ring-brand ring-offset-1 ring-offset-[var(--surface)]",
            onSelect && "cursor-pointer hover:-translate-y-px hover:shadow-[var(--shadow-card)]",
          );
          return onSelect ? (
            <button key={iso} role="gridcell" aria-selected={isSelected} aria-label={label} className={cls} onClick={() => onSelect(iso)}>{content}</button>
          ) : (
            <div key={iso} role="gridcell" aria-label={label} className={cls}>{content}</div>
          );
        })}
      </div>
    </div>
  );
}

export function Legend({ items }: { items: { label: string; className: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-soft">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5"><span className={cx("size-2.5 rounded-full", i.className)} aria-hidden />{i.label}</li>
      ))}
    </ul>
  );
}
