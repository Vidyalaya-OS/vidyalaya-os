import { Redirect, router, Stack } from "expo-router";
import { LogoMark } from "@/components/brand";
import { AppShell } from "@/components/AppShell";
import { PageLoader } from "@/components/ui";
import { platformNav } from "@/lib/nav";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";

export default function PlatformLayout() {
  const { ready, user, signOut, memberships } = useSession();
  const { c } = useTheme();
  if (!ready) return <PageLoader />;
  if (!user) return <Redirect href="/login" />;
  if (!user.is_platform_owner) return <Redirect href="/" />;

  const items = platformNav(memberships.length > 0);
  return (
    <AppShell
      brand={{ title: "Vidyalaya OS", subtitle: "Platform owner", mark: <LogoMark size={36} /> }}
      groups={[{ items }]}
      tabs={items}
      user={{ name: user.name, detail: user.email ?? user.phone ?? "" }}
      onSignOut={() => signOut().then(() => router.replace("/login"))}
    >
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background }, animation: "slide_from_right" }} />
    </AppShell>
  );
}
