import { router } from "expo-router";
import { ArrowRight, Check, ChevronDown, LogIn, Mail, Play, Sparkles } from "lucide-react-native";
import { useRef, useState } from "react";
import { Animated, Easing, LayoutAnimation, Linking, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { CONTACT, contactLinks } from "@/lib/contact";
import { useTheme } from "@/lib/theme";
import { ThemeButton } from "../AppShell";
import { Aurora, FloatingLogo, Logo } from "../brand";
import { ContactDetails } from "../ContactDetails";
import { Button, Enter, Grid, Press, Row, Stack, Txt, useLayout } from "../ui";
import { FAQ, FEATURES, ROLES, RoleKey, STEPS, TRUST } from "./content";
import { Float, Gradient, Reveal, SectionTitle, useScrollWatch } from "./parts";
import { PromoVideo } from "./PromoVideo";

type SectionKey = "video" | "roles" | "how" | "features" | "faq" | "contact";

/** The public front page, the same as the web's: what the system is, and
 * what it means for each kind of person who uses it. */
export function Landing() {
  const { c } = useTheme();
  const { md } = useLayout();
  const insets = useSafeAreaInsets();
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const offsets = useRef<Partial<Record<SectionKey, number>>>({});
  const [scrolled, setScrolled] = useState(false);
  const watch = useScrollWatch();
  const pad = md ? 32 : 18;
  const barHeight = insets.top + 60;

  const jump = (key: SectionKey | "top") => {
    if (key === "top") return scroll.current?.scrollTo({ y: 0, animated: true });
    const y = offsets.current[key];
    if (y != null) scroll.current?.scrollTo({ y: Math.max(0, y - barHeight + 8), animated: true });
  };
  const mark = (key: SectionKey) => (e: { nativeEvent: { layout: { y: number } } }) => {
    offsets.current[key] = e.nativeEvent.layout.y;
  };
  const signIn = () => router.push("/login");

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <watch.Provider value={watch.value}>
        <ScrollView
          ref={scroll}
          scrollEventThrottle={32}
          onScroll={(e) => {
            const y = e.nativeEvent.contentOffset.y;
            if (y > 8 !== scrolled) setScrolled(y > 8);
            watch.onScroll();
          }}
          contentContainerStyle={{ paddingTop: barHeight, paddingBottom: insets.bottom }}
        >
          <Hero pad={pad} onSignIn={signIn} onRoles={() => jump("roles")} onVideo={() => jump("video")} />
          <Section pad={pad} onLayout={mark("video")}>
            <PromoVideo />
          </Section>
          <Section pad={pad} onLayout={mark("roles")} band>
            <RoleExplorer />
          </Section>
          <Section pad={pad} onLayout={mark("how")}>
            <HowItWorks />
          </Section>
          <Section pad={pad} onLayout={mark("features")} band>
            <Features />
          </Section>
          <Section pad={pad}>
            <Trust />
          </Section>
          <Section pad={pad} onLayout={mark("faq")} top={0}>
            <Faq />
          </Section>
          <Section pad={pad} onLayout={mark("contact")} band>
            <Contact />
          </Section>
          <Footer pad={pad} onSignIn={signIn} />
        </ScrollView>
      </watch.Provider>
      <TopBar height={barHeight} scrolled={scrolled} onSignIn={signIn} onJump={jump} />
    </View>
  );
}

function Section({ children, pad, band, onLayout, top = 56 }: { children: React.ReactNode; pad: number; band?: boolean; onLayout?: (e: { nativeEvent: { layout: { y: number } } }) => void; top?: number }) {
  const { c } = useTheme();
  return (
    <View onLayout={onLayout} style={[{ paddingTop: top, paddingBottom: 56, paddingHorizontal: pad }, band && { backgroundColor: c.surface, borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.line }]}>
      <View style={{ width: "100%", maxWidth: 1100, alignSelf: "center" }}>{children}</View>
    </View>
  );
}

const NAV: [SectionKey, string][] = [["video", "Video"], ["roles", "Who it's for"], ["how", "How it works"], ["features", "Features"], ["faq", "Questions"], ["contact", "Contact"]];

