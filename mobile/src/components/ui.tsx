import { router, usePathname } from "expo-router";
import { ArrowLeft, Check, ChevronDown, CircleAlert, CircleCheck, Eye, EyeOff, Inbox, Info, RotateCw, WifiOff, X } from "lucide-react-native";
import { Children, createContext, isValidElement, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView,
  StyleProp, Text, TextInput, TextInputProps, TextStyle, View, ViewStyle, useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Icon } from "@/lib/nav";
import { FONTS, Tone, hashIndex, useTheme } from "@/lib/theme";
import { clearApiCache } from "@/lib/useApi";
import { SectionGuide } from "./SectionGuide";

export type { Tone };

/* ------------------------------------------------------------------ layout */

/** Breakpoints like the web's: md for large phones in landscape and tablets,
 * lg for tablets in landscape, where the menu becomes a sidebar. */
export function useLayout() {
  const { width, height } = useWindowDimensions();
  return { width, height, sm: width >= 480, md: width >= 700, lg: width >= 1000, xl: width >= 1280 };
}

type Cols = number | { base?: number; sm?: number; md?: number; lg?: number };

export function useCols(cols: Cols) {
  const l = useLayout();
  if (typeof cols === "number") return cols;
  return (l.lg && cols.lg) || (l.md && cols.md) || (l.sm && cols.sm) || cols.base || 1;
}

/** Children laid out in equal columns that wrap, like a CSS grid. */
export function Grid({ cols = 1, gap = 12, children, style }: { cols?: Cols; gap?: number; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const n = useCols(cols);
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View style={[{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -gap / 2, marginVertical: -gap / 2 }, style]}>
      {items.map((child, i) => {
        const span = isValidElement(child) && typeof (child.props as { span?: number }).span === "number" ? Math.min(n, (child.props as { span: number }).span) : 1;
        return (
          <View key={isValidElement(child) && child.key != null ? child.key : i} style={{ width: `${(100 / n) * span}%`, padding: gap / 2 }}>
            {child}
          </View>
        );
      })}
    </View>
  );
}

/** A full-width child of Grid (any element with a span prop). */
export function Span({ span, children }: { span: number; children: React.ReactNode }) {
  void span;
  return <>{children}</>;
}

export function Row({ children, gap = 8, style, wrap, align = "center", justify }: { children: React.ReactNode; gap?: number; style?: StyleProp<ViewStyle>; wrap?: boolean; align?: ViewStyle["alignItems"]; justify?: ViewStyle["justifyContent"] }) {
  return <View style={[{ flexDirection: "row", alignItems: align, justifyContent: justify, gap, flexWrap: wrap ? "wrap" : "nowrap" }, style]}>{children}</View>;
}

export function Stack({ children, gap = 12, style }: { children: React.ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ gap }, style]}>{children}</View>;
}

/* -------------------------------------------------------------------- text */

const SIZES = { xxs: 11, xs: 13, sm: 15, base: 16, lg: 18, xl: 20, "2xl": 24, "3xl": 30 } as const;
type Weight = keyof typeof FONTS;

