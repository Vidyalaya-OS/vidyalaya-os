"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loading } from "@/components/ui";
import { useSession } from "@/lib/session";

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { ready, user, signOut, memberships } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user?.is_platform_owner) router.replace("/");
  }, [ready, user, router]);

  if (!ready || !user?.is_platform_owner) return <Loading />;

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/platform" className="font-semibold">Platform</Link>
          <div className="flex items-center gap-3 text-sm">
            {memberships.length > 0 && <Link href="/choose-school" className="text-brand">My schools</Link>}
            <button className="text-soft" onClick={() => signOut().then(() => router.replace("/login"))}>Sign out</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
