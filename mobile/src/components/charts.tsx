import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, View } from "react-native";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";
import { FONTS, useTheme } from "@/lib/theme";
import { Progress, Row, Txt } from "./ui";

// Small charts drawn with react-native-svg, like the web's charts.tsx:
// the brand blue for the main series, a neutral gray for the comparison, and
// the status colours (always with a text label) for attendance states.

const STATUS = { good: "#16a34a", warn: "#f59e0b", bad: "#dc2626", neutral: "#94a3b8" } as const;
export type Segment = { label: string; value: number; tone: keyof typeof STATUS | "brand" };

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function useGrow(to: number, duration = 1000) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: to, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [v, to, duration]);
  return v;
}

/** A ring showing one percentage, with the number in the middle. */
export function Ring({ value, size = 96, label, tone }: { value: number | null; size?: number; label?: string; tone?: "good" | "warn" | "bad" }) {
  const { c } = useTheme();
  const r = 42;
  const circ = 2 * Math.PI * r;
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  const grow = useGrow(v);
  const color = tone ? STATUS[tone] : c.brand;
  return (
    <View style={{ width: size, height: size }} accessibilityRole="image" accessibilityLabel={`${label ?? "Value"}: ${value == null ? "no data" : `${value}%`}`}>
      <Svg viewBox="0 0 100 100" width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={50} cy={50} r={r} fill="none" stroke={c.muted} strokeWidth={10} />
        <AnimatedCircle
          cx={50} cy={50} r={r} fill="none" stroke={color} strokeWidth={10} strokeLinecap="round"
          strokeDasharray={`${circ}`}
          strokeDashoffset={grow.interpolate({ inputRange: [0, 100], outputRange: [circ, 0] })}
        />
      </Svg>
      <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}>
        <Txt size={size < 80 ? "sm" : "lg"} weight="bold" tabular>{value == null ? "-" : `${Math.round(value)}%`}</Txt>
        {label && <Txt size="xxs" soft style={{ fontSize: 10, lineHeight: 12 }}>{label}</Txt>}
      </View>
    </View>
  );
}

/** A donut split into labelled parts, with a legend beside it. Tap a part
 * of the legend to pick it out. */