function TopBar({ height, scrolled, onSignIn, onJump }: { height: number; scrolled: boolean; onSignIn: () => void; onJump: (k: SectionKey | "top") => void }) {
  const { c, dark } = useTheme();
  const { lg } = useLayout();
  const insets = useSafeAreaInsets();
  return (
    <View style={{
      position: "absolute", top: 0, left: 0, right: 0, height, paddingTop: insets.top, paddingHorizontal: 14,
      flexDirection: "row", alignItems: "center", gap: 8,
      backgroundColor: scrolled ? (dark ? "rgba(19,26,37,0.94)" : "rgba(255,255,255,0.94)") : c.background,
      borderBottomWidth: 1, borderBottomColor: scrolled ? c.line : "transparent",
    }}>
      <Pressable onPress={() => onJump("top")} accessibilityLabel="Vidyalaya OS, back to top" hitSlop={4} style={{ flexShrink: 1 }}>
        <Logo subtitle={false} size={34} />
      </Pressable>
      {lg && (
        <Row gap={2} style={{ marginLeft: 16 }}>
          {NAV.map(([key, label]) => (
            <Pressable key={key} onPress={() => onJump(key)} style={({ pressed }) => ({ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: pressed ? c.muted : "transparent" })}>
              <Txt size="sm" weight="medium" soft>{label}</Txt>
            </Pressable>
          ))}
        </Row>
      )}
      <View style={{ flex: 1 }} />
      <ThemeButton />
      <Button size="sm" icon={LogIn} onPress={onSignIn}>Sign in</Button>
    </View>
  );
}

/* --------------------------------------------------------------------- hero */

const FLOATERS = [
  { text: "Attendance marked · 32 of 34 present", dot: "#22c55e", pos: { left: 0, top: "6%" }, delay: 0 },
  { text: "Fee received · ₹12,000", dot: "#2f5bea", pos: { right: 0, top: "40%" }, delay: 1000 },
  { text: "Maths quiz · 9 / 10", dot: "#f59e0b", pos: { left: "6%", bottom: "8%" }, delay: 2000 },
] as const;

