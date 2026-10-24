import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

// Where the Django API is. In order of preference:
//  1. an address typed in the app (Server settings on the sign-in screen),
//  2. EXPO_PUBLIC_API_URL from mobile/.env,
//  3. while developing, the computer running `npx expo start` on port 8000
//     (Expo knows its LAN address, so a phone on the same Wi-Fi finds it),
//  4. http://localhost:8000.

const KEY = "vidyalaya.server";
let saved: string | null = null;

function clean(url: string) {
  const trimmed = url.trim().replace(/\/+$/, "").replace(/\/api$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

/** The address Expo's dev server runs on, with the API's port. */
export function guessedServer(): string {
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  return host ? `http://${host}:8000` : "http://localhost:8000";
}

export function defaultServer(): string {
  const env = process.env.EXPO_PUBLIC_API_URL;
  return env ? clean(env) : guessedServer();
}

export function serverUrl(): string {
  return saved ?? defaultServer();
}

export function apiUrl(path: string) {
  return `${serverUrl()}/api/${path.replace(/^\//, "")}`;
}

/** Absolute address for a path the API returns, like "/api/homework/…". */
export function absolute(path: string) {
  return /^https?:\/\//.test(path) ? path : `${serverUrl()}${path.startsWith("/") ? "" : "/"}${path}`;
}

export async function loadServer() {
  try {
    saved = await AsyncStorage.getItem(KEY);
  } catch {
    saved = null;
  }
}

/** Save an address, or pass null to go back to the default. */
export async function setServer(url: string | null) {
  saved = url ? clean(url) : null;
  try {
    if (saved) await AsyncStorage.setItem(KEY, saved);
    else await AsyncStorage.removeItem(KEY);
  } catch {
    // Kept for this run only.
  }
}

export function isCustomServer() {
  return saved != null;
}
