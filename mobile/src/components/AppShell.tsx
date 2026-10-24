import { router, usePathname } from "expo-router";
import { LogOut, Menu, Monitor, Moon, MoreHorizontal, Repeat, Sun, X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isActive, NavGroup, NavItem } from "@/lib/nav";
import { useTheme } from "@/lib/theme";
import { Avatar, IconButton, Press, Txt, useLayout } from "./ui";

export type PortalSwitch = { value: string; options: { key: string; label: string }[]; onChange: (key: string) => void };
type Brand = { title: string; subtitle: string; initials?: string; mark?: React.ReactNode };

function navigate(href: string) {
  router.navigate(href as never);
}

/** The frame around every signed-in screen: a sidebar on large tablets, and on
 * phones a top bar, a bottom tab bar and a slide-out menu, like the web's. */
export function AppShell({ brand, groups, tabs, user, switchHref, onSignOut, banner, portal, children }: {
  brand: Brand; groups: NavGroup[]; tabs: NavItem[]; user: { name: string; detail: string }; switchHref?: string;
  onSignOut: () => void; banner?: React.ReactNode; portal?: PortalSwitch; children: React.ReactNode;
}) {
  const { c } = useTheme();
  const { lg } = useLayout();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const flat = groups.flatMap((g) => g.items);
  const tabActive = tabs.some((t) => isActive(pathname, t));

  useEffect(() => {
    setDrawer(false);
  }, [pathname]);

  const body = (
    <View style={{ flex: 1 }}>
      {banner ? <View style={{ paddingHorizontal: lg ? 24 : 16, paddingTop: 12 }}>{banner}</View> : null}
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );

  if (lg) {
    return (
      <View style={{ flex: 1, flexDirection: "row", backgroundColor: c.background }}>
        <View style={{ width: 288, borderRightWidth: 1, borderRightColor: c.line, backgroundColor: c.surface, paddingTop: insets.top, paddingBottom: insets.bottom }}>
          <SidebarBody brand={brand} groups={groups} pathname={pathname} user={user} switchHref={switchHref} onSignOut={onSignOut} portal={portal} />
        </View>
        <View style={{ flex: 1, paddingTop: insets.top }}>{body}</View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ paddingTop: insets.top, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.line }}>
        <View style={{ height: 56, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 8 }}>
          <IconButton icon={Menu} label="Open menu" onPress={() => setDrawer(true)} color={c.ink} />
          <Pressable style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }} onPress={() => flat[0] && navigate(flat[0].href)}>
            {brand.mark ?? <BrandMark initials={brand.initials ?? brand.title} />}
            <View style={{ flex: 1 }}>
              <Txt size="sm" weight="semibold" numberOfLines={1}>{brand.title}</Txt>
              <Txt size="xs" soft numberOfLines={1}>{brand.subtitle}</Txt>
            </View>
          </Pressable>
          <ThemeButton />
        </View>
      </View>

      {body}

      <View style={{ borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.surface, paddingBottom: insets.bottom }} accessibilityRole="tablist">
        <View style={{ flexDirection: "row", maxWidth: 640, width: "100%", alignSelf: "center" }}>
          {tabs.map((t) => (
            <TabButton key={t.href} icon={t.icon} label={t.label} active={isActive(pathname, t)} onPress={() => navigate(t.href)} />
          ))}
          <TabButton icon={MoreHorizontal} label="More" active={!tabActive} onPress={() => setDrawer(true)} />
        </View>
      </View>

      <Drawer open={drawer} onClose={() => setDrawer(false)}>
        <SidebarBody brand={brand} groups={groups} pathname={pathname} user={user} switchHref={switchHref} onSignOut={onSignOut} portal={portal} onClose={() => setDrawer(false)} />
      </Drawer>
    </View>
  );
}

function TabButton({ icon: IconC, label, active, onPress }: { icon: NavItem["icon"]; label: string; active: boolean; onPress: () => void }) {
  const { c } = useTheme();
  const pill = useRef(new Animated.Value(active ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(pill, { toValue: active ? 1 : 0, useNativeDriver: true, speed: 20, bounciness: 8 }).start();
  }, [active, pill]);
  const color = active ? c.brand : c.soft;
  return (
    <Press onPress={onPress} scale={0.9} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={label}
      style={{ flex: 1, height: 62, alignItems: "center", justifyContent: "center", gap: 3 }}>
      <View style={{ width: 52, height: 30, alignItems: "center", justifyContent: "center" }}>
        <Animated.View style={{ position: "absolute", inset: 0, borderRadius: 999, backgroundColor: c.brandSoft, opacity: pill, transform: [{ scaleX: pill.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }} />
        <IconC size={20} color={color} />
      </View>
      <Txt size="xxs" weight={active ? "semibold" : "medium"} color={color} numberOfLines={1} style={{ fontSize: 11, paddingHorizontal: 2 }}>{label}</Txt>
    </Press>
  );
}

function Drawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const { c, lift } = useTheme();
  const { width } = useLayout();
  const insets = useSafeAreaInsets();
  const w = Math.min(320, width * 0.86);
  const v = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(open);

  useEffect(() => {
    if (open) {
      setShown(true);
      Animated.timing(v, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else {
      Animated.timing(v, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => setShown(false));
    }
  }, [open, v]);

  return (
    <Modal visible={shown} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={{ position: "absolute", inset: 0, backgroundColor: c.overlay, opacity: v }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close menu" />
      </Animated.View>
      <Animated.View style={[{ position: "absolute", top: 0, bottom: 0, left: 0, width: w, backgroundColor: c.surface, borderRightWidth: 1, borderRightColor: c.line, paddingTop: insets.top, paddingBottom: insets.bottom, transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [-w, 0] }) }] }, lift]}>
        {children}
      </Animated.View>
    </Modal>
  );
}

