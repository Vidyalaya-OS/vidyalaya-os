"use client";

import Link from "next/link";
import { forwardRef } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  busy?: boolean;
};

export function Button({ variant = "primary", busy, className, children, disabled, ...rest }: ButtonProps) {
  const styles = {
    primary: "bg-brand text-white hover:bg-brand-dark",
    secondary: "border border-line bg-surface text-ink hover:bg-muted",
    danger: "border border-red-300 bg-surface text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950",
    ghost: "text-brand hover:bg-muted",
  }[variant];
  return (
    <button
      className={cx(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition disabled:opacity-50",
        styles,
        className,
      )}
      disabled={disabled || busy}
      {...rest}
    >
      {busy ? "Working…" : children}
    </button>
  );
}

export function ButtonLink({ href, children, variant = "primary" }: { href: string; children: React.ReactNode; variant?: "primary" | "secondary" }) {
  return (
    <Link
      href={href}
      className={cx(
        "inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-medium",
        variant === "primary" ? "bg-brand text-white hover:bg-brand-dark" : "border border-line bg-surface hover:bg-muted",
      )}
    >
      {children}
    </Link>
  );
}

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string };

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field({ label, error, hint, className, ...rest }, ref) {
  return (
    <label className={cx("block text-sm", className)}>
      <span className="mb-1 block font-medium text-ink">{label}</span>
      <input
        ref={ref}
        className={cx(
          "block min-h-10 w-full rounded-lg border bg-surface px-3 text-base text-ink outline-none focus:ring-2 focus:ring-brand/40 sm:text-sm",
          error ? "border-red-500" : "border-line",
        )}
        {...rest}
      />
      {hint && !error && <span className="mt-1 block text-xs text-soft">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600 dark:text-red-400">{error}</span>}
    </label>
  );
});

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string };

export function Select({ label, error, className, children, ...rest }: SelectProps) {
  return (
    <label className={cx("block text-sm", className)}>
      <span className="mb-1 block font-medium text-ink">{label}</span>
      <select
        className={cx(
          "block min-h-10 w-full rounded-lg border bg-surface px-3 text-base text-ink sm:text-sm",
          error ? "border-red-500" : "border-line",
        )}
        {...rest}
      >
        {children}
      </select>
      {error && <span className="mt-1 block text-xs text-red-600 dark:text-red-400">{error}</span>}
    </label>
  );
}

export function Card({ title, actions, children, className }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-xl border border-line bg-surface p-4 sm:p-5", className)}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-ink sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-soft">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Alert({ tone = "error", children }: { tone?: "error" | "success" | "info"; children: React.ReactNode }) {
  const styles = {
    error: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
    success: "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200",
    info: "border-line bg-muted text-ink",
  }[tone];
  return <div className={cx("rounded-lg border px-3 py-2 text-sm", styles)} role={tone === "error" ? "alert" : "status"}>{children}</div>;
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" | "bad" }) {
  const styles = {
    neutral: "bg-muted text-soft",
    good: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
    warn: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    bad: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  }[tone];
  return <span className={cx("inline-block rounded-full px-2 py-0.5 text-xs font-medium", styles)}>{children}</span>;
}

export function statusTone(status: string): "neutral" | "good" | "warn" | "bad" {
  if (["active"].includes(status)) return "good";
  if (["invited", "suspended", "transferred", "promoted"].includes(status)) return "warn";
  if (["left", "archived", "disabled"].includes(status)) return "bad";
  return "neutral";
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-soft">{children}</p>;
}

export function Loading() {
  return <p className="py-8 text-center text-sm text-soft">Loading…</p>;
}

/** A table on wide screens that turns into stacked cards on phones. */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
}: {
  rows: T[];
  columns: { header: string; cell: (row: T) => React.ReactNode; className?: string }[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
}) {
  return (
    <>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wide text-soft">
              {columns.map((c) => (
                <th key={c.header} className={cx("px-3 py-2 font-medium", c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cx("border-b border-line last:border-0", onRowClick && "cursor-pointer hover:bg-muted")}
              >
                {columns.map((c) => (
                  <td key={c.header} className={cx("px-3 py-2.5 align-top", c.className)}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-2 sm:hidden">
        {rows.map((row) => (
          <li
            key={rowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={cx("rounded-lg border border-line p-3 text-sm", onRowClick && "cursor-pointer active:bg-muted")}
          >
            {columns.map((c, i) => (
              <div key={c.header} className={cx("flex justify-between gap-3", i > 0 && "mt-1")}>
                <span className="text-soft">{c.header}</span>
                <span className="text-right">{c.cell(row)}</span>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </>
  );
}
