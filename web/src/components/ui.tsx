"use client";

import { ArrowLeft, CircleAlert, CircleCheck, Inbox, Info, LoaderCircle, RotateCw, WifiOff } from "lucide-react";
import Link from "next/link";
import { forwardRef, useEffect, useId, useRef, useState } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ buttons */

type Variant = "primary" | "secondary" | "danger" | "danger-solid" | "ghost" | "soft";
type Size = "sm" | "md" | "lg";

const BUTTON_BASE =
  "inline-flex select-none items-center justify-center gap-2 rounded-xl font-medium transition duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-[1.1em] [&_svg]:shrink-0";
const BUTTON_VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-white shadow-sm shadow-brand/25 hover:bg-brand-dark hover:shadow-md hover:shadow-brand/25 dark:text-slate-950",
  secondary: "border border-line bg-surface text-ink shadow-xs hover:border-soft/40 hover:bg-muted",
  danger: "border border-red-200 bg-surface text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/60",
  "danger-solid": "bg-red-600 text-white shadow-sm hover:bg-red-700",
  ghost: "text-brand hover:bg-brand-soft",
  soft: "bg-brand-soft text-brand hover:bg-brand/15",
};
const BUTTON_SIZES: Record<Size, string> = {
  sm: "min-h-9 px-3 text-sm",
  md: "min-h-11 px-4 text-sm",
  lg: "min-h-12 px-5 text-base",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className);
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; busy?: boolean };

