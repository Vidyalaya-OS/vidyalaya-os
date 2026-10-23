"use client";

import { Building2, CirclePlus, School } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppShell, NavItem } from "@/components/AppShell";
import { PageLoader } from "@/components/ui";
import { useSession } from "@/lib/session";

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { ready, user, signOut, memberships } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user?.is_platform_owner) router.replace("/");
  }, [ready, user, router]);

  if (!ready || !user?.is_platform_owner) return <PageLoader />;

  const items: NavItem[] = [
    { href: "/platform", label: "Schools", icon: Building2, exact: true },
    { href: "/platform/new", label: "Onboard a school", icon: CirclePlus },
    ...(memberships.length > 0 ? [{ href: "/choose-school", label: "My schools", icon: School }] : []),
  ];

  return (
    <AppShell
      brand={{ title: "School platform", subtitle: "Platform owner", initials: "S P" }}
      groups={[{ items }]}
      tabs={items}
      user={{ name: user.name, detail: user.email ?? user.phone ?? "" }}
      onSignOut={() => signOut().then(() => router.replace("/login"))}
    >
      {children}
    </AppShell>
  );
}
