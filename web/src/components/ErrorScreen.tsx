"use client";

import { CircleAlert, House, RotateCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button, buttonClass } from "@/components/ui";

/** The fallback for a screen that crashed while drawing. */
export function ErrorScreen({ error, retry, full }: { error: unknown; retry: () => void; full?: boolean }) {
  useEffect(() => {
    // Kept in the browser console for support; no tracking service is set up yet.
    console.error(error);
  }, [error]);
  const digest = error && typeof error === "object" && "digest" in error ? String((error as { digest?: string }).digest ?? "") : "";
  return (
    <div className={full ? "flex min-h-dvh items-center justify-center p-6" : "flex min-h-[60vh] items-center justify-center py-10"}>
      <div className="w-full max-w-md animate-pop rounded-2xl border border-line bg-surface p-8 text-center shadow-[var(--shadow-lift)]">
        <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-300">
          <CircleAlert className="size-7" aria-hidden />
        </span>
        <h1 className="text-xl font-bold">Something went wrong</h1>
        <p className="mt-2 text-sm text-soft">This screen hit a problem. Your data is safe. Try again, or go back to the home screen.</p>
        {digest && <p className="mt-3 font-mono text-xs text-soft">Reference: {digest}</p>}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button onClick={retry}><RotateCw aria-hidden /> Try again</Button>
          <Link href="/" className={buttonClass("secondary")}><House aria-hidden /> Home</Link>
        </div>
      </div>
    </div>
  );
}