export function Button({ variant = "primary", size = "md", busy, className, children, disabled, type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {busy && <LoaderCircle className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function ButtonLink({ href, children, variant = "primary", size = "md", className }: { href: string; children: React.ReactNode; variant?: Variant; size?: Size; className?: string }) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}

export function IconButton({ label, className, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx("inline-flex size-10 items-center justify-center rounded-xl text-soft transition hover:bg-muted hover:text-ink active:scale-95 [&_svg]:size-5", className)}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------- form fields */

const CONTROL =
  "block min-h-11 w-full rounded-xl border bg-surface px-3.5 text-base text-ink shadow-xs outline-none transition placeholder:text-soft/70 focus:border-brand focus:ring-4 focus:ring-[var(--ring)] disabled:cursor-not-allowed disabled:bg-muted sm:text-sm";

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** A friendly message for a control the browser found invalid. */
function messageFor(el: Control, label: string) {
  const v = el.validity;
  const name = label.replace(/\s*\(.*\)$/, "").toLowerCase();
  if (v.valueMissing) return el instanceof HTMLSelectElement ? `Choose ${name}.` : `Enter ${name}.`;
  if (v.typeMismatch && el.type === "email") return "Enter a valid email address, like name@school.com.";
  if (v.typeMismatch) return `Enter a valid ${name}.`;
  if (v.tooShort && el instanceof HTMLInputElement) return `Use at least ${el.minLength} characters.`;
  if (v.rangeUnderflow && el instanceof HTMLInputElement) return `Must be ${el.min} or more.`;
  if (v.rangeOverflow && el instanceof HTMLInputElement) return `Must be ${el.max} or less.`;
  if (v.patternMismatch) return el.title || `Check the format of ${name}.`;
  if (v.tooLong && "maxLength" in el) return `Use at most ${el.maxLength} characters.`;
  if (v.stepMismatch) return "Enter a rounder number.";
  if (v.badInput) return `Enter a valid ${name}.`;
  return el.validationMessage;
}

/** Shows the browser's own checks (required, email, min…) as a message under
 * the field instead of a pop-up bubble, and moves focus to the first problem. */
function useValidation<T extends Control>(label: string, serverError?: string) {
  const [local, setLocal] = useState<string | null>(null);
  const onInvalid = (e: React.FormEvent<T>) => {
    e.preventDefault();
    const el = e.currentTarget;
    setLocal(messageFor(el, label));
    if (el.form?.querySelector(":invalid") === el) el.focus();
  };
  const recheck = (el: T) => {
    if (local && el.validity.valid) setLocal(null);
  };
  return { error: serverError || local || undefined, onInvalid, recheck };
}

function FieldShell({ id, label, error, hint, className, children, optional }: { id: string; label: string; error?: string; hint?: string; className?: string; children: React.ReactNode; optional?: boolean }) {
  return (
    <div className={cx("block text-sm", className)}>
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between gap-2 font-medium text-ink">
        {label}
        {optional && <span className="text-xs font-normal text-soft">Optional</span>}
      </label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="mt-1.5 text-xs text-soft">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 flex animate-fade items-start gap-1.5 text-xs font-medium text-red-600 dark:text-red-400" role="alert">
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string; icon?: React.ReactNode };

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field({ label, error, hint, className, icon, id, onChange, ...rest }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  const v = useValidation<HTMLInputElement>(label, error);
  return (
    <FieldShell id={fid} label={label} error={v.error} hint={hint} className={className}>
      <div className="relative">
        {icon && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-soft [&_svg]:size-4">{icon}</span>}
        <input
          ref={ref}
          id={fid}
          aria-invalid={v.error ? true : undefined}
          aria-describedby={v.error ? `${fid}-error` : hint ? `${fid}-hint` : undefined}
          onInvalid={v.onInvalid}
          onChange={(e) => {
            v.recheck(e.currentTarget);
            onChange?.(e);
          }}
          className={cx(CONTROL, icon ? "pl-9" : undefined, v.error ? "border-red-400 dark:border-red-700" : "border-line")}
          {...rest}
        />
      </div>
    </FieldShell>
  );
});

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string; hint?: string };

export function Select({ label, error, hint, className, children, id, onChange, ...rest }: SelectProps) {
  const auto = useId();
  const fid = id ?? auto;
  const v = useValidation<HTMLSelectElement>(label, error);
  return (
    <FieldShell id={fid} label={label} error={v.error} hint={hint} className={className}>
      <select
        id={fid}
        aria-invalid={v.error ? true : undefined}
        onInvalid={v.onInvalid}
        onChange={(e) => {
          v.recheck(e.currentTarget);
          onChange?.(e);
        }}
        className={cx(
          CONTROL,
          "select-chevron cursor-pointer appearance-none pr-9",
          v.error ? "border-red-400 dark:border-red-700" : "border-line",
        )}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  );
}

type TextAreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; hint?: string };

export function TextArea({ label, error, hint, className, id, onChange, ...rest }: TextAreaProps) {
  const auto = useId();
  const fid = id ?? auto;
  const v = useValidation<HTMLTextAreaElement>(label, error);
  return (
    <FieldShell id={fid} label={label} error={v.error} hint={hint} className={className}>
      <textarea
        id={fid}
        aria-invalid={v.error ? true : undefined}
        onInvalid={v.onInvalid}
        onChange={(e) => {
          v.recheck(e.currentTarget);
          onChange?.(e);
        }}
        className={cx(CONTROL, "min-h-24 py-2.5", v.error ? "border-red-400 dark:border-red-700" : "border-line")}
        {...rest}
      />
    </FieldShell>
  );
}

export function Checkbox({ label, className, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode }) {
  return (
    <label className={cx("flex min-h-11 cursor-pointer items-center gap-2.5 text-sm", className)}>
      <input type="checkbox" className="size-[1.15rem] cursor-pointer rounded accent-[var(--brand)]" {...rest} />
      <span>{label}</span>
    </label>
  );
}

/* ------------------------------------------------------------------ layout */

export function Card({
  title,
  description,
  icon,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cx("rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5", className)}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {icon && <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand [&_svg]:size-[1.15rem]">{icon}</span>}
            <div className="min-w-0">
              {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
              {description && <p className="mt-0.5 text-sm text-soft">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6 animate-enter">
      {back && (
        <Link href={back.href} className="mb-2 inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-soft transition hover:text-brand">
          <ArrowLeft className="size-4" aria-hidden /> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[1.75rem] sm:leading-9">{title}</h1>
          {subtitle && <p className="mt-1 max-w-2xl text-sm text-soft sm:text-base">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- feedback */

export function Alert({ tone = "error", children, title }: { tone?: "error" | "success" | "info" | "warn"; children: React.ReactNode; title?: string }) {
  const styles = {
    error: "border-red-200 bg-red-50 text-red-900 dark:border-red-900/70 dark:bg-red-950/50 dark:text-red-100",
    success: "border-green-200 bg-green-50 text-green-900 dark:border-green-900/70 dark:bg-green-950/50 dark:text-green-100",
    warn: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/50 dark:text-amber-100",
    info: "border-brand/20 bg-brand-soft text-ink",
  }[tone];
  const Icon = tone === "error" ? CircleAlert : tone === "success" ? CircleCheck : Info;
  return (
    <div className={cx("flex animate-fade items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm", styles)} role={tone === "error" ? "alert" : "status"}>
      <Icon className={cx("mt-0.5 size-[1.1rem] shrink-0", tone === "info" && "text-brand")} aria-hidden />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}

export type Tone = "neutral" | "good" | "warn" | "bad" | "info";

const BADGE: Record<Tone, string> = {
  neutral: "bg-muted text-soft",
  good: "bg-green-100 text-green-800 dark:bg-green-950/80 dark:text-green-300",
  warn: "bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300",
  bad: "bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-300",
  info: "bg-brand-soft text-brand",
};

export function Badge({ children, tone = "neutral", dot }: { children: React.ReactNode; tone?: Tone; dot?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold", BADGE[tone])}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {typeof children === "string" && /^[a-z]/.test(children) ? children[0].toUpperCase() + children.slice(1).replaceAll("_", " ") : children}
    </span>
  );
}

export function statusTone(status: string): Tone {
  if (["active"].includes(status)) return "good";
  if (["invited", "suspended", "transferred", "promoted"].includes(status)) return "warn";
  if (["left", "archived", "disabled"].includes(status)) return "bad";
  return "neutral";
}

export function Empty({ children, title, icon, action }: { children?: React.ReactNode; title?: string; icon?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex animate-fade flex-col items-center rounded-2xl border border-dashed border-line px-6 py-10 text-center">
      <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-muted text-soft [&_svg]:size-6">{icon ?? <Inbox aria-hidden />}</span>
      {title && <p className="font-semibold text-ink">{title}</p>}
      {children && <p className={cx("max-w-sm text-sm text-soft", title && "mt-1")}>{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** A friendly error with a Retry button, for a section that failed to load. */
export function ErrorState({ message, onRetry, compact }: { message?: string | null; onRetry?: () => void; compact?: boolean }) {
  const offline = message?.toLowerCase().includes("reach the server");
  const Icon = offline ? WifiOff : CircleAlert;
  return (
    <div role="alert" className={cx("flex animate-fade flex-col items-center rounded-2xl border border-red-200 bg-red-50/60 text-center dark:border-red-900/60 dark:bg-red-950/30", compact ? "px-4 py-5" : "px-6 py-10")}>
      <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-300">
        <Icon className="size-6" aria-hidden />
      </span>
      <p className="font-semibold text-ink">{offline ? "You seem to be offline" : "This didn't load"}</p>
      <p className="mt-1 max-w-sm text-sm text-soft">{message || "Something went wrong on our side."}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          <RotateCw aria-hidden /> Try again
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton rounded-lg", className)} aria-hidden />;
}

/** A placeholder while a section loads, shaped like what is coming. */
export function Loading({ variant = "list", rows = 4 }: { variant?: "list" | "cards" | "stats" | "table" | "text"; rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="animate-fade">
      <span className="sr-only">Loading…</span>
      {variant === "stats" ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
      ) : variant === "cards" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
        </div>
      ) : variant === "text" ? (
        <div className="space-y-2.5 py-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : (
        <div className="space-y-2.5 py-1">
          {variant === "table" && <Skeleton className="h-8 w-full" />}
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-10 shrink-0 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5" />
                <Skeleton className="h-3 w-2/5" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** What a section shows while it loads, when it failed, or when it has nothing. */
export function Async<T>({
  state,
  children,
  loading,
  empty,
  isEmpty,
}: {
  state: { data: T | null; error: string | null; loading: boolean; reload: () => void };
  children: (data: T) => React.ReactNode;
  loading?: React.ReactNode;
  empty?: React.ReactNode;
  isEmpty?: (data: T) => boolean;
}) {
  if (state.error && !state.data) return <ErrorState message={state.error} onRetry={state.reload} />;
  if (state.data == null) return <>{loading ?? <Loading />}</>;
  if (empty && isEmpty?.(state.data)) return <>{empty}</>;
  return <>{children(state.data)}</>;
}

/* ------------------------------------------------------------------- data */

type Column<T> = { header: string; cell: (row: T) => React.ReactNode; className?: string };

/** A table on wide screens that turns into stacked cards on phones. */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  empty,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  empty?: React.ReactNode;
}) {
  if (rows.length === 0 && empty) return <>{typeof empty === "string" ? <Empty>{empty}</Empty> : empty}</>;
  const [first, ...rest] = columns;
  const keyActivate = (row: T) => (e: React.KeyboardEvent) => {
    if (onRowClick && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      onRowClick(row);
    }
  };
  return (
    <>
      <div className="-mx-4 hidden overflow-x-auto sm:-mx-5 md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-y border-line bg-muted/60 text-xs font-semibold uppercase tracking-wide text-soft">
              {columns.map((c, i) => (
                <th key={c.header || i} scope="col" className={cx("whitespace-nowrap px-4 py-2.5 first:pl-5 last:pr-5", c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="stagger">
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={keyActivate(row)}
                tabIndex={onRowClick ? 0 : undefined}
                className={cx("border-b border-line transition-colors last:border-0", onRowClick ? "cursor-pointer hover:bg-brand-soft/50 focus-visible:bg-brand-soft/50" : "hover:bg-muted/40")}
              >
                {columns.map((c, i) => (
                  <td key={c.header || i} className={cx("px-4 py-3 align-middle first:pl-5 last:pr-5", c.className)}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="stagger space-y-2.5 md:hidden">
        {rows.map((row) => (
          <li
            key={rowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            onKeyDown={keyActivate(row)}
            tabIndex={onRowClick ? 0 : undefined}
            className={cx("rounded-xl border border-line bg-surface p-3.5 text-sm", onRowClick && "cursor-pointer transition active:scale-[0.99] active:bg-muted")}
          >
            {first && <div className="mb-1.5 font-medium">{first.cell(row)}</div>}
            {rest.map((c, i) => {
              const value = c.cell(row);
              if (value == null || value === false || value === "") return null;
              return c.header ? (
                <div key={c.header || i} className="flex items-baseline justify-between gap-3 py-0.5">
                  <span className="text-xs text-soft">{c.header}</span>
                  <span className="min-w-0 text-right">{value}</span>
                </div>
              ) : (
                <div key={i} className="mt-2 border-t border-line pt-2">{value}</div>
              );
            })}
          </li>
        ))}
      </ul>
    </>
  );
}

/** A row of tabs; the parent keeps which one is open. Arrow keys move between tabs. */
export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { key: T; label: string; count?: number }[]; value: T; onChange: (key: T) => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = tabs.findIndex((t) => t.key === value);
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    onChange(next.key);
    ref.current?.querySelector<HTMLButtonElement>(`[data-key="${next.key}"]`)?.focus();
  };
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [value]);
  return (
    <div ref={ref} className={cx("scrollbar-none mb-5 flex gap-1 overflow-x-auto rounded-2xl border border-line bg-surface p-1 shadow-xs", className)} role="tablist" onKeyDown={onKey}>
      {tabs.map((t) => {
        const active = value === t.key;
        return (
          <button
            key={t.key}
            data-key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.key)}
            className={cx(
              "flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3.5 text-sm font-medium transition duration-200",
              active ? "bg-brand text-white shadow-sm dark:text-slate-950" : "text-soft hover:bg-muted hover:text-ink",
            )}
          >
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className={cx("rounded-full px-1.5 text-xs tabular-nums", active ? "bg-white/25" : "bg-muted")}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Counts up to a number when it first appears. */
export function CountUp({ value, format = (n) => String(Math.round(n)) }: { value: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = still ? 1 : Math.min(1, (t - start) / 700);
      setShown(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{format(shown)}</>;
}

const STAT_TONE = {
  good: "text-green-700 dark:text-green-300",
  warn: "text-amber-700 dark:text-amber-300",
  bad: "text-red-700 dark:text-red-300",
} as const;
const STAT_ICON = {
  good: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  warn: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  bad: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
} as const;

export function Stat({
  label,
  value,
  hint,
  tone,
  icon,
  progress,
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "good" | "warn" | "bad";
  icon?: React.ReactNode;
  progress?: number | null;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-soft">{label}</div>
        {icon && <span className={cx("flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4", tone ? STAT_ICON[tone] : "bg-brand-soft text-brand")}>{icon}</span>}
      </div>
      <div className={cx("mt-1 text-2xl font-bold tabular-nums tracking-tight", tone ? STAT_TONE[tone] : "text-ink")}>
        {typeof value === "number" ? <CountUp value={value} /> : value}
      </div>
      {progress != null && <Progress value={progress} tone={tone} className="mt-2.5" />}
      {hint && <div className="mt-1 text-xs text-soft">{hint}</div>}
    </>
  );
  const cls = "block rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-card)] transition duration-200";
  return href ? (
    <Link href={href} className={cx(cls, "hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)] active:translate-y-0")}>{body}</Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

const BAR = { good: "bg-green-500", warn: "bg-amber-500", bad: "bg-red-500" } as const;

/** A bar that fills from the left when it appears. */
export function Progress({ value, tone, className, label }: { value: number; tone?: "good" | "warn" | "bad"; className?: string; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cx("h-2 overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className={cx("h-full origin-left animate-grow rounded-full", tone ? BAR[tone] : "bg-brand")} style={{ width: `${v}%` }} />
    </div>
  );
}

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300",
];

export function hashIndex(text: string, n: number) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h % n;
}

export function Avatar({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  return (
    <span
      aria-hidden
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        AVATAR_COLORS[hashIndex(name, AVATAR_COLORS.length)],
        size === "sm" ? "size-8 text-xs" : size === "lg" ? "size-14 text-lg" : "size-10 text-sm",
        className,
      )}
    >
      {initials || "?"}
    </span>
  );
}

/** A small segmented switch, like Week | Month. */
export function Segmented<T extends string>({ options, value, onChange, label }: { options: { key: T; label: string }[]; value: T; onChange: (key: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl bg-muted p-1">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={value === o.key}
          onClick={() => onChange(o.key)}
          className={cx("min-h-9 rounded-lg px-3 text-sm font-medium transition", value === o.key ? "bg-surface text-ink shadow-sm" : "text-soft hover:text-ink")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Shown while the app works out who is signed in. */
export function PageLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status" aria-label={label}>
      <div className="flex flex-col items-center gap-4 animate-fade">
        <span className="flex size-12 animate-pulse items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-violet-500 text-white shadow-lg shadow-brand/30">
          <LoaderCircle className="size-6 animate-spin" aria-hidden />
        </span>
        <span className="text-sm text-soft">{label}…</span>
      </div>
    </div>
  );
}

/** Save buttons that stay in reach at the bottom of long forms, above the phone tab bar. */
export function StickyBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cx("sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface/95 p-3 shadow-[var(--shadow-pop)] backdrop-blur lg:bottom-4", className)}>
      {children}
    </div>
  );
}