export function Txt({
  children, size = "base", weight = "regular", color, soft, center, style, numberOfLines, tabular, upper, selectable, onPress,
}: {
  children?: React.ReactNode; size?: keyof typeof SIZES; weight?: Weight; color?: string; soft?: boolean; center?: boolean;
  style?: StyleProp<TextStyle>; numberOfLines?: number; tabular?: boolean; upper?: boolean; selectable?: boolean; onPress?: () => void;
}) {
  const { c } = useTheme();
  const fontSize = SIZES[size];
  return (
    <Text
      numberOfLines={numberOfLines}
      selectable={selectable}
      onPress={onPress}
      style={[
        {
          fontFamily: FONTS[weight], fontSize, lineHeight: Math.round(fontSize * (size === "3xl" || size === "2xl" ? 1.25 : 1.45)),
          color: color ?? (soft ? c.soft : c.ink), textAlign: center ? "center" : undefined,
          fontVariant: tabular ? ["tabular-nums"] : undefined,
          textTransform: upper ? "uppercase" : undefined, letterSpacing: upper ? 0.6 : undefined,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/** A small uppercase label above a group, like the web's eyebrow text. */
export function Eyebrow({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Txt size="xxs" weight="semibold" soft upper style={style}>{children}</Txt>;
}

export function go(href: string) {
  // Section anchors (#assign) only mean something on the web.
  router.push(href.split("#")[0] as never);
}

/* --------------------------------------------------------------- animation */

/** Fades and lifts its content in when it first appears (the web's animate-enter). */
export function Enter({ children, delay = 0, style, from = 8 }: { children: React.ReactNode; delay?: number; style?: StyleProp<ViewStyle>; from?: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 320, delay, easing: Easing.bezier(0.2, 0.7, 0.2, 1), useNativeDriver: true }).start();
  }, [v, delay]);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** Children that appear one after another (the web's .stagger). */
export function Stagger({ children, gap = 10, style }: { children: React.ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View style={[{ gap }, style]}>
      {items.map((child, i) => (
        <Enter key={isValidElement(child) && child.key != null ? child.key : i} delay={Math.min(i, 6) * 40}>{child}</Enter>
      ))}
    </View>
  );
}

/** A pressable that shrinks a little while held, like the web's active:scale. */
export function Press({
  children, onPress, style, disabled, scale = 0.97, accessibilityLabel, accessibilityRole = "button", accessibilityState, hitSlop, onLongPress,
}: {
  children: React.ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>; disabled?: boolean; scale?: number;
  accessibilityLabel?: string; accessibilityRole?: "button" | "link" | "radio" | "tab" | "checkbox" | "switch"; accessibilityState?: object; hitSlop?: number; onLongPress?: () => void;
}) {
  const v = useRef(new Animated.Value(1)).current;
  const to = (n: number) => Animated.spring(v, { toValue: n, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      onPressIn={() => to(scale)}
      onPressOut={() => to(1)}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ disabled, ...accessibilityState }}
      hitSlop={hitSlop}
    >
      <Animated.View style={[style, { transform: [{ scale: v }] }, disabled && { opacity: 0.5 }]}>{children}</Animated.View>
    </Pressable>
  );
}

/** A soft glow that grows and fades out, on repeat (the web's animate-ping). */
export function Ping({ color, size = 10 }: { color: string; size?: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1200, easing: Easing.out(Easing.ease), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={{ position: "absolute", inset: 0, borderRadius: size, backgroundColor: color, opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }] }} />
      <View style={{ position: "absolute", inset: 0, borderRadius: size, backgroundColor: color }} />
    </View>
  );
}

/** A slow pulse, for the next step on a path and "now" markers. */
export function Pulse({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 900, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={[style, { opacity: v.interpolate({ inputRange: [0, 1], outputRange: [1, 0.55] }) }]}>{children}</Animated.View>;
}

/* ----------------------------------------------------------------- buttons */

type Variant = "primary" | "secondary" | "danger" | "danger-solid" | "ghost" | "soft";
type Size = "sm" | "md" | "lg";

export function Button({
  children, onPress, variant = "primary", size = "md", busy, disabled, icon: IconC, iconRight: IconR, full, style, accessibilityLabel,
}: {
  children?: React.ReactNode; onPress?: () => void; variant?: Variant; size?: Size; busy?: boolean; disabled?: boolean;
  icon?: Icon; iconRight?: Icon; full?: boolean; style?: StyleProp<ViewStyle>; accessibilityLabel?: string;
}) {
  const { c, tone, card } = useTheme();
  const v = {
    primary: { bg: c.brand, fg: c.onBrand, border: c.brand },
    secondary: { bg: c.surface, fg: c.ink, border: c.line },
    danger: { bg: c.surface, fg: tone.bad.fg, border: tone.bad.border },
    "danger-solid": { bg: "#dc2626", fg: "#ffffff", border: "#dc2626" },
    ghost: { bg: "transparent", fg: c.brand, border: "transparent" },
    soft: { bg: c.brandSoft, fg: c.brand, border: c.brandSoft },
  }[variant];
  const h = size === "sm" ? 38 : size === "lg" ? 52 : 46;
  const fs = size === "lg" ? "base" : "sm";
  const iconSize = size === "lg" ? 19 : 17;
  return (
    <Press
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          minHeight: h, paddingHorizontal: size === "sm" ? 12 : 16, borderRadius: 12, borderWidth: 1, borderColor: v.border, backgroundColor: v.bg,
          flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, alignSelf: full ? "stretch" : "flex-start",
        },
        variant === "primary" && card,
        style,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={v.fg} /> : IconC ? <IconC size={iconSize} color={v.fg} /> : null}
      {children != null && <Txt size={fs} weight="semibold" color={v.fg}>{children}</Txt>}
      {IconR && <IconR size={iconSize} color={v.fg} />}
    </Press>
  );
}

export function IconButton({ icon: IconC, label, onPress, color, size = 40, disabled, style, bg }: { icon: Icon; label: string; onPress?: () => void; color?: string; size?: number; disabled?: boolean; style?: StyleProp<ViewStyle>; bg?: string }) {
  const { c } = useTheme();
  return (
    <Press onPress={onPress} disabled={disabled} accessibilityLabel={label} scale={0.9} hitSlop={4}
      style={[{ width: size, height: size, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: bg }, style]}>
      <IconC size={Math.round(size * 0.5)} color={color ?? c.soft} />
    </Press>
  );
}

/** A text link, like "See all". */
export function LinkText({ children, href, onPress, color, size = "sm" }: { children: React.ReactNode; href?: string; onPress?: () => void; color?: string; size?: keyof typeof SIZES }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress ?? (href ? () => go(href) : undefined)} hitSlop={8} accessibilityRole="link">
      {({ pressed }) => <Txt size={size} weight="semibold" color={color ?? c.brand} style={{ opacity: pressed ? 0.6 : 1 }}>{children}</Txt>}
    </Pressable>
  );
}

