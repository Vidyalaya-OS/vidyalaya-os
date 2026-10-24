import AsyncStorage from "@react-native-async-storage/async-storage";
import { usePathname } from "expo-router";
import { ArrowRight, ChevronDown, GraduationCap, ShieldAlert } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { ADMIN_GUIDES } from "@/lib/guides";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { Enter, Grid, Press, Row, Txt, go, useLayout } from "./ui";

const KEY = "vidyalaya.guides.hidden";

/** The explainer under an admin section's title: what it is for, how to use
 * it, the rule to know and where to go next. Can be folded away. */
export function SectionGuide() {
  const pathname = usePathname();
  const { portal } = useSession();
  const { c, card, dark } = useTheme();
  const { md } = useLayout();
  const guide = portal === "admin" ? ADMIN_GUIDES[pathname] : undefined;
  const [hidden, setHidden] = useState<string[] | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => setHidden(v ? JSON.parse(v) : [])).catch(() => setHidden([]));
  }, []);

  if (!guide || hidden === null) return null;
  const folded = hidden.includes(pathname);
  const toggle = () => {
    const next = folded ? hidden.filter((p) => p !== pathname) : [...hidden, pathname];
    setHidden(next);
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  };
  const IconC = guide.icon;
  const hue = (l: number, s = 80) => `hsl(${guide.hue}, ${s}%, ${l}%)`;

  if (folded) {
    return (
      <Enter style={{ marginTop: 16, alignSelf: "flex-start" }}>
        <Press onPress={toggle} style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 36, borderRadius: 999, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, paddingHorizontal: 12 }}>
          <GraduationCap size={16} color={c.soft} />
          <Txt size="sm" weight="medium" soft>How this section works</Txt>
          <ChevronDown size={16} color={c.soft} />
        </Press>
      </Enter>
    );
  }

  return (
    <Enter style={{ marginTop: 16 }}>
      <View style={[{ borderRadius: 18, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, overflow: "hidden" }, card]}>
        <View style={{ position: "absolute", top: -60, right: -40, width: 200, height: 200, borderRadius: 100, backgroundColor: hue(dark ? 30 : 60, 90), opacity: dark ? 0.25 : 0.18 }} />
        <View style={{ padding: md ? 18 : 14 }}>
          <Row justify="space-between" align="flex-start" gap={10}>
            <Row gap={10} style={{ flex: 1 }}>
              <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: hue(52), alignItems: "center", justifyContent: "center" }}><IconC size={18} color="#fff" /></View>
              <View style={{ flex: 1 }}>
                <Txt size="xxs" weight="semibold" soft upper>How this section works</Txt>
                <Txt weight="semibold">{guide.title}</Txt>
              </View>
            </Row>
            <Pressable onPress={toggle} hitSlop={8} style={{ paddingHorizontal: 6, paddingVertical: 4 }}><Txt size="sm" weight="medium" soft>Hide</Txt></Pressable>
          </Row>
          <Txt size="sm" soft style={{ marginTop: 8 }}>{guide.purpose}</Txt>
          <Grid cols={{ base: 1, lg: 2 }} gap={8} style={{ marginTop: 10 }}>
            {guide.steps.map((s, i) => (
              <Enter key={s} delay={i * 90}>
                <Row gap={10} align="flex-start">
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: hue(52), alignItems: "center", justifyContent: "center", marginTop: 1 }}><Txt size="xxs" weight="bold" color="#fff">{i + 1}</Txt></View>
                  <Txt size="sm" style={{ flex: 1 }}>{s}</Txt>
                </Row>
              </Enter>
            ))}
          </Grid>
          {guide.rule && (
            <Row gap={8} align="flex-start" style={{ marginTop: 12, borderRadius: 12, backgroundColor: c.muted, paddingHorizontal: 12, paddingVertical: 8 }}>
              <ShieldAlert size={16} color="#d97706" style={{ marginTop: 1 }} />
              <Txt size="xs" style={{ flex: 1 }}>{guide.rule}</Txt>
            </Row>
          )}
          <Pressable onPress={() => go(guide.next.href)} style={{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-end", paddingVertical: 6 }}>
            <Txt size="sm" weight="semibold" color={c.brand}>Next: {guide.next.label}</Txt>
            <ArrowRight size={16} color={c.brand} />
          </Pressable>
        </View>
      </View>
    </Enter>
  );
}
