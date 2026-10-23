"use client";

import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { ApiError } from "@/lib/api";

type Tone = "success" | "error" | "info";
type Toast = { id: number; tone: Tone; text: string };
type Ctx = {
  show: (tone: Tone, text: string) => void;
  success: (text: string) => void;
  error: (errorOrText: unknown, fallback?: string) => void;
  info: (text: string) => void;
};

const ToastContext = createContext<Ctx | null>(null);

const ICONS = { success: CircleCheck, error: CircleAlert, info: Info };
const STYLES: Record<Tone, string> = {
  success: "text-green-600 dark:text-green-400",
  error: "text-red-600 dark:text-red-400",
  info: "text-brand",
};

/** Short messages that appear at the bottom of the screen after an action. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const show = useCallback((tone: Tone, text: string) => {
    const id = next.current++;
    setToasts((t) => [...t.slice(-2), { id, tone, text }]);
    window.setTimeout(() => dismiss(id), tone === "error" ? 7000 : 4000);
  }, [dismiss]);

  const value = useMemo<Ctx>(() => ({
    show,
    success: (text) => show("success", text),
    info: (text) => show("info", text),
    error: (e, fallback = "That did not work. Please try again.") =>
      show("error", typeof e === "string" ? e : e instanceof ApiError ? e.message : fallback),
  }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:px-6 print:hidden"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((t) => {
          const Icon = ICONS[t.tone];
          return (
            <div
              key={t.id}
              role={t.tone === "error" ? "alert" : "status"}
              className="pointer-events-auto flex w-full max-w-sm animate-pop items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink shadow-[var(--shadow-pop)]"
            >
              <Icon className={`mt-0.5 size-5 shrink-0 ${STYLES[t.tone]}`} aria-hidden />
              <p className="min-w-0 flex-1">{t.text}</p>
              <button onClick={() => dismiss(t.id)} className="-m-1 rounded-md p-1 text-soft hover:bg-muted hover:text-ink" aria-label="Dismiss">
                <X className="size-4" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