/* -------------------------------------------------------------- form fields */

function FieldShell({ label, error, hint, optional, children, style }: { label?: string; error?: string | null; hint?: string; optional?: boolean; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { tone } = useTheme();
  return (
    <View style={style}>
      {label != null && (
        <Row justify="space-between" style={{ marginBottom: 6 }}>
          <Txt size="sm" weight="medium">{label}</Txt>
          {optional && <Txt size="xs" soft>Optional</Txt>}
        </Row>
      )}
      {children}
      {hint && !error ? <Txt size="xs" soft style={{ marginTop: 6 }}>{hint}</Txt> : null}
      {error ? (
        <Enter from={2}>
          <Row gap={6} align="flex-start" style={{ marginTop: 6 }}>
            <CircleAlert size={14} color={tone.bad.solid} style={{ marginTop: 2 }} />
            <Txt size="xs" weight="medium" color={tone.bad.fg} style={{ flex: 1 }}>{error}</Txt>
          </Row>
        </Enter>
      ) : null}
    </View>
  );
}

function useControlStyle(focused: boolean, error?: string | null, disabled?: boolean) {
  const { c, tone } = useTheme();
  return {
    minHeight: 46, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14,
    borderColor: error ? tone.bad.solid : focused ? c.brand : c.line,
    backgroundColor: disabled ? c.muted : c.surface,
    ...(focused ? { shadowColor: c.brand, shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } } : null),
  } as ViewStyle;
}

type FieldProps = Omit<TextInputProps, "style"> & {
  label?: string; error?: string | null; hint?: string; icon?: Icon; optional?: boolean; style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>; password?: boolean;
};

export function Field({ label, error, hint, icon: IconC, optional, style, inputStyle, password, multiline, editable = true, onFocus, onBlur, ...rest }: FieldProps) {
  const { c } = useTheme();
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(false);
  const input = useRef<React.ComponentRef<typeof TextInput> | null>(null);
  const box = useControlStyle(focused, error, !editable);
  return (
    <FieldShell label={label} error={error} hint={hint} optional={optional} style={style}>
      {/* Tapping anywhere in the box, not only on the text, opens the keyboard. */}
      <Pressable
        onPress={() => input.current?.focus()}
        disabled={!editable}
        accessible={false}
        style={[box, { flexDirection: "row", alignItems: multiline ? "flex-start" : "center", gap: 8 }, multiline && { minHeight: 96, paddingVertical: 10 }]}
      >
        {IconC && <IconC size={17} color={c.soft} />}
        <TextInput
          placeholderTextColor={c.soft + "99"}
          multiline={multiline}
          secureTextEntry={password && !shown}
          textAlignVertical={multiline ? "top" : "center"}
          {...rest}
          ref={input}
          editable={editable}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          style={[{ flex: 1, minHeight: 44, fontFamily: FONTS.regular, fontSize: 16, color: c.ink, paddingVertical: Platform.OS === "ios" ? 12 : 8 }, inputStyle]}
        />
        {password && (
          <IconButton icon={shown ? EyeOff : Eye} label={shown ? "Hide password" : "Show password"} onPress={() => setShown((s) => !s)} size={34} />
        )}
      </Pressable>
    </FieldShell>
  );
}

export type Option = { value: string; label: string; detail?: string };

/** A choice from a list, picked from a sheet that slides up. */
export function Select({ label, value, onChange, onChangeText, options, placeholder = "Choose…", error, hint, style, disabled, optional }: {
  label?: string; value: string; onChange?: (v: string) => void; onChangeText?: (v: string) => void; options: Option[]; placeholder?: string;
  error?: string | null; hint?: string; style?: StyleProp<ViewStyle>; disabled?: boolean; optional?: boolean;
}) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const box = useControlStyle(open, error, disabled);
  const current = options.find((o) => o.value === value);
  const pick = (v: string) => {
    setOpen(false);
    (onChange ?? onChangeText)?.(v);
  };
  return (
    <FieldShell label={label} error={error} hint={hint} optional={optional} style={style}>
      <Pressable onPress={() => setOpen(true)} disabled={disabled} accessibilityRole="button" accessibilityLabel={`${label ?? "Choose"}: ${current?.label ?? placeholder}`}>
        <View style={[box, { flexDirection: "row", alignItems: "center", gap: 8 }]}>
          <Txt numberOfLines={1} style={{ flex: 1 }} color={current ? c.ink : c.soft}>{current?.label ?? placeholder}</Txt>
          <ChevronDown size={18} color={c.soft} />
        </View>
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} title={label ?? "Choose"}>
        {/* A plain list: the sheet already scrolls, and a FlatList inside a ScrollView warns. */}
        {options.length === 0 ? <Txt soft style={{ padding: 12 }}>Nothing to choose yet.</Txt> : options.map((item) => {
          const on = item.value === value;
          return (
            <Pressable key={item.value || "__empty"} onPress={() => pick(item.value)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, backgroundColor: on ? c.brandSoft : pressed ? c.muted : "transparent" })}>
              <View style={{ flex: 1 }}>
                <Txt weight={on ? "semibold" : "regular"} color={on ? c.brand : c.ink}>{item.label}</Txt>
                {item.detail ? <Txt size="xs" soft>{item.detail}</Txt> : null}
              </View>
              {on && <Check size={18} color={c.brand} />}
            </Pressable>
          );
        })}
      </Sheet>
    </FieldShell>
  );
}

