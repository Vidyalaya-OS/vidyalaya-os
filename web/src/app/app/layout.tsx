"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { Alert, PageLoader } from "@/components/ui";
import { ChildrenProvider } from "@/lib/children";
import { schoolNav, schoolTabs } from "@/lib/nav";
import { ROLE_LABELS, useSession } from "@/lib/session";

export default function SchoolLayout({ children }: { children: React.ReactNode }) {
  const { ready, user, school, roles, memberships, signOut } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace("/login");
    else if (!school) router.replace("/choose-school");
  }, [ready, user, school, router]);

  if (!ready || !user || !school) return <PageLoader />;

  const canSwitch = memberships.length > 1 || user.is_platform_owner;

  return (
    <ChildrenProvider>
      <AppShell
        brand={{ title: school.school.name, subtitle: roles.map((r) => ROLE_LABELS[r]).join(" · ") }}
        groups={schoolNav(roles)}
        tabs={schoolTabs(roles)}
        user={{ name: user.name, detail: user.email ?? user.phone ?? "" }}
        switchHref={canSwitch ? "/choose-school" : undefined}
        onSignOut={() => signOut().then(() => router.replace("/login"))}
        banner={school.school.status === "suspended" ? (
          <div className="mb-5"><Alert tone="warn" title="This school is suspended">You can look around, but changes are switched off.</Alert></div>
        ) : undefined}
      >
        {children}
      </AppShell>
    </ChildrenProvider>
  );
}
