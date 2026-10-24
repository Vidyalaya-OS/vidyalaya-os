import * as Haptics from "expo-haptics";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react-native";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, View } from "react-native";
import { useInsets as useSafeAreaInsets } from "@/lib/insets";
import { ApiError } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { Txt, useLayout } from "./ui";

type Tone = "success" | "error" | "info";
type Toast = { id: number; tone: Tone; text: string };
type Ctx = {
  show: (tone: Tone, text: string) => void;
  success: (text: string) => void;
  error: (errorOrText: unknown, fallback?: string) => void;
  info: (text: string) => void;
};

const ToastContext = createContext<Ctx | null>(null);
const ICONS = { success: CircleCheck, error: CircleAlert, info: Info };

/** Short messages that appear near the bottom of the screen after an action. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const insets = useSafeAreaInsets();
  const { lg } = useLayout();

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const show = useCallback((tone: Tone, text: string) => {
    const id = next.current++;
    setToasts((t) => [...t.slice(-2), { id, tone, text }]);
    if (tone === "success") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (tone === "error") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    setTimeout(() => dismiss(id), tone === "error" ? 7000 : 4000);
  }, [dismiss]);

  const value = useMemo<Ctx>(() => ({
    show,
    success: (text) => show("success", text),
    info: (text) => show("info", text),
    error: (e, fallback = "That did not work. Please try again.") =>
      show("error", typeof e === "string" ? e : e instanceof ApiError ? e.message : fallback),
  }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: insets.bottom + (lg ? 24 : 84), alignItems: lg ? "flex-end" : "center", paddingHorizontal: 16, gap: 8 }}>
        {toasts.map((t) => <ToastCard key={t.id} toast={t} onClose={() => dismiss(t.id)} />)}
      </View>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const { c, tone, lift } = useTheme();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(v, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 8 }).start();
  }, [v]);
  const IconC = ICONS[toast.tone];
  const color = toast.tone === "success" ? tone.good.solid : toast.tone === "error" ? tone.bad.solid : c.brand;
  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      accessibilityRole={toast.tone === "error" ? "alert" : undefined}
      style={[{
        width: "100%", maxWidth: 400, flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 14, borderWidth: 1, borderColor: c.line,
        backgroundColor: c.surface, paddingHorizontal: 14, paddingVertical: 12,
        opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }, { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
      }, lift]}
    >
      <IconC size={19} color={color} style={{ marginTop: 1 }} />
      <Txt size="sm" style={{ flex: 1 }}>{toast.text}</Txt>
      <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Dismiss">
        <X size={16} color={c.soft} />
      </Pressable>
    </Animated.View>
  );
}


export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