export function Checkbox({ label, checked, onChange, disabled, style }: { label: React.ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={() => onChange(!checked)} disabled={disabled} accessibilityRole="checkbox" accessibilityState={{ checked, disabled }} style={[{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 10, opacity: disabled ? 0.5 : 1 }, style]}>
      <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: checked ? c.brand : c.soft, backgroundColor: checked ? c.brand : "transparent", alignItems: "center", justifyContent: "center" }}>
        {checked && <Check size={15} color={c.onBrand} strokeWidth={3} />}
      </View>
      {typeof label === "string" ? <Txt size="sm" style={{ flex: 1 }}>{label}</Txt> : label}
    </Pressable>
  );
}

/** Small round choices, like board names or quick amounts. */
export function Chip({ label, on, onPress, icon: IconC }: { label: string; on?: boolean; onPress?: () => void; icon?: Icon }) {
  const { c } = useTheme();
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, minHeight: 34, borderRadius: 999, borderWidth: 1, borderColor: on ? c.brand : c.line, backgroundColor: on ? c.brandSoft : c.surface }}>
      {IconC && <IconC size={14} color={on ? c.brand : c.soft} />}
      <Txt size="xs" weight="semibold" color={on ? c.brand : c.soft}>{label}</Txt>
    </Press>
  );
}

/* ------------------------------------------------------------------ layout */

export function Card({ title, description, icon: IconC, actions, children, style, tint, border }: {
  title?: React.ReactNode; description?: React.ReactNode; icon?: Icon; actions?: React.ReactNode; children?: React.ReactNode;
  style?: StyleProp<ViewStyle>; tint?: string; border?: string;
}) {
  const { c, card } = useTheme();
  const { md } = useLayout();
  return (
    <View style={[{ backgroundColor: tint ?? c.surface, borderRadius: 18, borderWidth: 1, borderColor: border ?? c.line, padding: md ? 20 : 16 }, card, style]}>
      {(title != null || actions != null) && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: children ? 14 : 0 }}>
          <Row gap={12} style={{ flexShrink: 1, minWidth: 160 }}>
            {IconC && (
              <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: c.brandSoft, alignItems: "center", justifyContent: "center" }}>
                <IconC size={18} color={c.brand} />
              </View>
            )}
            <View style={{ flexShrink: 1 }}>
              {typeof title === "string" ? <Txt weight="semibold">{title}</Txt> : title}
              {description != null ? typeof description === "string" ? <Txt size="sm" soft style={{ marginTop: 2 }}>{description}</Txt> : description : null}
            </View>
          </Row>
          {actions != null && <Row gap={8} wrap>{actions}</Row>}
        </View>
      )}
      {children}
    </View>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; back?: string }) {
  const { c } = useTheme();
  const { md } = useLayout();
  const pathname = usePathname();
  // Opened from a link with no history: go up one level instead.
  const up = () => {
    const lists = ["/app/fees", "/app/students", "/app/quizzes", "/app/exams", "/app/report-cards", "/platform"];
    router.replace((lists.find((l) => pathname.startsWith(`${l}/`)) ?? "/app") as never);
  };
  return (
    <Enter style={{ marginBottom: 20 }}>
      {back && (
        <Pressable onPress={() => (router.canGoBack() ? router.back() : up())} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }} accessibilityRole="link">
          <ArrowLeft size={16} color={c.soft} />
          <Txt size="sm" weight="medium" soft>{back}</Txt>
        </Pressable>
      )}
      <View style={{ flexDirection: md ? "row" : "column", alignItems: md ? "flex-end" : "flex-start", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flexShrink: 1 }}>
          {typeof title === "string" ? <Txt size={md ? "3xl" : "2xl"} weight="bold" style={{ letterSpacing: -0.4 }}>{title}</Txt> : title}
          {subtitle != null && (typeof subtitle === "string" ? <Txt size="sm" soft style={{ marginTop: 4 }}>{subtitle}</Txt> : subtitle)}
        </View>
        {actions != null && <Row gap={8} wrap>{actions}</Row>}
      </View>
      {!back && <SectionGuide />}
    </Enter>
  );
}

