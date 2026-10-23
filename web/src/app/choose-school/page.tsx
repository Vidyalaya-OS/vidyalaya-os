"use client";

import { ChevronRight, LayoutDashboard, LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AuthLayout } from "@/components/AuthLayout";
import { Avatar, Badge, Button, PageLoader } from "@/components/ui";
import { ROLE_LABELS, useSession } from "@/lib/session";

export default function ChooseSchool() {
  const { ready, user, memberships, chooseSchool, signOut } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  if (!ready || !user) return <PageLoader />;

  const row = "group flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left shadow-[var(--shadow-card)] transition duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-[var(--shadow-lift)] active:translate-y-0";

  return (
    <AuthLayout>
      <h1 className="text-3xl font-bold tracking-tight">Choose a school</h1>
      <p className="mt-2 text-soft">Hi {user.name.split(" ")[0]}. You can switch schools at any time from the menu.</p>
      <ul className="stagger mt-6 space-y-3">
        {user.is_platform_owner && (
          <li>
            <Link href="/platform" className={row}>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand"><LayoutDashboard className="size-5" aria-hidden /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Platform</span>
                <span className="block text-sm text-soft">Onboard and manage schools</span>
              </span>
              <ChevronRight className="size-5 text-soft transition group-hover:translate-x-0.5 group-hover:text-brand" aria-hidden />
            </Link>
          </li>
        )}
        {memberships.map((m) => (
          <li key={m.school.id}>
            <button
              className={row}
              onClick={() => {
                chooseSchool(m.school.subdomain);
                router.push("/app");
              }}
            >
              <Avatar name={m.school.name} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{m.school.name}</span>
                <span className="mt-1 flex flex-wrap gap-1">
                  {m.roles.map((r) => <Badge key={r} tone="info">{ROLE_LABELS[r]}</Badge>)}
                  {m.school.status === "suspended" && <Badge tone="warn">Read-only</Badge>}
                </span>
              </span>
              <ChevronRight className="size-5 text-soft transition group-hover:translate-x-0.5 group-hover:text-brand" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {memberships.length === 0 && !user.is_platform_owner && (
        <p className="mt-6 rounded-xl bg-muted p-4 text-sm text-soft">Your login is not linked to a school yet. Ask your school office to add you.</p>
      )}
      <Button variant="ghost" className="mt-6" onClick={() => signOut().then(() => router.replace("/login"))}>
        <LogOut aria-hidden /> Sign out
      </Button>
    </AuthLayout>
  );
}