function BrandMark({ initials }: { initials: string }) {
  const text = initials.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  return (
    <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: "#2f5bea", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <View style={{ position: "absolute", right: -10, bottom: -10, width: 30, height: 30, borderRadius: 15, backgroundColor: "#8b5cf6", opacity: 0.85 }} />
      <Txt size="sm" weight="bold" color="#fff">{text}</Txt>
    </View>
  );
}

function SidebarBody({ brand, groups, pathname, user, switchHref, onSignOut, portal, onClose }: {
  brand: Brand; groups: NavGroup[]; pathname: string; user: { name: string; detail: string }; switchHref?: string;
  onSignOut: () => void; portal?: PortalSwitch; onClose?: () => void;
}) {
  const { c, tone, card } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14 }}>
        {brand.mark ?? <BrandMark initials={brand.initials ?? brand.title} />}
        <View style={{ flex: 1 }}>
          <Txt weight="semibold" numberOfLines={1}>{brand.title}</Txt>
          <Txt size="xs" soft numberOfLines={1}>{brand.subtitle}</Txt>
        </View>
        {onClose && <IconButton icon={X} label="Close menu" onPress={onClose} />}
      </View>
      {portal && portal.options.length > 1 && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
          <Txt size="xxs" weight="semibold" soft upper style={{ marginBottom: 6, paddingHorizontal: 4 }}>Portal</Txt>
          <View accessibilityRole="radiogroup" style={{ flexDirection: "row", gap: 4, borderRadius: 12, backgroundColor: c.muted, padding: 4 }}>
            {portal.options.map((o) => {
              const on = portal.value === o.key;
              return (
                <Pressable key={o.key} onPress={() => portal.onChange(o.key)} accessibilityRole="radio" accessibilityState={{ checked: on }}
                  style={[{ flex: 1, minHeight: 34, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: on ? c.surface : "transparent" }, on && card]}>
                  <Txt size="xs" weight="semibold" color={on ? c.brand : c.soft} numberOfLines={1}>{o.label}</Txt>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 16 }}>
        {groups.map((g, gi) => (
          <View key={g.title ?? gi} style={{ marginTop: gi === 0 ? 0 : 12 }}>
            {g.title && <Txt size="xxs" weight="semibold" soft upper style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6 }}>{g.title}</Txt>}
            {g.items.map((item) => {
              const active = isActive(pathname, item);
              const IconC = item.icon;
              return (
                <Pressable key={item.href} onPress={() => { navigate(item.href); onClose?.(); }} accessibilityRole="link" accessibilityState={{ selected: active }}
                  style={({ pressed }) => ({ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, paddingHorizontal: 12, marginBottom: 2, backgroundColor: active ? c.brandSoft : pressed ? c.muted : "transparent" })}>
                  {active && <View style={{ position: "absolute", left: 0, top: 8, bottom: 8, width: 4, borderTopRightRadius: 4, borderBottomRightRadius: 4, backgroundColor: c.brand }} />}
                  <IconC size={18} color={active ? c.brand : c.soft} />
                  <Txt size="sm" weight="medium" color={active ? c.brand : c.soft}>{item.label}</Txt>
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>
      <View style={{ borderTopWidth: 1, borderTopColor: c.line, padding: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 8, paddingVertical: 6 }}>
          <Avatar name={user.name} />
          <View style={{ flex: 1 }}>
            <Txt size="sm" weight="semibold" numberOfLines={1}>{user.name}</Txt>
            <Txt size="xs" soft numberOfLines={1}>{user.detail}</Txt>
          </View>
          <ThemeButton />
        </View>
        <View style={{ flexDirection: "row", gap: 4, marginTop: 4 }}>
          {switchHref ? (
            <Pressable onPress={() => { onClose?.(); router.push(switchHref as never); }} style={({ pressed }) => ({ flex: 1, minHeight: 40, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: pressed ? c.muted : "transparent" })}>
              <Repeat size={16} color={c.soft} />
              <Txt size="sm" weight="medium" soft>Switch</Txt>
            </Pressable>
          ) : <View style={{ flex: 1 }} />}
          <Pressable onPress={() => { onClose?.(); onSignOut(); }} style={({ pressed }) => ({ flex: 1, minHeight: 40, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: pressed ? tone.bad.bg : "transparent" })}>
            <LogOut size={16} color={c.soft} />
            <Txt size="sm" weight="medium" soft>Sign out</Txt>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const NEXT_THEME = { system: "light", light: "dark", dark: "system" } as const;

export function ThemeButton() {
  const { choice, setChoice, c } = useTheme();
  const IconC = choice === "dark" ? Moon : choice === "light" ? Sun : Monitor;
  const spin = useRef(new Animated.Value(1)).current;
  const change = () => {
    spin.setValue(0);
    Animated.spring(spin, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 10 }).start();
    setChoice(NEXT_THEME[choice]);
  };
  return (
    <Pressable onPress={change} hitSlop={4} accessibilityRole="button" accessibilityLabel={`Theme: ${choice === "system" ? "same as device" : choice}. Change`}
      style={{ width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={{ transform: [{ scale: spin.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }, { rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["-60deg", "0deg"] }) }] }}>
        <IconC size={20} color={c.soft} />
      </Animated.View>
    </Pressable>
  );
}