/* ------------------------------------------------------------------ screen */

type FooterCtx = { set: (node: React.ReactNode) => void } | null;
const Footer = createContext<FooterCtx>(null);

/** A scrolling page with pull to refresh (which reloads everything on it),
 * the content centred on wide screens, and room for a StickyBar. */
export function Screen({ children, scroll = true, padded = true }: { children: React.ReactNode; scroll?: boolean; padded?: boolean }) {
  const { c } = useTheme();
  const l = useLayout();
  const [footer, setFooter] = useState<React.ReactNode>(null);
  const [version, setVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const ctx = useRef<FooterCtx>({ set: setFooter }).current;

  const refresh = () => {
    setRefreshing(true);
    clearApiCache();
    setVersion((v) => v + 1);
    setTimeout(() => setRefreshing(false), 600);
  };

  const pad = padded ? (l.md ? 24 : 16) : 0;
  const body = (
    <View key={version} style={{ width: "100%", maxWidth: 1200, alignSelf: "center", padding: pad, paddingBottom: pad + (footer ? 96 : 24) }}>
      {children}
    </View>
  );
  return (
    <Footer.Provider value={ctx}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {scroll ? (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ flexGrow: 1 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.brand} colors={[c.brand]} />}
          >
            {body}
          </ScrollView>
        ) : body}
        {footer ? (
          <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: l.md ? 24 : 12, paddingBottom: 10, alignItems: "center" }} pointerEvents="box-none">
            <View style={{ width: "100%", maxWidth: 1200 }}>{footer}</View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Footer.Provider>
  );
}

/** Save buttons that stay in reach at the bottom of the screen. */
export function StickyBar({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const ctx = useContext(Footer);
  const { c, lift } = useTheme();
  const node = (
    <Enter from={20}>
      <View style={[{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, padding: 10, borderRadius: 18, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface }, lift, style]}>
        {children}
      </View>
    </Enter>
  );
  useLayoutEffect(() => {
    ctx?.set(node);
  });
  useEffect(() => () => ctx?.set(null), [ctx]);
  return ctx ? null : <View style={{ marginTop: 16 }}>{node}</View>;
}

/** A sheet that slides up from the bottom (or a centred dialog on tablets). */
export function Sheet({ open, onClose, title, description, children }: { open: boolean; onClose: () => void; title?: string; description?: string; children: React.ReactNode }) {
  const { c, lift } = useTheme();
  const { md } = useLayout();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType={md ? "fade" : "slide"} onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: md ? "center" : "flex-end", alignItems: "center", padding: md ? 24 : 0 }}>
          {/* The dimmed backdrop sits behind the sheet, so taps on the sheet's fields reach them. */}
          <Pressable style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.overlay }} onPress={onClose} accessibilityLabel="Close" />
          <View style={[{ width: "100%", maxWidth: md ? 560 : undefined, maxHeight: "88%", backgroundColor: c.surface, borderRadius: md ? 22 : 0, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 18 + (md ? 0 : insets.bottom) }, lift]}>
            {!md && <View style={{ alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: c.line, marginBottom: 10 }} />}
            <Row justify="space-between" align="flex-start" style={{ marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                {title ? <Txt size="lg" weight="bold">{title}</Txt> : null}
                {description ? <Txt size="sm" soft style={{ marginTop: 2 }}>{description}</Txt> : null}
              </View>
              <IconButton icon={X} label="Close" onPress={onClose} size={36} />
            </Row>
            <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>{children}</ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ---------------------------------------------------------------- feedback */

export function Alert({ tone: t = "error", title, children, style }: { tone?: "error" | "success" | "info" | "warn"; title?: string; children?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { tone } = useTheme();
  const k = t === "error" ? tone.bad : t === "success" ? tone.good : t === "warn" ? tone.warn : tone.info;
  const IconC = t === "error" ? CircleAlert : t === "success" ? CircleCheck : Info;
  return (
    <Enter from={4} style={style}>
      <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start", borderRadius: 14, borderWidth: 1, borderColor: k.border, backgroundColor: k.bg, paddingHorizontal: 14, paddingVertical: 12 }}>
        <IconC size={18} color={t === "info" ? k.fg : k.solid} style={{ marginTop: 1 }} />
        <View style={{ flex: 1 }}>
          {title && <Txt size="sm" weight="semibold" color={t === "info" ? undefined : k.fg}>{title}</Txt>}
          {typeof children === "string" ? <Txt size="sm" color={t === "info" ? undefined : k.fg}>{children}</Txt> : children}
        </View>
      </View>
    </Enter>
  );
}

export function Badge({ children, tone: t = "neutral", dot }: { children: React.ReactNode; tone?: Tone; dot?: boolean }) {
  const { tone } = useTheme();
  const k = tone[t];
  const text = typeof children === "string" && /^[a-z]/.test(children) ? children[0].toUpperCase() + children.slice(1).replaceAll("_", " ") : children;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: k.bg }}>
      {dot && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: k.fg }} />}
      <Txt size="xs" weight="semibold" color={k.fg} numberOfLines={1}>{text}</Txt>
    </View>
  );
}

