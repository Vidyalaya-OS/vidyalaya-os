import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleProp, useWindowDimensions, View, ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useTheme } from "@/lib/theme";
import { Txt } from "../ui";

/* The landing page's small building blocks: content that rises in as it
 * scrolls into view (the web's Reveal), section headings and gradient tiles. */

type Watcher = () => void;
const ScrollWatch = createContext<{ add: (w: Watcher) => () => void } | null>(null);

/** Lets every Reveal inside know when the page scrolls. */
export function useScrollWatch() {
  const watchers = useRef(new Set<Watcher>());
  const value = useRef({
    add: (w: Watcher) => {
      watchers.current.add(w);
      return () => { watchers.current.delete(w); };
    },
  }).current;
  const onScroll = useCallback(() => watchers.current.forEach((w) => w()), []);
  return { value, onScroll, Provider: ScrollWatch.Provider };
}

/** Fades and lifts its content in the first time it scrolls into view. */
export function Reveal({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const watch = useContext(ScrollWatch);
  const { height } = useWindowDimensions();
  const ref = useRef<React.ComponentRef<typeof View>>(null);
  const v = useRef(new Animated.Value(watch ? 0 : 1)).current;
  const shown = useRef(!watch);

  useEffect(() => {
    if (!watch) return;
    const check = () => {
      if (shown.current) return;
      ref.current?.measureInWindow((_x: number, y: number) => {
        if (shown.current || y > height - 40) return;
        shown.current = true;
        stop();
        Animated.timing(v, { toValue: 1, duration: 520, delay, easing: Easing.bezier(0.2, 0.7, 0.2, 1), useNativeDriver: true }).start();
      });
    };
    const stop = watch.add(check);
    const first = setTimeout(check, 60);
    return () => { clearTimeout(first); stop(); };
  }, [watch, height, delay, v]);

  return (
    <Animated.View ref={ref} collapsable={false} style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** The small coloured label and big heading at the top of a section. */
export function SectionTitle({ eyebrow, title, intro, center }: { eyebrow?: string; title: string; intro?: string; center?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: center ? "center" : "flex-start", maxWidth: 640, alignSelf: center ? "center" : "auto" }}>
      {eyebrow && <Txt size="xs" weight="semibold" upper color={c.brand}>{eyebrow}</Txt>}
      <Txt size="3xl" weight="bold" center={center} style={{ marginTop: eyebrow ? 6 : 0, letterSpacing: -0.5 }}>{title}</Txt>
      {intro && <Txt soft center={center} style={{ marginTop: 10 }}>{intro}</Txt>}
    </View>
  );
}

let gradientId = 0;

/** A box filled with a diagonal two-colour gradient (the web's bg-gradient-to-br).
 * The gradient is drawn at the box's measured size: on iOS a percentage-sized
 * Svg keeps its first size and leaves part of the box unfilled. */
export function Gradient({ colors, style, children, horizontal }: { colors: [string, string]; style?: StyleProp<ViewStyle>; children?: React.ReactNode; horizontal?: boolean }) {
  const id = useRef(`grad${gradientId++}`).current;
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  return (
    <View
      onLayout={(e) => {
        const { width: w, height: h } = e.nativeEvent.layout;
        if (!size || size.w !== w || size.h !== h) setSize({ w, h });
      }}
      style={[{ overflow: "hidden", zIndex: 0, backgroundColor: colors[0] }, style]}
    >
      {size && (
        <Svg pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, zIndex: -1 }} width={size.w} height={size.h}>
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2={size.w} y2={horizontal ? 0 : size.h} gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={colors[0]} />
              <Stop offset="1" stopColor={colors[1]} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={size.w} height={size.h} fill={`url(#${id})`} />
        </Svg>
      )}
      {children}
    </View>
  );
}

/** Gently bobs its content up and down, like the web's animate-float. */
export function Float({ children, style, offset = 0 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; offset?: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 3000, delay: offset, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 3000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [v, offset]);
  return (
    <Animated.View style={[style, { transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) }] }]}>
      {children}
    </Animated.View>
  );
}
