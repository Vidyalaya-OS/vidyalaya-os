import { router } from "expo-router";
import { BookOpen, CalendarDays, ClipboardCheck, Server, Wallet } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useInsets as useSafeAreaInsets } from "@/lib/insets";
import { api, errorMessage } from "@/lib/api";
import { defaultServer, isCustomServer, serverUrl, setServer } from "@/lib/server";
import { useTheme } from "@/lib/theme";
import { ThemeButton } from "./AppShell";
import { Aurora, FloatingLogo, Logo } from "./brand";
import { Alert, Button, Enter, Field, Row, Sheet, Stack, Stagger, Txt, useLayout } from "./ui";

const FEATURES = [
  { icon: ClipboardCheck, text: "Attendance in a few taps, with alerts for low attendance" },
  { icon: BookOpen, text: "Homework, quizzes and report cards in one place" },
  { icon: CalendarDays, text: "Timetables and due dates on a calendar" },
  { icon: Wallet, text: "Fees, receipts and overdue lists for the office" },
];

/** The frame for sign-in screens: a welcome panel beside the form on large
 * tablets, a short welcome band above it on phones. */
export function AuthLayout({ children, server }: { children: React.ReactNode; server?: boolean }) {
  const { c } = useTheme();
  const { lg, md } = useLayout();
  const insets = useSafeAreaInsets();
  // The logo leads back to the landing page.
  const home = () => (router.canGoBack() ? router.back() : router.replace("/"));

  const content = (
    <Enter style={{ width: "100%", maxWidth: 420, alignSelf: "center" }}>
      {children}
      {server && <ServerSetting />}
    </Enter>
  );

  const form = (
    <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 32, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 32 }}>
      {content}
    </ScrollView>
  );

  if (lg) {
    return (
      <View style={{ flex: 1, flexDirection: "row", backgroundColor: c.background }}>
        <Aurora style={{ flex: 1.05, padding: 48, paddingTop: insets.top + 48, justifyContent: "space-between" }}>
          <View style={{ position: "absolute", right: -90, top: -90, width: 380, height: 380, borderRadius: 190, backgroundColor: "rgba(255,255,255,0.08)" }} />
          <View style={{ position: "absolute", left: -60, bottom: -120, width: 440, height: 440, borderRadius: 220, backgroundColor: "rgba(196,181,253,0.16)" }} />
          <Pressable onPress={home} accessibilityRole="link" accessibilityLabel="Vidyalaya OS home" style={{ alignSelf: "flex-start" }}>
            <Logo invert />
          </Pressable>
          <View style={{ position: "absolute", right: 48, top: insets.top + 60, opacity: 0.95 }}><FloatingLogo size={190} /></View>
          <View style={{ maxWidth: 440 }}>
            <Txt size="3xl" weight="bold" color="#fff" style={{ fontSize: 36, lineHeight: 44, letterSpacing: -0.6 }}>Everything your school runs on, in one calm place.</Txt>
            <Txt size="lg" color="rgba(255,255,255,0.8)" style={{ marginTop: 14 }}>For admins, teachers, students and parents, on any phone or computer.</Txt>
            <Stagger gap={14} style={{ marginTop: 36 }}>
              {FEATURES.map(({ icon: IconC, text }) => (
                <Row key={text} gap={12}>
                  <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" }}><IconC size={18} color="#fff" /></View>
                  <Txt color="rgba(255,255,255,0.9)" style={{ flex: 1 }}>{text}</Txt>
                </Row>
              ))}
            </Stagger>
          </View>
          <Txt size="sm" color="rgba(255,255,255,0.6)">Each school&apos;s data is kept private to that school.</Txt>
        </Aurora>
        <View style={{ flex: 1 }}>
          {form}
          <View style={{ position: "absolute", right: 12, top: insets.top + 8, zIndex: 2 }}><ThemeButton /></View>
        </View>
      </View>
    );
  }

  // On phones the welcome band scrolls with the form, so it never covers the
  // heading, and the scroll view makes room for the keyboard itself.
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="interactive"
      contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 32 }}
    >
      <Aurora style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 26, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}>
        <View pointerEvents="none" style={{ position: "absolute", right: -40, top: -50, width: 200, height: 200, borderRadius: 100, backgroundColor: "rgba(255,255,255,0.08)" }} />
        <Row justify="space-between">
          <Pressable onPress={home} accessibilityRole="link" accessibilityLabel="Vidyalaya OS home" hitSlop={6}>
            <Logo invert size={36} subtitle={false} />
          </Pressable>
          <View style={{ backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 12 }}><ThemeButton /></View>
        </Row>
        <Row justify="space-between" align="flex-end" style={{ marginTop: 14 }}>
          <Txt size="sm" color="rgba(255,255,255,0.85)" style={{ flex: 1, paddingRight: 12 }}>Everything your school runs on, in one calm place.</Txt>
          <FloatingLogo size={74} />
        </Row>
      </Aurora>
      <View style={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: md ? 32 : 20, paddingTop: 28 }}>
        {content}
      </View>
    </ScrollView>
  );
}

/** Where the app finds the Django API, changeable from the sign-in screen. */
function ServerSetting() {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(serverUrl());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [current, setCurrent] = useState(serverUrl());

  const test = async (url: string) => {
    setBusy(true);
    setResult(null);
    const before = serverUrl();
    const custom = isCustomServer();
    await setServer(url);
    try {
      await api("config", { auth: false, school: null });
      setResult({ ok: true, text: `Connected to ${serverUrl()}.` });
      setCurrent(serverUrl());
    } catch (e) {
      setResult({ ok: false, text: errorMessage(e) });
      await setServer(custom ? before : null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Pressable onPress={() => { setValue(serverUrl()); setResult(null); setOpen(true); }} style={{ marginTop: 28, flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "center", padding: 8 }} accessibilityRole="button">
        <Server size={14} color={c.soft} />
        <Txt size="xs" soft>Server: {current.replace(/^https?:\/\//, "")}</Txt>
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} title="Server address" description="Where the Vidyalaya OS API runs. While developing, this is your computer's address on the Wi-Fi, port 8000.">
        <Stack gap={14}>
          <Field label="Address" value={value} onChangeText={setValue} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="http://192.168.1.20:8000" hint={`Default: ${defaultServer()}`} />
          {result && <Alert tone={result.ok ? "success" : "error"}>{result.text}</Alert>}
          <Row gap={8} wrap justify="flex-end">
            <Button variant="ghost" onPress={() => { setValue(defaultServer()); test(defaultServer()).then(() => setServer(null)); }}>Use default</Button>
            <Button busy={busy} onPress={() => test(value)}>Save and test</Button>
          </Row>
        </Stack>
      </Sheet>
    </>
  );
}