function Hero({ pad, onSignIn, onRoles, onVideo }: { pad: number; onSignIn: () => void; onRoles: () => void; onVideo: () => void }) {
  const { c, dark, card, lift } = useTheme();
  const { md, width } = useLayout();
  const art = Math.min(md ? 420 : width - pad * 2, 420);

  const words = (
    <Enter>
      <View style={[{ flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", borderRadius: 999, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, paddingHorizontal: 12, paddingVertical: 5 }, card]}>
        <Sparkles size={14} color={c.brand} />
        <Txt size="xs" weight="semibold" soft>Vidyalaya OS · the school operating system</Txt>
      </View>
      <Txt weight="extrabold" style={{ marginTop: 20, fontSize: md ? 52 : 38, lineHeight: md ? 58 : 43, letterSpacing: -1 }}>
        One calm place for your{" "}
        <Txt weight="extrabold" color={dark ? "#8eadff" : "#2f5bea"} style={{ fontSize: md ? 52 : 38, lineHeight: md ? 58 : 43 }}>whole </Txt>
        <Txt weight="extrabold" color={dark ? "#b49cff" : "#7c4ddb"} style={{ fontSize: md ? 52 : 38, lineHeight: md ? 58 : 43 }}>school</Txt>
      </Txt>
      <Txt size="lg" soft style={{ marginTop: 18, maxWidth: 560 }}>
        Timetables, attendance, homework, quizzes, report cards and fees, shared between the school office, teachers, students and parents.
        Everyone signs in to the same app and sees the part that is meant for them.
      </Txt>
      <Row gap={10} wrap style={{ marginTop: 26 }}>
        <Button size="lg" iconRight={ArrowRight} onPress={onSignIn}>Sign in</Button>
        <Button size="lg" variant="secondary" iconRight={ChevronDown} onPress={onRoles}>What it does for me</Button>
        <Press onPress={onVideo} style={{ minHeight: 52, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, borderRadius: 12 }}>
          <Play size={16} color={c.brand} fill={c.brand} />
          <Txt weight="semibold" color={c.brand}>Watch the video</Txt>
        </Press>
      </Row>
      <View style={{ marginTop: 24, flexDirection: "row", flexWrap: "wrap", columnGap: 20, rowGap: 8 }}>
        {["Works on phones and computers", "Light and dark mode", "Each school's data kept private"].map((t) => (
          <Row key={t} gap={6}><Check size={16} color="#16a34a" /><Txt size="sm" soft>{t}</Txt></Row>
        ))}
      </View>
    </Enter>
  );

  const picture = (
    <Enter delay={120} style={{ width: art, height: art, alignSelf: "center", alignItems: "center", justifyContent: "center", marginTop: md ? 0 : 28 }}>
      <Svg pointerEvents="none" style={{ position: "absolute", top: 0, left: 0 }} width={art} height={art}>
        <Defs>
          <RadialGradient id="hero-glow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#7c4ddb" stopOpacity={dark ? 0.4 : 0.25} />
            <Stop offset="0.55" stopColor="#2f5bea" stopOpacity={dark ? 0.18 : 0.12} />
            <Stop offset="1" stopColor="#0ea5e9" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={art} height={art} fill="url(#hero-glow)" />
      </Svg>
      <FloatingLogo size={art * 0.62} />
      {FLOATERS.map((f) => (
        <Float key={f.text} offset={f.delay} style={[{ position: "absolute" }, f.pos as object]}>
          <View style={[{ flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 16, borderWidth: 1, borderColor: c.line, backgroundColor: dark ? "rgba(19,26,37,0.94)" : "rgba(255,255,255,0.94)", paddingHorizontal: 12, paddingVertical: 8 }, lift]}>
            <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: f.dot }} />
            <Txt size="xs" weight="medium">{f.text}</Txt>
          </View>
        </Float>
      ))}
    </Enter>
  );

  return (
    <View style={{ paddingHorizontal: pad, paddingTop: 20, paddingBottom: 40 }}>
      {/* The soft brand glow behind the top of the page. */}
      <Svg pointerEvents="none" style={{ position: "absolute", top: -60, left: 0 }} width={width} height={560}>
        <Defs>
          <RadialGradient id="hero-wash" cx="72%" cy="30%" r="60%">
            <Stop offset="0" stopColor={c.brandSoft} stopOpacity={1} />
            <Stop offset="1" stopColor={c.background} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={560} fill="url(#hero-wash)" />
      </Svg>
      <View style={{ width: "100%", maxWidth: 1100, alignSelf: "center" }}>
        {md ? <Row gap={32} align="center"><View style={{ flex: 1.1 }}>{words}</View><View style={{ flex: 1 }}>{picture}</View></Row> : <>{words}{picture}</>}
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------- roles */

function RoleExplorer() {
  const { c, tone, lift } = useTheme();
  const { md } = useLayout();
  const [role, setRole] = useState<RoleKey>("owner");
  const r = ROLES.find((x) => x.key === role) ?? ROLES[0];
  const Icon = r.icon;

  const toneColor = (t?: "good" | "warn" | "bad") => (t === "good" ? tone.good.solid : t === "warn" ? tone.warn.solid : t === "bad" ? tone.bad.solid : c.ink);

  const story = (
    <View style={{ flex: md ? 1.2 : undefined }}>
      <Row gap={12} align="center">
        <Gradient colors={r.accent} style={{ width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" }}>
          <Icon size={24} color="#fff" />
        </Gradient>
        <View style={{ flex: 1 }}>
          <Txt size="sm" weight="semibold" soft>{r.label} portal</Txt>
          <Txt size="xl" weight="bold" style={{ letterSpacing: -0.3 }}>{r.tagline}</Txt>
        </View>
      </Row>
      <Txt size="lg" soft style={{ marginTop: 16, lineHeight: 27 }}>{r.meaning}</Txt>
      <Grid cols={{ base: 1, sm: 2 }} gap={10} style={{ marginTop: 18 }}>
        {r.can.map((x, i) => {
          const CIcon = x.icon;
          return (
            <Enter key={x.title} delay={i * 50} style={{ flexGrow: 1 }}>
              <View style={{ flexGrow: 1, borderRadius: 18, borderWidth: 1, borderColor: c.line, backgroundColor: c.background + "99", padding: 14 }}>
                <CIcon size={20} color={c.brand} />
                <Txt weight="semibold" style={{ marginTop: 8 }}>{x.title}</Txt>
                <Txt size="sm" soft style={{ marginTop: 2 }}>{x.text}</Txt>
              </View>
            </Enter>
          );
        })}
      </Grid>
      <View style={{ marginTop: 18, borderRadius: 18, backgroundColor: c.brandSoft, paddingHorizontal: 14, paddingVertical: 12 }}>
        <Txt size="sm"><Txt size="sm" weight="bold">How you sign in: </Txt>{r.signIn}</Txt>
      </View>
    </View>
  );

  const side = (
    <Stack gap={16} style={{ flex: md ? 1 : undefined, marginTop: md ? 0 : 24 }}>
      <View style={[{ borderRadius: 24, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, overflow: "hidden" }, lift]}>
        <Gradient colors={r.accent} horizontal style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 12 }}>
          {[0.6, 0.4, 0.3].map((o) => <View key={o} style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: `rgba(255,255,255,${o})` }} />)}
          <Txt size="sm" weight="semibold" color="#fff" style={{ marginLeft: 8 }}>{r.preview.title}</Txt>
        </Gradient>
        {r.preview.rows.map((row, i) => (
          <Row key={row.label} justify="space-between" style={{ paddingHorizontal: 18, paddingVertical: 13, borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
            <Txt size="sm" soft>{row.label}</Txt>
            <Txt size="sm" weight="bold" tabular color={toneColor(row.tone)}>{row.value}</Txt>
          </Row>
        ))}
      </View>
      <View style={{ borderRadius: 24, borderWidth: 1, borderColor: c.line, padding: 18 }}>
        <Txt size="xs" weight="semibold" upper soft>A day with Vidyalaya OS</Txt>
        <Stack gap={16} style={{ marginTop: 14 }}>
          {r.day.map((d, i) => (
            <Row key={d.time} gap={14} align="flex-start">
              {i < r.day.length - 1 && <View style={{ position: "absolute", left: 17, top: 38, bottom: -14, width: 1, backgroundColor: c.line }} />}
              <Gradient colors={r.accent} style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" }}>
                <Txt size="xxs" weight="bold" color="#fff">{i + 1}</Txt>
              </Gradient>
              <View style={{ flex: 1 }}>
                <Txt size="xs" weight="semibold" soft>{d.time}</Txt>
                <Txt size="sm">{d.text}</Txt>
              </View>
            </Row>
          ))}
        </Stack>
      </View>
    </Stack>
  );

  return (
    <View>
      <Reveal>
        <SectionTitle center eyebrow="Who it's for" title="Choose who you are" intro="The same system looks different for each person. Pick your role to see what your portal does for you." />
      </Reveal>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 24, marginHorizontal: -18 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 18, flexGrow: 1, justifyContent: "center" }}>
        {ROLES.map((x) => {
          const XIcon = x.icon;
          const on = x.key === role;
          return (
            <Press key={x.key} onPress={() => setRole(x.key)} accessibilityRole="tab" accessibilityState={{ selected: on }}
              style={[{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 8, paddingRight: 14, borderRadius: 999, borderWidth: 1, borderColor: on ? "transparent" : c.line, backgroundColor: on ? c.ink : c.surface }, on && lift]}>
              <Gradient colors={x.accent} style={{ width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" }}>
                <XIcon size={14} color="#fff" />
              </Gradient>
              <Txt size="sm" weight="semibold" color={on ? c.surface : c.soft}>{x.label}</Txt>
            </Press>
          );
        })}
      </ScrollView>
      <Enter key={r.key} style={{ marginTop: 28 }}>
        {md ? <Row gap={28} align="flex-start">{story}{side}</Row> : <>{story}{side}</>}
      </Enter>
    </View>
  );
}

/* ------------------------------------------------------------ how and what */

function HowItWorks() {
  const { c, card } = useTheme();
  return (
    <View>
      <Reveal>
        <SectionTitle eyebrow="How it works" title="From a new school to a busy Monday, in four steps" />
      </Reveal>
      <Grid cols={{ base: 1, sm: 2, lg: 4 }} gap={12} style={{ marginTop: 24 }}>
        {STEPS.map((s, i) => {
          const SIcon = s.icon;
          return (
            <Reveal key={s.title} delay={(i % 2) * 90} style={{ flexGrow: 1 }}>
              <View style={[{ flexGrow: 1, borderRadius: 24, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, padding: 18 }, card]}>
                <Txt weight="extrabold" color={c.brand + "30"} style={{ fontSize: 46, lineHeight: 50 }}>{i + 1}</Txt>
                <View style={{ position: "absolute", right: 18, top: 18 }}><SIcon size={22} color={c.brand} /></View>
                <Txt weight="semibold" style={{ marginTop: 4 }}>{s.title}</Txt>
                <Txt size="sm" soft style={{ marginTop: 2 }}>{s.text}</Txt>
              </View>
            </Reveal>
          );
        })}
      </Grid>
    </View>
  );
}

function Features() {
  const { c } = useTheme();
  return (
    <View>
      <Reveal>
        <SectionTitle center eyebrow="Features" title="Everything a school day needs" />
      </Reveal>
      <Grid cols={{ base: 2, lg: 4 }} gap={10} style={{ marginTop: 24 }}>
        {FEATURES.map((f, i) => {
          const FIcon = f.icon;
          return (
            <Reveal key={f.title} delay={(i % 2) * 70} style={{ flexGrow: 1 }}>
              <View style={{ flexGrow: 1, borderRadius: 22, borderWidth: 1, borderColor: c.line, backgroundColor: c.background + "99", padding: 14 }}>
                <Gradient colors={["#2f5bea", "#8b5cf6"]} style={{ width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center" }}>
                  <FIcon size={20} color="#fff" />
                </Gradient>
                <Txt weight="semibold" style={{ marginTop: 12 }}>{f.title}</Txt>
                <Txt size="xs" soft style={{ marginTop: 2 }}>{f.text}</Txt>
              </View>
            </Reveal>
          );
        })}
      </Grid>
    </View>
  );
}

function Trust() {
  const { md } = useLayout();
  return (
    <Reveal>
      <Aurora radius={28} style={{ padding: md ? 40 : 24 }}>
        <Txt size="3xl" weight="bold" color="#fff" style={{ letterSpacing: -0.5 }}>Private by design</Txt>
        <Grid cols={{ base: 1, md: 3 }} gap={20} style={{ marginTop: 22 }}>
          {TRUST.map((t) => {
            const TIcon = t.icon;
            return (
              <View key={t.title}>
                <View style={{ width: 44, height: 44, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" }}>
                  <TIcon size={20} color="#fff" />
                </View>
                <Txt weight="semibold" color="#fff" style={{ marginTop: 10 }}>{t.title}</Txt>
                <Txt size="sm" color="rgba(255,255,255,0.8)" style={{ marginTop: 2 }}>{t.text}</Txt>
              </View>
            );
          })}
        </Grid>
      </Aurora>
    </Reveal>
  );
}

/* ------------------------------------------------------------ faq, contact */

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <View style={{ maxWidth: 760, width: "100%", alignSelf: "center" }}>
      <Reveal>
        <SectionTitle center title="Questions people ask" />
      </Reveal>
      <Stack gap={10} style={{ marginTop: 22 }}>
        {FAQ.map((f, i) => (
          <Reveal key={f.q} delay={i * 50}>
            <FaqItem q={f.q} a={f.a} open={open === i} onToggle={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setOpen(open === i ? null : i);
            }} />
          </Reveal>
        ))}
      </Stack>
    </View>
  );
}

function FaqItem({ q, a, open, onToggle }: { q: string; a: string; open: boolean; onToggle: () => void }) {
  const { c, card } = useTheme();
  const turn = useRef(new Animated.Value(open ? 1 : 0)).current;
  const toggle = () => {
    Animated.timing(turn, { toValue: open ? 0 : 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    onToggle();
  };
  return (
    <Pressable onPress={toggle} accessibilityRole="button" accessibilityState={{ expanded: open }}
      style={[{ borderRadius: 20, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, padding: 16 }, open && card]}>
      <Row gap={12} justify="space-between" align="flex-start">
        <Txt weight="semibold" style={{ flex: 1 }}>{q}</Txt>
        <Animated.View style={{ transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] }) }] }}>
          <ChevronDown size={20} color={c.soft} />
        </Animated.View>
      </Row>
      {open && <Txt soft style={{ marginTop: 10 }}>{a}</Txt>}
    </Pressable>
  );
}

function Contact() {
  return (
    <View>
      <Reveal>
        <SectionTitle center eyebrow="Contact" title="Talk to us" intro={`Want Vidyalaya OS for your school, or have a question? Write or call, and ${CONTACT.productOwner} will get back to you.`} />
      </Reveal>
      <Reveal delay={80} style={{ marginTop: 24 }}>
        <ContactDetails />
      </Reveal>
      <View style={{ marginTop: 22, alignItems: "center" }}>
        <Button size="lg" icon={Mail} onPress={() => Linking.openURL(contactLinks.email)}>Email us</Button>
      </View>
    </View>
  );
}

function Footer({ pad, onSignIn }: { pad: number; onSignIn: () => void }) {
  const { c } = useTheme();
  return (
    <View style={{ backgroundColor: c.surface, paddingHorizontal: pad, paddingVertical: 28, alignItems: "center", gap: 14 }}>
      <Logo />
      <Txt size="sm" soft center>For owners, admins, teachers, students and parents.</Txt>
      <Txt size="sm" soft center>
        Product owner: {CONTACT.productOwner} ·{" "}
        <Txt size="sm" color={c.brand} style={{ textDecorationLine: "underline" }} onPress={() => Linking.openURL(contactLinks.email)}>{CONTACT.email}</Txt>
        {" · "}
        <Txt size="sm" color={c.brand} style={{ textDecorationLine: "underline" }} onPress={() => Linking.openURL(contactLinks.phone)}>{CONTACT.phoneLabel}</Txt>
      </Txt>
      <Pressable onPress={onSignIn} hitSlop={8}><Txt weight="semibold" color={c.brand}>Sign in</Txt></Pressable>
    </View>
  );
}
