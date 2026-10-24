import {
  PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold, useFonts,
} from "@expo-google-fonts/plus-jakarta-sans";
import { type ErrorBoundaryProps, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DialogProvider } from "@/components/dialog";
import { ToastProvider } from "@/components/toast";
import { Button, Txt } from "@/components/ui";
import { SessionProvider, useSession } from "@/lib/session";
import { ThemeProvider, useTheme } from "@/lib/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold,
  });
  if (!fontsLoaded && !fontError) return null;
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ToastProvider>
          <DialogProvider>
            <SessionProvider>
              <Root />
            </SessionProvider>
          </DialogProvider>
        </ToastProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function Root() {
  const { c, dark } = useTheme();
  const { ready } = useSession();
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <StatusBar style={dark ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background }, animation: "fade" }} />
    </View>
  );
}

/** Shown instead of a blank screen if a page crashes. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Crashed message={error.message} retry={retry} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function Crashed({ message, retry }: { message: string; retry: () => void }) {
  const { c } = useTheme();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 10 }}>
      <Txt size="xl" weight="bold" center>Something went wrong on this screen</Txt>
      <Txt size="sm" soft center>{message}</Txt>
      <Button onPress={retry} style={{ marginTop: 8 }}>Try again</Button>
    </ScrollView>
  );
}