export function statusTone(status: string): Tone {
  if (["active"].includes(status)) return "good";
  if (["invited", "suspended", "transferred", "promoted"].includes(status)) return "warn";
  if (["left", "archived", "disabled"].includes(status)) return "bad";
  return "neutral";
}

export function Empty({ children, title, icon: IconC = Inbox, action }: { children?: React.ReactNode; title?: string; icon?: Icon; action?: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <Enter>
      <View style={{ alignItems: "center", borderRadius: 18, borderWidth: 1, borderStyle: "dashed", borderColor: c.line, paddingHorizontal: 20, paddingVertical: 30 }}>
        <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: c.muted, alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
          <IconC size={24} color={c.soft} />
        </View>
        {title && <Txt weight="semibold" center>{title}</Txt>}
        {children != null && (typeof children === "string" ? <Txt size="sm" soft center style={{ marginTop: title ? 4 : 0, maxWidth: 360 }}>{children}</Txt> : children)}
        {action != null && <View style={{ marginTop: 14 }}>{action}</View>}
      </View>
    </Enter>
  );
}

/** A friendly error with a Retry button, for a section that failed to load. */
export function ErrorState({ message, onRetry, compact }: { message?: string | null; onRetry?: () => void; compact?: boolean }) {
  const { tone } = useTheme();
  const offline = message?.toLowerCase().includes("reach the server");
  const IconC = offline ? WifiOff : CircleAlert;
  return (
    <Enter>
      <View style={{ alignItems: "center", borderRadius: 18, borderWidth: 1, borderColor: tone.bad.border, backgroundColor: tone.bad.bg + "88", paddingHorizontal: 20, paddingVertical: compact ? 18 : 30 }}>
        <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: tone.bad.bg, alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
          <IconC size={24} color={tone.bad.solid} />
        </View>
        <Txt weight="semibold" center>{offline ? "You seem to be offline" : "This didn't load"}</Txt>
        <Txt size="sm" soft center style={{ marginTop: 4, maxWidth: 380 }}>{message || "Something went wrong on our side."}</Txt>
        {onRetry && <Button variant="secondary" size="sm" icon={RotateCw} onPress={onRetry} style={{ marginTop: 14, alignSelf: "center" }}>Try again</Button>}
      </View>
    </Enter>
  );
}

export function Skeleton({ height = 14, width = "100%", radius = 8, style }: { height?: number; width?: ViewStyle["width"]; radius?: number; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={[{ height, width, borderRadius: radius, backgroundColor: c.muted, opacity: v.interpolate({ inputRange: [0, 1], outputRange: [1, 0.45] }) }, style]} />;
}

/** A placeholder while a section loads, shaped like what is coming. */
export function Loading({ variant = "list", rows = 4 }: { variant?: "list" | "cards" | "stats" | "table" | "text"; rows?: number }) {
  if (variant === "stats") {
    return <Grid cols={{ base: 2, lg: 4 }}>{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} height={96} radius={18} />)}</Grid>;
  }
  if (variant === "cards") {
    return <Grid cols={{ base: 1, lg: 2 }} gap={16}>{Array.from({ length: rows }, (_, i) => <Skeleton key={i} height={150} radius={18} />)}</Grid>;
  }
  if (variant === "text") {
    return <Stack gap={10} style={{ paddingVertical: 6 }}><Skeleton width="75%" /><Skeleton width="50%" /></Stack>;
  }
  return (
    <Stack gap={12} style={{ paddingVertical: 4 }}>
      {variant === "table" && <Skeleton height={30} />}
      {Array.from({ length: rows }, (_, i) => (
        <Row key={i} gap={12}>
          <Skeleton width={40} height={40} radius={12} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton height={13} />
            <Skeleton height={11} width="40%" />
          </View>
        </Row>
      ))}
    </Stack>
  );
}

/** What a section shows while it loads, when it failed, or when it has nothing. */
export function Async<T>({ state, children, loading, empty, isEmpty }: {
  state: { data: T | null; error: string | null; loading: boolean; reload: () => void };
  children: (data: T) => React.ReactNode; loading?: React.ReactNode; empty?: React.ReactNode; isEmpty?: (data: T) => boolean;
}) {
  if (state.error && !state.data) return <ErrorState message={state.error} onRetry={state.reload} />;
  if (state.data == null) return <>{loading ?? <Loading />}</>;
  if (empty && isEmpty?.(state.data)) return <>{empty}</>;
  return <>{children(state.data)}</>;
}

/* -------------------------------------------------------------------- data */

