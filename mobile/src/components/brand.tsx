import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleProp, View, ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { useTheme } from "@/lib/theme";
import { Txt } from "./ui";

// The Vidyalaya OS logo: three stacked tiles (the school, its people and
// their records) with a "V" on the top tile. Same drawing as the web's.

export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <Svg viewBox="0 0 48 48" width={size} height={size}>
      <Defs>
        <LinearGradient id="vos-top" x1="6" y1="6" x2="42" y2="26" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#38bdf8" />
          <Stop offset="1" stopColor="#2f5bea" />
        </LinearGradient>
        <LinearGradient id="vos-mid" x1="6" y1="14" x2="42" y2="34" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#6366f1" />
          <Stop offset="1" stopColor="#4338ca" />
        </LinearGradient>
        <LinearGradient id="vos-low" x1="6" y1="22" x2="42" y2="42" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#a855f7" />
          <Stop offset="1" stopColor="#7c3aed" />
        </LinearGradient>
      </Defs>
      <Path d="M24 23 42 32.5 24 42 6 32.5Z" fill="url(#vos-low)" />
      <Path d="M24 14.5 42 24 24 33.5 6 24Z" fill="url(#vos-mid)" stroke="#fff" strokeOpacity={0.55} strokeWidth={0.8} strokeLinejoin="round" />
      <Path d="M24 6 42 15.5 24 25 6 15.5Z" fill="url(#vos-top)" stroke="#fff" strokeOpacity={0.7} strokeWidth={0.8} strokeLinejoin="round" />
      <Path d="M18.6 11.2h3.3l2.1 5.3 2.1-5.3h3.3L25.6 20h-3.2Z" fill="#fff" fillOpacity={0.95} />
    </Svg>
  );
}

/** The mark with the "Vidyalaya OS" name beside it. */
export function Logo({ subtitle = true, invert, size = 40 }: { subtitle?: boolean; invert?: boolean; size?: number }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View style={{ shadowColor: "#2f5bea", shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 6 } }}>
        <LogoMark size={size} />
      </View>
      <View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Txt size="xl" weight="extrabold" color={invert ? "#fff" : c.brand} style={{ letterSpacing: -0.4, lineHeight: 24 }}>Vidyalaya</Txt>
          <View style={{ borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: invert ? "rgba(255,255,255,0.15)" : c.brandSoft }}>
            <Txt size="xxs" weight="bold" color={invert ? "#fff" : c.brand} style={{ letterSpacing: 1 }}>OS</Txt>
          </View>
        </View>
        {subtitle && <Txt size="xxs" weight="medium" upper color={invert ? "rgba(255,255,255,0.7)" : c.soft} style={{ fontSize: 10, letterSpacing: 1.4 }}>The school operating system</Txt>}
      </View>
    </View>
  );
}

/** The logo's tiles drifting apart and back together, for the sign-in hero. */
export function FloatingLogo({ size = 150 }: { size?: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [v]);
  const tiles = [
    { d: "M24 23 42 32.5 24 42 6 32.5Z", from: "#a855f7", to: "#7c3aed", lift: 0 },
    { d: "M24 14.5 42 24 24 33.5 6 24Z", from: "#6366f1", to: "#4338ca", lift: 1 },
    { d: "M24 6 42 15.5 24 25 6 15.5Z", from: "#38bdf8", to: "#2f5bea", lift: 2, v: true },
  ];
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={{ position: "absolute", left: "20%", right: "20%", bottom: "4%", height: "10%", borderRadius: 999, backgroundColor: "rgba(47,91,234,0.25)" }} />
      {tiles.map((t, i) => (
        <Animated.View key={i} style={{ position: "absolute", inset: 0, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -t.lift * size * 0.05] }) }] }}>
          <Svg viewBox="0 0 48 48" width={size} height={size}>
            <Defs>
              <LinearGradient id={`fl${i}`} x1="6" y1="6" x2="42" y2="42" gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor={t.from} />
                <Stop offset="1" stopColor={t.to} />
              </LinearGradient>
            </Defs>
            <Path d={t.d} fill={`url(#fl${i})`} stroke="#fff" strokeOpacity={i ? 0.6 : 0} strokeWidth={0.6} strokeLinejoin="round" />
            {t.v && <Path d="M18.6 11.2h3.3l2.1 5.3 2.1-5.3h3.3L25.6 20h-3.2Z" fill="#fff" fillOpacity={0.95} />}
          </Svg>
        </Animated.View>
      ))}
    </View>
  );
}

/** The web's bg-aurora: a deep blue to violet to sky gradient, drawn at the
 * box's measured size so it always fills it. */
export function Aurora({ style, children, radius = 0 }: { style?: StyleProp<ViewStyle>; children?: React.ReactNode; radius?: number }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  return (
    <View
      onLayout={(e) => {
        const { width: w, height: h } = e.nativeEvent.layout;
        if (!size || size.w !== w || size.h !== h) setSize({ w, h });
      }}
      style={[{ overflow: "hidden", borderRadius: radius, backgroundColor: "#3b5fe8" }, style]}
    >
      {size && (
        <Svg pointerEvents="none" style={{ position: "absolute", top: 0, left: 0 }} width={size.w} height={size.h}>
          <Defs>
            <LinearGradient id="aurora" x1="0" y1="0" x2={size.w} y2={size.h} gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor="#2347c5" />
              <Stop offset="0.4" stopColor="#3b5fe8" />
              <Stop offset="0.75" stopColor="#7c4ddb" />
              <Stop offset="1" stopColor="#0ea5e9" />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={size.w} height={size.h} fill="url(#aurora)" />
        </Svg>
      )}
      {children}
    </View>
  );
}