export function Donut({ segments, centre, size = 120 }: { segments: Segment[]; centre?: React.ReactNode; size?: number }) {
  const { c } = useTheme();
  const [focus, setFocus] = useState<number | null>(null);
  const total = segments.reduce((n, s) => n + s.value, 0);
  const r = 40;
  const circ = 2 * Math.PI * r;
  const fill = (t: Segment["tone"]) => (t === "brand" ? c.brand : STATUS[t]);
  let offset = 0;
  const parts = segments.filter((x) => x.value > 0).length;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 18 }}>
      <View style={{ width: size, height: size }} accessibilityRole="image" accessibilityLabel={segments.map((s) => `${s.label} ${s.value}`).join(", ")}>
        <Svg viewBox="0 0 100 100" width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
          <Circle cx={50} cy={50} r={r} fill="none" stroke={c.muted} strokeWidth={14} />
          {total > 0 && segments.map((s, i) => {
            const len = (s.value / total) * circ;
            const gap = parts > 1 ? 1.2 : 0;
            const el = s.value > 0 ? (
              <Circle key={s.label} cx={50} cy={50} r={r} fill="none" stroke={fill(s.tone)} strokeWidth={focus === i ? 17 : 14}
                strokeDasharray={`${Math.max(0, len - gap)} ${circ}`} strokeDashoffset={-offset} opacity={focus != null && focus !== i ? 0.45 : 1} />
            ) : null;
            offset += len;
            return el;
          })}
        </Svg>
        <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}>{centre}</View>
      </View>
      <View style={{ gap: 6 }}>
        {segments.map((s, i) => (
          <Pressable key={s.label} onPress={() => setFocus(focus === i ? null : i)} style={{ flexDirection: "row", alignItems: "center", gap: 8, opacity: focus != null && focus !== i ? 0.5 : 1 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: fill(s.tone) }} />
            <Txt size="sm" soft>{s.label}</Txt>
            <Txt size="sm" weight="semibold" tabular>{s.value}</Txt>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Horizontal bars (0–100) per item, with an optional comparison tick, such as
 * a student's percentage per subject and the class average. */
export function BarList({ items, valueLabel = "Score", compareLabel, format = (n) => `${Math.round(n)}%` }: {
  items: { label: string; value: number | null; compare?: number | null; note?: string }[];
  valueLabel?: string; compareLabel?: string; format?: (n: number) => string;
}) {
  const { c } = useTheme();
  return (
    <View>
      {compareLabel && (
        <Row gap={16} wrap style={{ marginBottom: 12 }}>
          <Row gap={6}><View style={{ height: 8, width: 16, borderRadius: 4, backgroundColor: c.brand }} /><Txt size="xs" soft>{valueLabel}</Txt></Row>
          <Row gap={6}><View style={{ height: 12, width: 2, borderRadius: 1, backgroundColor: c.ink + "99" }} /><Txt size="xs" soft>{compareLabel}</Txt></Row>
        </Row>
      )}
      <View style={{ gap: 12 }}>
        {items.map((it) => {
          const v = it.value == null ? 0 : Math.max(0, Math.min(100, it.value));
          return (
            <View key={it.label} accessibilityLabel={`${it.label}: ${it.value == null ? "no data" : format(it.value)}${it.compare != null && compareLabel ? `, ${compareLabel} ${format(it.compare)}` : ""}`}>
              <Row justify="space-between" gap={12} style={{ marginBottom: 4 }}>
                <Txt size="sm" numberOfLines={1} style={{ flex: 1 }}>{it.label}</Txt>
                <Txt size="sm" weight="semibold" tabular>{it.note ?? (it.value == null ? "-" : format(it.value))}</Txt>
              </Row>
              <View>
                <Progress value={v} height={10} />
                {it.compare != null && (
                  <View style={{ position: "absolute", top: -4, left: `${Math.max(0, Math.min(100, it.compare))}%`, marginLeft: -2, height: 18, width: 3, borderRadius: 2, backgroundColor: c.ink + "99", borderWidth: 1, borderColor: c.surface }} />
                )}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Stacked horizontal bars of two parts (for example collected and still due). */
export function SplitBars({ items, labels, format }: { items: { label: string; a: number; b: number }[]; labels: [string, string]; format: (n: number) => string }) {
  const { c, dark } = useTheme();
  const grey = dark ? "#475569" : "#cbd5e1";
  const max = Math.max(1, ...items.map((i) => i.a + i.b));
  return (
    <View>
      <Row gap={16} wrap style={{ marginBottom: 12 }}>
        <Row gap={6}><View style={{ height: 8, width: 16, borderRadius: 4, backgroundColor: c.brand }} /><Txt size="xs" soft>{labels[0]}</Txt></Row>
        <Row gap={6}><View style={{ height: 8, width: 16, borderRadius: 4, backgroundColor: grey }} /><Txt size="xs" soft>{labels[1]}</Txt></Row>
      </Row>
      <View style={{ gap: 12 }}>
        {items.map((it) => (
          <View key={it.label} accessibilityLabel={`${it.label}: ${labels[0]} ${format(it.a)}, ${labels[1]} ${format(it.b)}`}>
            <Row justify="space-between" gap={12} style={{ marginBottom: 4 }}>
              <Txt size="sm" numberOfLines={1} style={{ flex: 1 }}>{it.label}</Txt>
              <Txt size="xs" soft tabular><Txt size="xs" weight="semibold">{format(it.a)}</Txt> / {format(it.a + it.b)}</Txt>
            </Row>
            <GrowBar width={((it.a + it.b) / max) * 100}>
              {it.a > 0 && <View style={{ flexGrow: it.a, backgroundColor: c.brand }} />}
              {it.b > 0 && <View style={{ flexGrow: it.b, backgroundColor: grey }} />}
            </GrowBar>
          </View>
        ))}
      </View>
    </View>
  );
}

function GrowBar({ width, children }: { width: number; children: React.ReactNode }) {
  const grow = useGrow(width, 900);
  return (
    <Animated.View style={{ flexDirection: "row", gap: 2, height: 10, borderRadius: 5, overflow: "hidden", minWidth: 24, width: grow.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }) }}>
      {children}
    </Animated.View>
  );
}

/** A small line chart of percentages over time. Tap a point to read it. */
export function TrendLine({ points, height = 140, threshold }: { points: { label: string; value: number | null }[]; height?: number; threshold?: number }) {
  const { c } = useTheme();
  const [width, setWidth] = useState(320);
  const [hover, setHover] = useState<number | null>(null);
  const w = width;
  const pad = { l: 28, r: 10, t: 12, b: 22 };
  const iw = w - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const x = (i: number) => pad.l + (points.length <= 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / 100) * ih;
  const valid = points.map((p, i) => ({ ...p, i })).filter((p) => p.value != null) as { label: string; value: number; i: number }[];
  const d = valid.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const fade = useGrow(1, 700);
  const h = hover != null ? points[hover] : null;
  const step = Math.ceil(points.length / Math.max(1, Math.floor(iw / 34)));
  return (
    <View onLayout={(e) => setWidth(Math.max(200, e.nativeEvent.layout.width))} accessibilityRole="image" accessibilityLabel={points.map((p) => `${p.label}: ${p.value ?? "no data"}%`).join(", ")}>
      <Animated.View style={{ opacity: fade }}>
        <Svg width={w} height={height}>
          {[0, 50, 100].map((g) => (
            <Line key={g} x1={pad.l} x2={w - pad.r} y1={y(g)} y2={y(g)} stroke={c.line} strokeWidth={1} />
          ))}
          {[0, 50, 100].map((g) => (
            <SvgText key={`t${g}`} x={pad.l - 6} y={y(g) + 3} textAnchor="end" fontSize={9} fill={c.soft} fontFamily={FONTS.medium}>{g}</SvgText>
          ))}
          {threshold != null && <Line x1={pad.l} x2={w - pad.r} y1={y(threshold)} y2={y(threshold)} stroke="#dc2626" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />}
          {hover != null && <Line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke={c.soft} strokeWidth={1} opacity={0.4} />}
          <Path d={d} fill="none" stroke={c.brand} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          {valid.map((p) => <Circle key={p.i} cx={x(p.i)} cy={y(p.value)} r={hover === p.i ? 5.5 : 3.5} fill={c.brand} stroke={c.surface} strokeWidth={2} />)}
          {points.map((p, i) => (i % step === 0 || i === points.length - 1) ? (
            <SvgText key={`l${i}`} x={x(i)} y={height - 6} textAnchor="middle" fontSize={9} fill={c.soft} fontFamily={FONTS.medium}>{p.label}</SvgText>
          ) : null)}
        </Svg>
      </Animated.View>
      <View style={{ position: "absolute", left: pad.l, top: pad.t, width: iw, height: ih, flexDirection: "row" }}>
        {points.map((p, i) => (
          <Pressable key={i} style={{ flex: 1 }} onPress={() => setHover(hover === i ? null : i)} onPressIn={() => setHover(i)} />
        ))}
      </View>
      {h && hover != null && (
        <View pointerEvents="none" style={{ position: "absolute", top: 0, left: Math.min(w - 110, Math.max(0, x(hover) - 55)), width: 110, alignItems: "center" }}>
          <View style={{ borderRadius: 8, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Txt size="xxs"><Txt size="xxs" soft>{h.label} </Txt><Txt size="xxs" weight="semibold" tabular>{h.value == null ? "No data" : `${h.value}%`}</Txt></Txt>
          </View>
        </View>
      )}
    </View>
  );
}