/** Counts up to a number when it first appears. */
export function CountUp({ value, format = (n) => String(Math.round(n)), style, size = "2xl", weight = "bold", color }: {
  value: number; format?: (n: number) => string; style?: StyleProp<TextStyle>; size?: keyof typeof SIZES; weight?: Weight; color?: string;
}) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const v = new Animated.Value(0);
    const id = v.addListener(({ value: n }) => setShown(n));
    Animated.timing(v, { toValue: value, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(() => setShown(value));
    return () => v.removeListener(id);
  }, [value]);
  return <Txt size={size} weight={weight} tabular color={color} style={style}>{format(shown)}</Txt>;
}

export function Stat({ label, value, hint, tone: t, icon: IconC, progress, href }: {
  label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "good" | "warn" | "bad"; icon?: Icon; progress?: number | null; href?: string;
}) {
  const { c, tone, card } = useTheme();
  const color = t ? tone[t].fg : c.ink;
  const body = (
    <View style={[{ minHeight: 104, borderRadius: 18, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, padding: 14 }, card]}>
      <Row justify="space-between" align="flex-start" gap={6}>
        <Eyebrow style={{ flex: 1 }}>{label}</Eyebrow>
        {IconC && (
          <View style={{ width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: t ? tone[t].bg : c.brandSoft }}>
            <IconC size={16} color={t ? tone[t].fg : c.brand} />
          </View>
        )}
      </Row>
      <View style={{ marginTop: 4 }}>
        {typeof value === "number" ? <CountUp value={value} color={color} /> : typeof value === "string" ? <Txt size="2xl" weight="bold" tabular color={color} numberOfLines={1} style={{ letterSpacing: -0.3 }}>{value}</Txt> : value}
      </View>
      {progress != null && <Progress value={progress} tone={t} style={{ marginTop: 8 }} />}
      {hint != null && (typeof hint === "string" ? <Txt size="xs" soft style={{ marginTop: 4 }}>{hint}</Txt> : hint)}
    </View>
  );
  return href ? <Press onPress={() => go(href)} accessibilityRole="link" accessibilityLabel={label}>{body}</Press> : body;
}

/** A bar that fills from the left when it appears. */
export function Progress({ value, tone: t, height = 8, style, color }: { value: number; tone?: "good" | "warn" | "bad"; height?: number; style?: StyleProp<ViewStyle>; color?: string }) {
  const { c, tone } = useTheme();
  const v = Math.max(0, Math.min(100, value || 0));
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: v, duration: 900, easing: Easing.bezier(0.2, 0.7, 0.2, 1), useNativeDriver: false }).start();
  }, [anim, v]);
  return (
    <View style={[{ height, borderRadius: height, backgroundColor: c.muted, overflow: "hidden" }, style]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(v) }}>
      <Animated.View style={{ height: "100%", borderRadius: height, backgroundColor: color ?? (t ? tone[t].solid : c.brand), width: anim.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }) }} />
    </View>
  );
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const { hues } = useTheme();
  const h = hues[hashIndex(name, 6)];
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  const px = size === "sm" ? 32 : size === "lg" ? 56 : 40;
  return (
    <View style={{ width: px, height: px, borderRadius: px, backgroundColor: h.bg, alignItems: "center", justifyContent: "center" }}>
      <Txt size={size === "sm" ? "xs" : size === "lg" ? "lg" : "sm"} weight="semibold" color={h.fg}>{initials || "?"}</Txt>
    </View>
  );
}

