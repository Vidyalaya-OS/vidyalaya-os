import { Redirect, router } from "expo-router";
import { ChevronRight, LayoutDashboard, LogOut } from "lucide-react-native";
import { View } from "react-native";
import { AuthLayout } from "@/components/AuthLayout";
import { Avatar, Badge, Button, PageLoader, Press, Row, Stagger, Txt } from "@/components/ui";
import { ROLE_LABELS, useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";

export default function ChooseSchool() {
  const { ready, user, memberships, chooseSchool, signOut } = useSession();
  const { c, card } = useTheme();
  if (!ready) return <PageLoader />;
  if (!user) return <Redirect href="/login" />;

  const row = [{ flexDirection: "row" as const, alignItems: "center" as const, gap: 12, borderRadius: 18, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, padding: 14 }, card];

  return (
    <AuthLayout>
      <Txt size="3xl" weight="bold" style={{ letterSpacing: -0.5 }}>Choose a school</Txt>
      <Txt soft style={{ marginTop: 6 }}>Hi {user.name.split(" ")[0]}. You can switch schools at any time from the menu.</Txt>
      <Stagger gap={12} style={{ marginTop: 22 }}>
        {user.is_platform_owner && (
          <Press style={row} onPress={() => router.replace("/platform")} scale={0.98}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.brandSoft, alignItems: "center", justifyContent: "center" }}><LayoutDashboard size={20} color={c.brand} /></View>
            <View style={{ flex: 1 }}>
              <Txt weight="semibold">Platform</Txt>
              <Txt size="sm" soft>Onboard and manage schools</Txt>
            </View>
            <ChevronRight size={20} color={c.soft} />
          </Press>
        )}
        {memberships.map((m) => (
          <Press key={m.school.id} style={row} scale={0.98} onPress={() => { chooseSchool(m.school.subdomain); router.replace("/app"); }}>
            <Avatar name={m.school.name} />
            <View style={{ flex: 1 }}>
              <Txt weight="semibold" numberOfLines={1}>{m.school.name}</Txt>
              <Row wrap gap={4} style={{ marginTop: 4 }}>
                {m.roles.map((r) => <Badge key={r} tone="info">{ROLE_LABELS[r]}</Badge>)}
                {m.school.status === "suspended" && <Badge tone="warn">Read-only</Badge>}
              </Row>
            </View>
            <ChevronRight size={20} color={c.soft} />
          </Press>
        ))}
      </Stagger>
      {memberships.length === 0 && !user.is_platform_owner && (
        <View style={{ marginTop: 22, borderRadius: 14, backgroundColor: c.muted, padding: 14 }}>
          <Txt size="sm" soft>Your login is not linked to a school yet. Ask your school office to add you.</Txt>
        </View>
      )}
      <Button variant="ghost" icon={LogOut} style={{ marginTop: 20 }} onPress={() => signOut().then(() => router.replace("/login"))}>Sign out</Button>
    </AuthLayout>
  );
}
