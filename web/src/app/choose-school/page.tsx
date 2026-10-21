"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Badge, Button, Loading } from "@/components/ui";
import { ROLE_LABELS, useSession } from "@/lib/session";

export default function ChooseSchool() {
  const { ready, user, memberships, chooseSchool, signOut } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  if (!ready || !user) return <Loading />;

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-2xl font-semibold">Choose a school</h1>
      <p className="mt-1 text-sm text-soft">You can switch schools at any time from the menu.</p>
      <ul className="mt-6 space-y-3">
        {user.is_platform_owner && (
          <li>
            <Link href="/platform" className="block rounded-xl border border-line bg-surface p-4 hover:bg-muted">
              <div className="font-medium">Platform</div>
              <div className="text-sm text-soft">Onboard and manage schools</div>
            </Link>
          </li>
        )}
        {memberships.map((m) => (
          <li key={m.school.id}>
            <button
              className="block w-full rounded-xl border border-line bg-surface p-4 text-left hover:bg-muted"
              onClick={() => {
                chooseSchool(m.school.subdomain);
                router.push("/app");
              }}
            >
              <div className="font-medium">{m.school.name}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {m.roles.map((r) => (
                  <Badge key={r}>{ROLE_LABELS[r]}</Badge>
                ))}
                {m.school.status === "suspended" && <Badge tone="warn">Read-only</Badge>}
              </div>
            </button>
          </li>
        ))}
      </ul>
      <Button variant="ghost" className="mt-6" onClick={() => signOut().then(() => router.replace("/login"))}>
        Sign out
      </Button>
    </main>
  );
}
