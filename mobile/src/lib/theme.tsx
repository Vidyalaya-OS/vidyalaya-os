import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";

// The same palette as the web app (web/src/app/globals.css), as plain values.

export type ThemeChoice = "system" | "light" | "dark";

const LIGHT = {
  background: "#f4f6fb",
  surface: "#ffffff",
  muted: "#eef2f8",
  line: "#e1e6ef",
  ink: "#111827",
  soft: "#556070",
  brand: "#2f5bea",
  brandDark: "#2347c5",
  brandSoft: "#e9eefe",
  onBrand: "#ffffff",
  ring: "rgba(47,91,234,0.35)",
  shadow: "#1f2a44",
  overlay: "rgba(2,6,23,0.45)",
};

const DARK: typeof LIGHT = {
  background: "#0b1018",
  surface: "#131a25",
  muted: "#1c2533",
  line: "#273243",
  ink: "#e9eef5",
  soft: "#9ba7b8",
  brand: "#6b93ff",
  brandDark: "#8eadff",
  brandSoft: "#1b2645",
  onBrand: "#0b1222",
  ring: "rgba(107,147,255,0.45)",
  shadow: "#000000",
  overlay: "rgba(0,0,0,0.6)",
};

export type Palette = typeof LIGHT;
export type Tone = "neutral" | "good" | "warn" | "bad" | "info";

/** Status colours: a soft background with dark text (light) or the reverse (dark),
 * plus the solid colour used for dots, bars and chart parts. */
function tones(dark: boolean, c: Palette) {
  return {
    neutral: { bg: c.muted, fg: c.soft, solid: "#94a3b8", border: c.line },
    good: dark ? { bg: "#052e16", fg: "#86efac", solid: "#16a34a", border: "#14532d" } : { bg: "#dcfce7", fg: "#166534", solid: "#16a34a", border: "#bbf7d0" },
    warn: dark ? { bg: "#451a03", fg: "#fcd34d", solid: "#f59e0b", border: "#78350f" } : { bg: "#fef3c7", fg: "#92400e", solid: "#f59e0b", border: "#fde68a" },
    bad: dark ? { bg: "#450a0a", fg: "#fca5a5", solid: "#dc2626", border: "#7f1d1d" } : { bg: "#fee2e2", fg: "#991b1b", solid: "#dc2626", border: "#fecaca" },
    info: { bg: c.brandSoft, fg: c.brand, solid: c.brand, border: dark ? "#2a3c6b" : "#c7d4fb" },
  } satisfies Record<Tone, { bg: string; fg: string; solid: string; border: string }>;
}

/** Subject and avatar colours, matching the web's hues. */
const HUES_LIGHT = [
  { bg: "#dbeafe", fg: "#1d4ed8", bar: "#3b82f6", tint: "#eff6ff" },
  { bg: "#ede9fe", fg: "#6d28d9", bar: "#8b5cf6", tint: "#f5f3ff" },
  { bg: "#d1fae5", fg: "#047857", bar: "#10b981", tint: "#ecfdf5" },
  { bg: "#fef3c7", fg: "#b45309", bar: "#f59e0b", tint: "#fffbeb" },
  { bg: "#ffe4e6", fg: "#be123c", bar: "#f43f5e", tint: "#fff1f2" },
  { bg: "#cffafe", fg: "#0e7490", bar: "#06b6d4", tint: "#ecfeff" },
  { bg: "#fae8ff", fg: "#a21caf", bar: "#d946ef", tint: "#fdf4ff" },
  { bg: "#ecfccb", fg: "#4d7c0f", bar: "#84cc16", tint: "#f7fee7" },
];
const HUES_DARK = [
  { bg: "#172554", fg: "#93c5fd", bar: "#3b82f6", tint: "#111c3a" },
  { bg: "#2e1065", fg: "#c4b5fd", bar: "#8b5cf6", tint: "#1e1438" },
  { bg: "#022c22", fg: "#6ee7b7", bar: "#10b981", tint: "#0b231c" },
  { bg: "#451a03", fg: "#fcd34d", bar: "#f59e0b", tint: "#2a1a09" },
  { bg: "#4c0519", fg: "#fda4af", bar: "#f43f5e", tint: "#2a0c16" },
  { bg: "#083344", fg: "#67e8f9", bar: "#06b6d4", tint: "#0a2430" },
  { bg: "#4a044e", fg: "#f0abfc", bar: "#d946ef", tint: "#2a0b2e" },
  { bg: "#1a2e05", fg: "#bef264", bar: "#84cc16", tint: "#15200a" },
];

export const FONTS = {
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
  extrabold: "PlusJakartaSans_800ExtraBold",
} as const;

export type Theme = {
  dark: boolean;
  c: Palette;
  tone: ReturnType<typeof tones>;
  hues: typeof HUES_LIGHT;
  choice: ThemeChoice;
  setChoice: (c: ThemeChoice) => void;
  /** Card shadow, like the web's --shadow-card. */
  card: object;
  lift: object;
};

const KEY = "vidyalaya.theme";
const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [choice, setChoiceState] = useState<ThemeChoice>("system");

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => {
      if (v === "light" || v === "dark") setChoiceState(v);
    }).catch(() => {});
  }, []);

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    (next === "system" ? AsyncStorage.removeItem(KEY) : AsyncStorage.setItem(KEY, next)).catch(() => {});
  }, []);

  const value = useMemo<Theme>(() => {
    const dark = choice === "dark" || (choice === "system" && system === "dark");
    const c = dark ? DARK : LIGHT;
    return {
      dark,
      c,
      tone: tones(dark, c),
      hues: dark ? HUES_DARK : HUES_LIGHT,
      choice,
      setChoice,
      card: { shadowColor: c.shadow, shadowOpacity: dark ? 0.35 : 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
      lift: { shadowColor: c.shadow, shadowOpacity: dark ? 0.5 : 0.16, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
    };
  }, [choice, system, setChoice]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}

export function hashIndex(text: string, n: number) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h % n;
}
