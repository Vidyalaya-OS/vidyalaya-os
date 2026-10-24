import { Redirect, router, Stack, usePathname } from "expo-router";
import { ShieldOff } from "lucide-react-native";
import { useEffect } from "react";
import { View } from "react-native";
import { TeacherAttendanceBar } from "@/components/AdminReminders";
import { AppShell } from "@/components/AppShell";
import { Alert, Button, Empty, PageLoader } from "@/components/ui";
import type { Role } from "@/lib/api";
import { ChildrenProvider } from "@/lib/children";
import { rolesFor, schoolNav, schoolTabs } from "@/lib/nav";
import { ROLE_LABELS, SHORT_LABELS, useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";

export default function SchoolLayout() {
  const { ready, user, school, roles, portal, setPortal, memberships, signOut } = useSession();
  const { c } = useTheme();
  const pathname = usePathname();

  // A page that belongs to another of the person's portals (say, a link to
  // Fees while in the teacher portal) switches to that portal.
  const allowed = rolesFor(pathname);
  const otherPortal = allowed && portal && !allowed.includes(portal) ? roles.find((r) => allowed.includes(r)) : undefined;
  useEffect(() => {
    if (otherPortal) setPortal(otherPortal);
  }, [otherPortal, setPortal]);

  if (!ready) return <PageLoader />;
  if (!user) return <Redirect href="/login" />;
  if (!school) return <Redirect href="/choose-school" />;
  if (!portal) return <PageLoader />;

  const canSwitch = memberships.length > 1 || user.is_platform_owner;
  const blocked = allowed && !roles.some((r) => allowed.includes(r));

  return (
    <ChildrenProvider>
      <AppShell
        brand={{ title: school.school.name, subtitle: `${ROLE_LABELS[portal]} portal` }}
        groups={schoolNav([portal])}
        tabs={schoolTabs([portal])}
        portal={{ value: portal, options: roles.map((r) => ({ key: r, label: SHORT_LABELS[r] })), onChange: (r) => { setPortal(r as Role); router.navigate("/app"); } }}
        user={{ name: user.name, detail: user.email ?? user.phone ?? "" }}
        switchHref={canSwitch ? "/choose-school" : undefined}
        onSignOut={() => signOut().then(() => router.replace("/login"))}
        banner={school.school.status === "suspended" ? (
          <Alert tone="warn" title="This school is suspended" style={{ marginBottom: 4 }}>You can look around, but changes are switched off.</Alert>
        ) : portal === "admin" && pathname !== "/app/attendance" && pathname !== "/app" ? <TeacherAttendanceBar /> : undefined}
      >
        {blocked ? (
          <View style={{ flex: 1, padding: 16, justifyContent: "center" }}>
            <Empty icon={ShieldOff} title="This section isn't part of your portal" action={<Button onPress={() => router.navigate("/app")}>Go to Home</Button>}>
              {`It is for ${allowed.map((r) => ROLE_LABELS[r].toLowerCase()).join(", ")} accounts. Ask your school office if you need access.`}
            </Empty>
          </View>
        ) : (
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background }, animation: "slide_from_right" }} />
        )}
      </AppShell>
    </ChildrenProvider>
  );
}
