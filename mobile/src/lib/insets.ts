import { Dimensions, Platform, StatusBar } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Safe-area insets, with a fallback for Android phones that draw the app
 * behind the navigation buttons but report no bottom inset. There the gap
 * between the screen and the window (less the status bar) is the button bar. */
export function useInsets() {
  const insets = useSafeAreaInsets();
  if (Platform.OS !== "android" || insets.bottom > 0) return insets;
  const screen = Dimensions.get("screen").height;
  const window = Dimensions.get("window").height;
  const gap = Math.round(screen - window - (StatusBar.currentHeight ?? 0));
  // A sensible bottom margin for the three-button bar (48dp) when nothing is reported.
  const bottom = gap > 0 && gap < 80 ? gap : 0;
  return { ...insets, bottom: Math.max(bottom, 12) };
}
