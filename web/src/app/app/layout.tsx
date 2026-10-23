"use client";

import { ShieldOff } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { TeacherAttendanceBar } from "@/components/AdminReminders";
import { AppShell } from "@/components/AppShell";
import { Alert, ButtonLink, Empty, PageLoader } from "@/components/ui";
import { Role } from "@/lib/api";
import { ChildrenProvider } from "@/lib/children";
import { rolesFor, schoolNav, schoolTabs } from "@/lib/nav";
import { ROLE_LABELS, useSession } from "@/lib/session";

const SHORT_LABELS: Record<Role, string> = { admin: "Admin", teacher: "Teacher", student: "Student", parent: "Parent" };

export default function SchoolLayout({ children }: { children: React.ReactNode }) {
  const { ready, user, school, roles, portal, setPortal, memberships, signOut } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace("/login");
    else if (!school) router.replace("/choose-school");
  }, [ready, user, school, router]);

  // A page that belongs to another of the person's portals (say, a link to
  // Fees while in the teacher portal) switches to that portal.
  const allowed = rolesFor(pathname);
  const otherPortal = allowed && portal && !allowed.includes(portal) ? roles.find((r) => allowed.includes(r)) : undefined;
  useEffect(() => {
    if (otherPortal) setPortal(otherPortal);
  }, [otherPortal, setPortal]);

  if (!ready || !user || !school || !portal) return <PageLoader />;

  const canSwitch = memberships.length > 1 || user.is_platform_owner;
  const blocked = allowed && !roles.some((r) => allowed.includes(r));

  return (
    <ChildrenProvider>
      <AppShell
        brand={{ title: school.school.name, subtitle: `${ROLE_LABELS[portal]} portal` }}
        groups={schoolNav([portal])}
        tabs={schoolTabs([portal])}
        portal={{ value: portal, options: roles.map((r) => ({ key: r, label: SHORT_LABELS[r] })), onChange: (r) => setPortal(r as Role) }}
        user={{ name: user.name, detail: user.email ?? user.phone ?? "" }}
        switchHref={canSwitch ? "/choose-school" : undefined}
        onSignOut={() => signOut().then(() => router.replace("/login"))}
        banner={school.school.status === "suspended" ? (
          <div className="mb-5"><Alert tone="warn" title="This school is suspended">You can look around, but changes are switched off.</Alert></div>
        ) : portal === "admin" && pathname !== "/app/attendance" && pathname !== "/app" ? <TeacherAttendanceBar /> : undefined}
      >
        {blocked ? (
          <Empty icon={<ShieldOff aria-hidden />} title="This section isn't part of your portal" action={<ButtonLink href="/app">Go to Home</ButtonLink>}>
            {`It is for ${allowed.map((r) => ROLE_LABELS[r].toLowerCase()).join(", ")} accounts. Ask your school office if you need access.`}
          </Empty>
        ) : children}
      </AppShell>
    </ChildrenProvider>
  );
}
