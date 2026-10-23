import { House } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-md animate-pop text-center">
        <p className="bg-gradient-to-br from-brand to-violet-500 bg-clip-text text-8xl font-extrabold tracking-tighter text-transparent">404</p>
        <h1 className="mt-4 text-2xl font-bold">We couldn&apos;t find that page</h1>
        <p className="mt-2 text-soft">The link may be old, or the page may have moved. Head back home and pick up from there.</p>
        <Link href="/" className="mt-8 inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-dark active:scale-[0.97] dark:text-slate-950">
          <House className="size-4" aria-hidden /> Go to home
        </Link>
      </div>
    </main>
  );
}
