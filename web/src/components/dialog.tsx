"use client";

import { X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { Button, Field, cx } from "@/components/ui";

/** A modal window built on the native <dialog>, which traps focus and closes
 * with Escape. On phones it rises from the bottom like a sheet. */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cx(
        "m-0 mt-auto w-full max-w-none rounded-t-2xl border border-line bg-surface p-0 text-ink shadow-[var(--shadow-pop)] backdrop:bg-slate-950/45 backdrop:backdrop-blur-[2px] open:animate-slide-up",
        "sm:m-auto sm:rounded-2xl sm:open:animate-pop",
        size === "sm" ? "sm:max-w-sm" : size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg",
      )}
    >
      {open && (
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
              {description && <p className="mt-1 text-sm text-soft">{description}</p>}
            </div>
            <button onClick={onClose} className="-m-1 rounded-lg p-1.5 text-soft hover:bg-muted hover:text-ink" aria-label="Close">
              <X className="size-5" aria-hidden />
            </button>
          </div>
          {children && <div className="overflow-y-auto px-5 py-4">{children}</div>}
          {footer && <div className="pb-safe flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

type ConfirmOptions = { title: string; body?: React.ReactNode; confirmLabel?: string; cancelLabel?: string; danger?: boolean };
type PromptField = { name: string; label: string; type?: string; initial?: string; required?: boolean; placeholder?: string; hint?: string; min?: string; step?: string };
type PromptOptions = { title: string; body?: React.ReactNode; fields: PromptField[]; confirmLabel?: string; danger?: boolean };

type Pending =
  | { kind: "confirm"; opts: ConfirmOptions; resolve: (ok: boolean) => void }
  | { kind: "prompt"; opts: PromptOptions; resolve: (values: Record<string, string> | null) => void };

type Ctx = {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  prompt: (opts: PromptOptions) => Promise<Record<string, string> | null>;
};

const DialogContext = createContext<Ctx | null>(null);

/** Replaces the browser's confirm() and prompt() with in-app dialogs. */
export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  const confirm = useCallback((opts: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ kind: "confirm", opts, resolve })), []);
  const prompt = useCallback((opts: PromptOptions) => new Promise<Record<string, string> | null>((resolve) => {
    setValues(Object.fromEntries(opts.fields.map((f) => [f.name, f.initial ?? ""])));
    setPending({ kind: "prompt", opts, resolve });
  }), []);

  const close = (result: boolean) => {
    if (!pending) return;
    if (pending.kind === "confirm") pending.resolve(result);
    else pending.resolve(result ? values : null);
    setPending(null);
  };

  const opts = pending?.opts;
  const formId = useId();

  return (
    <DialogContext.Provider value={{ confirm, prompt }}>
      {children}
      <Modal
        open={Boolean(pending)}
        onClose={() => close(false)}
        title={opts?.title ?? ""}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => close(false)}>{pending?.kind === "confirm" ? pending.opts.cancelLabel ?? "Cancel" : "Cancel"}</Button>
            {pending?.kind === "prompt" ? (
              <Button type="submit" form={formId} variant={opts?.danger ? "danger-solid" : "primary"}>{opts?.confirmLabel ?? "Save"}</Button>
            ) : (
              <Button autoFocus variant={opts?.danger ? "danger-solid" : "primary"} onClick={() => close(true)}>{opts?.confirmLabel ?? "Continue"}</Button>
            )}
          </>
        }
      >
        {opts?.body && <div className="text-sm text-soft">{opts.body}</div>}
        {pending?.kind === "prompt" && (
          <form
            id={formId}
            className={cx("space-y-3", opts?.body ? "mt-4" : undefined)}
            onSubmit={(e) => {
              e.preventDefault();
              close(true);
            }}
          >
            {pending.opts.fields.map((f, i) => (
              <Field
                key={f.name}
                autoFocus={i === 0}
                label={f.label}
                type={f.type}
                required={f.required}
                placeholder={f.placeholder}
                hint={f.hint}
                min={f.min}
                step={f.step}
                value={values[f.name] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              />
            ))}
          </form>
        )}
      </Modal>
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog must be used inside DialogProvider");
  return ctx;
}