/** A row of tabs that scrolls sideways; the parent keeps which one is open. */
export function Tabs<T extends string>({ tabs, value, onChange, style }: { tabs: { key: T; label: string; count?: number }[]; value: T; onChange: (key: T) => void; style?: StyleProp<ViewStyle> }) {
  const { c, card } = useTheme();
  return (
    <View style={[{ marginBottom: 18, borderRadius: 18, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, padding: 4 }, card, style]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
        {tabs.map((t) => {
          const active = t.key === value;
          return (
            <Press key={t.key} onPress={() => onChange(t.key)} accessibilityRole="tab" accessibilityState={{ selected: active }}
              style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 14, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: active ? c.brand : "transparent" }}>
              <Txt size="sm" weight="semibold" color={active ? c.onBrand : c.soft}>{t.label}</Txt>
              {t.count != null && t.count > 0 && (
                <View style={{ borderRadius: 999, paddingHorizontal: 6, backgroundColor: active ? "rgba(255,255,255,0.25)" : c.muted }}>
                  <Txt size="xs" tabular color={active ? c.onBrand : c.soft}>{t.count}</Txt>
                </View>
              )}
            </Press>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** A small segmented switch, like Week | Month. */
export function Segmented<T extends string>({ options, value, onChange, style }: { options: { key: T; label: string }[]; value: T; onChange: (key: T) => void; style?: StyleProp<ViewStyle> }) {
  const { c, card } = useTheme();
  return (
    <View style={[{ flexDirection: "row", alignSelf: "flex-start", borderRadius: 12, backgroundColor: c.muted, padding: 4, gap: 2 }, style]} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable key={o.key} onPress={() => onChange(o.key)} accessibilityRole="radio" accessibilityState={{ checked: on }}
            style={[{ minHeight: 34, paddingHorizontal: 12, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: on ? c.surface : "transparent", flexGrow: 1 }, on && card]}>
            <Txt size="sm" weight={on ? "semibold" : "medium"} color={on ? c.ink : c.soft} numberOfLines={1}>{o.label}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A hairline between rows of a list. */
export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <View style={[{ height: 1, backgroundColor: c.line }, style]} />;
}

/** Shown while the app works out who is signed in. */
export function PageLoader({ label = "Loading" }: { label?: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.background, gap: 14 }}>
      <Pulse>
        <View style={{ width: 52, height: 52, borderRadius: 18, backgroundColor: c.brand, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color="#fff" />
        </View>
      </Pulse>
      <Txt size="sm" soft>{label}…</Txt>
    </View>
  );
}

type Column<T> = { header: string; cell: (row: T) => React.ReactNode; flex?: number; align?: "left" | "right" };

/** A table on tablets that turns into stacked cards on phones, like the web's DataTable. */
export function DataTable<T>({ rows, columns, rowKey, onRowPress, empty }: { rows: T[]; columns: Column<T>[]; rowKey: (row: T) => string; onRowPress?: (row: T) => void; empty?: React.ReactNode }) {
  const { c } = useTheme();
  const { md } = useLayout();
  if (rows.length === 0 && empty) return <>{typeof empty === "string" ? <Empty>{empty}</Empty> : empty}</>;
  const cellNode = (v: React.ReactNode, align?: "left" | "right") =>
    typeof v === "string" || typeof v === "number" ? <Txt size="sm" style={{ textAlign: align === "right" ? "right" : undefined }}>{v}</Txt> : v;

  if (md) {
    return (
      <View style={{ borderRadius: 14, borderWidth: 1, borderColor: c.line, overflow: "hidden" }}>
        <View style={{ flexDirection: "row", backgroundColor: c.muted, paddingHorizontal: 14, paddingVertical: 10, gap: 12 }}>
          {columns.map((col, i) => <Eyebrow key={col.header || i} style={{ flex: col.flex ?? 1, textAlign: col.align === "right" ? "right" : undefined }}>{col.header}</Eyebrow>)}
        </View>
        <Stagger gap={0}>
          {rows.map((row) => {
            const inner = (
              <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 12, borderTopWidth: 1, borderTopColor: c.line }}>
                {columns.map((col, i) => <View key={col.header || i} style={{ flex: col.flex ?? 1, alignItems: col.align === "right" ? "flex-end" : "flex-start" }}>{cellNode(col.cell(row), col.align)}</View>)}
              </View>
            );
            return onRowPress ? (
              <Pressable key={rowKey(row)} onPress={() => onRowPress(row)} style={({ pressed }) => ({ backgroundColor: pressed ? c.brandSoft : "transparent" })}>{inner}</Pressable>
            ) : <View key={rowKey(row)}>{inner}</View>;
          })}
        </Stagger>
      </View>
    );
  }

  const [first, ...rest] = columns;
  return (
    <Stagger gap={10}>
      {rows.map((row) => {
        const inner = (
          <View style={{ borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, padding: 14, gap: 4 }}>
            {first && <View style={{ marginBottom: 4 }}>{cellNode(first.cell(row))}</View>}
            {rest.map((col, i) => {
              const v = col.cell(row);
              if (v == null || v === false || v === "") return null;
              return col.header ? (
                <Row key={col.header || i} justify="space-between" align="flex-start" gap={12}>
                  <Txt size="xs" soft>{col.header}</Txt>
                  <View style={{ flexShrink: 1, alignItems: "flex-end" }}>{cellNode(v, "right")}</View>
                </Row>
              ) : (
                <View key={i} style={{ marginTop: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: c.line }}>{cellNode(v)}</View>
              );
            })}
          </View>
        );
        return onRowPress ? <Press key={rowKey(row)} onPress={() => onRowPress(row)} scale={0.99}>{inner}</Press> : <View key={rowKey(row)}>{inner}</View>;
      })}
    </Stagger>
  );
}

/** Label and value pairs, like a <dl>. */
export function Facts({ items, cols = { base: 2, md: 4 } }: { items: { label: string; value: React.ReactNode; color?: string }[]; cols?: Cols }) {
  return (
    <Grid cols={cols} gap={10}>
      {items.map((it) => (
        <View key={it.label}>
          <Txt size="sm" soft>{it.label}</Txt>
          {typeof it.value === "string" || typeof it.value === "number" ? <Txt size="sm" weight="semibold" tabular color={it.color}>{it.value}</Txt> : it.value}
        </View>
      ))}
    </Grid>
  );
}
