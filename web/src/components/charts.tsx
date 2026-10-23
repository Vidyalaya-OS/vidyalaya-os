"use client";

import { useState } from "react";
import { cx } from "@/components/ui";

// Small, dependency-free charts. Colors: the brand blue for the main series,
// a neutral gray for the comparison, and the status colors (always with a
// text label) for attendance states.

const STATUS_FILL = {
  good: "#16a34a",
  warn: "#f59e0b",
  bad: "#dc2626",
  neutral: "#94a3b8",
  brand: "var(--brand)",
} as const;

export type Segment = { label: string; value: number; tone: keyof typeof STATUS_FILL };

/** A ring showing one percentage, with the number in the middle. */
export function Ring({ value, size = 96, label, tone }: { value: number | null; size?: number; label?: string; tone?: "good" | "warn" | "bad" }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  const color = tone ? STATUS_FILL[tone] : STATUS_FILL.brand;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${label ?? "Value"}: ${value == null ? "no data" : `${value}%`}`}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--muted)" strokeWidth="10" />
        <circle
          cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
          className="transition-[stroke-dashoffset] duration-1000 ease-out starting:[stroke-dashoffset:var(--c)]"
          style={{ ["--c" as string]: c }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold tabular-nums leading-none">{value == null ? "-" : `${Math.round(value)}%`}</span>
        {label && <span className="mt-1 text-[0.7rem] text-soft">{label}</span>}
      </div>
    </div>
  );
}

/** A donut split into labelled parts, with a legend beside it. */
export function Donut({ segments, centre, size = 120 }: { segments: Segment[]; centre?: React.ReactNode; size?: number }) {
  const total = segments.reduce((n, s) => n + s.value, 0);
  const r = 40;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" role="img" aria-label={segments.map((s) => `${s.label} ${s.value}`).join(", ")}>
          <circle cx="50" cy="50" r={r} fill="none" stroke="var(--muted)" strokeWidth="14" />
          {total > 0 && segments.map((s, i) => {
            const len = (s.value / total) * c;
            // A 2px gap between parts keeps them distinct.
            const gap = segments.filter((x) => x.value > 0).length > 1 ? 1.2 : 0;
            const el = s.value > 0 ? (
              <circle
                key={s.label}
                cx="50" cy="50" r={r} fill="none" stroke={STATUS_FILL[s.tone]} strokeWidth={hover === i ? 16 : 14}
                strokeDasharray={`${Math.max(0, len - gap)} ${c}`}
                strokeDashoffset={-offset}
                className="cursor-default transition-[stroke-width] duration-150"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <title>{`${s.label}: ${s.value}`}</title>
              </circle>
            ) : null;
            offset += len;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-center">{centre}</div>
      </div>
      <ul className="space-y-1.5 text-sm">
        {segments.map((s, i) => (
          <li key={s.label} className={cx("flex items-center gap-2 transition-opacity", hover != null && hover !== i && "opacity-50")}>
            <span className="size-2.5 rounded-full" style={{ background: STATUS_FILL[s.tone] }} aria-hidden />
            <span className="text-soft">{s.label}</span>
            <span className="font-semibold tabular-nums text-ink">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal bars (0–100) per item, with an optional comparison tick, such as
 * a student's percentage per subject and the class average. */
export function BarList({
  items,
  valueLabel = "Score",
  compareLabel,
  format = (n) => `${Math.round(n)}%`,
}: {
  items: { label: string; value: number | null; compare?: number | null; note?: string }[];
  valueLabel?: string;
  compareLabel?: string;
  format?: (n: number) => string;
}) {
  return (
    <div>
      {compareLabel && (
        <div className="mb-3 flex flex-wrap gap-4 text-xs text-soft" aria-hidden>
          <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-brand" />{valueLabel}</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-0.5 rounded-full bg-ink/60" />{compareLabel}</span>
        </div>
      )}
      <ul className="space-y-3">
        {items.map((it) => {
          const v = it.value == null ? 0 : Math.max(0, Math.min(100, it.value));
          const tip = `${it.label}: ${it.value == null ? "-" : format(it.value)}${it.compare != null && compareLabel ? ` · ${compareLabel} ${format(it.compare)}` : ""}`;
          return (
            <li key={it.label} title={tip}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate">{it.label}</span>
                <span className="shrink-0 font-semibold tabular-nums">{it.note ?? (it.value == null ? "-" : format(it.value))}</span>
              </div>
              <div className="relative h-2.5 rounded-full bg-muted">
                <div className="h-full origin-left animate-grow rounded-full bg-brand" style={{ width: `${v}%` }} />
                {it.compare != null && (
                  <span
                    className="absolute -top-1 h-[1.125rem] w-0.5 rounded-full bg-ink/60 ring-2 ring-surface"
                    style={{ left: `calc(${Math.max(0, Math.min(100, it.compare))}% - 1px)` }}
                    aria-hidden
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <span className="sr-only">{items.map((it) => `${it.label} ${it.value ?? "no data"}`).join("; ")}</span>
    </div>
  );
}

/** Stacked horizontal bars of two parts (for example collected and still due),
 * with the amounts on hover. */
export function SplitBars({
  items,
  labels,
  format,
}: {
  items: { label: string; a: number; b: number }[];
  labels: [string, string];
  format: (n: number) => string;
}) {
  const max = Math.max(1, ...items.map((i) => i.a + i.b));
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-soft" aria-hidden>
        <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-brand" />{labels[0]}</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-slate-300 dark:bg-slate-600" />{labels[1]}</span>
      </div>
      <ul className="space-y-3">
        {items.map((it) => (
          <li key={it.label} title={`${it.label}: ${labels[0]} ${format(it.a)} · ${labels[1]} ${format(it.b)}`}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate">{it.label}</span>
              <span className="shrink-0 text-xs text-soft tabular-nums">
                <span className="font-semibold text-ink">{format(it.a)}</span> / {format(it.a + it.b)}
              </span>
            </div>
            <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" style={{ width: `${((it.a + it.b) / max) * 100}%`, minWidth: "2rem" }}>
              {it.a > 0 && <div className="h-full origin-left animate-grow rounded-l-full bg-brand last:rounded-r-full" style={{ flexGrow: it.a }} />}
              {it.b > 0 && <div className="h-full rounded-r-full bg-slate-300 first:rounded-l-full dark:bg-slate-600" style={{ flexGrow: it.b }} />}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A small line chart of percentages over time, with a hover readout. */
export function TrendLine({ points, height = 140, threshold }: { points: { label: string; value: number | null }[]; height?: number; threshold?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const w = 320;
  const pad = { l: 28, r: 8, t: 10, b: 22 };
  const iw = w - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const x = (i: number) => pad.l + (points.length <= 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / 100) * ih;
  const valid = points.map((p, i) => ({ ...p, i })).filter((p) => p.value != null) as { label: string; value: number; i: number }[];
  const d = valid.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const h = hover != null ? points[hover] : null;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${height}`} className="w-full" role="img" aria-label={points.map((p) => `${p.label}: ${p.value ?? "no data"}%`).join(", ")}
        onMouseLeave={() => setHover(null)}>
        {[0, 50, 100].map((g) => (
          <g key={g}>
            <line x1={pad.l} x2={w - pad.r} y1={y(g)} y2={y(g)} stroke="var(--line)" strokeWidth="1" />
            <text x={pad.l - 6} y={y(g) + 3} textAnchor="end" className="fill-[var(--soft)] text-[9px]">{g}</text>
          </g>
        ))}
        {threshold != null && (
          <line x1={pad.l} x2={w - pad.r} y1={y(threshold)} y2={y(threshold)} stroke="#dc2626" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
        )}
        <path d={d} fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {valid.map((p) => (
          <circle key={p.i} cx={x(p.i)} cy={y(p.value)} r={hover === p.i ? 5 : 3.5} fill="var(--brand)" stroke="var(--surface)" strokeWidth="2" />
        ))}
        {points.map((p, i) => (
          <g key={p.label}>
            <text x={x(i)} y={height - 6} textAnchor="middle" className="fill-[var(--soft)] text-[9px]">{p.label}</text>
            <rect x={x(i) - iw / Math.max(1, points.length) / 2} y={pad.t} width={iw / Math.max(1, points.length)} height={ih} fill="transparent"
              onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />
          </g>
        ))}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="var(--soft)" strokeWidth="1" opacity="0.4" pointerEvents="none" />}
      </svg>
      {h && (
        <div className="pointer-events-none absolute top-0 rounded-lg border border-line bg-surface px-2 py-1 text-xs shadow-[var(--shadow-pop)]"
          style={{ left: `${(x(hover!) / w) * 100}%`, transform: "translateX(-50%)" }}>
          <span className="text-soft">{h.label}</span> <span className="font-semibold tabular-nums">{h.value == null ? "No data" : `${h.value}%`}</span>
        </div>
      )}
    </div>
  );
}
