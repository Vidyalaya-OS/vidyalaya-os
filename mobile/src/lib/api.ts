// A small client for the Django API, like web/src/lib/api.ts. It keeps the
// login tokens, adds the chosen school to every request (X-School) and
// refreshes expired tokens. The server address comes from server.ts.

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { apiUrl } from "./server";

export type Role = "admin" | "teacher" | "student" | "parent";

export type SchoolRef = { id: string; name: string; subdomain: string; status: string };
export type Membership = { school: SchoolRef; roles: Role[] };
export type User = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  is_platform_owner: boolean;
};
/** Where the API says this person lands after signing in. */
export type Home = {
  kind: "platform" | "school" | "choose_school" | "none";
  /** The school's subdomain when kind is "school". */
  school: string | null;
  /** The portal to open first when kind is "school". */
  role: Role | null;
};
export type Session = { access: string; refresh: string; user: User; memberships: Membership[]; home?: Home };

export type Page<T> = { count: number; next: string | null; previous: string | null; results: T[] };

const TOKENS_KEY = "vidyalaya.tokens";
const PROFILE_KEY = "vidyalaya.profile";
const SCHOOL_KEY = "vidyalaya.school";

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(status: number, data: unknown) {
    super(friendly(status, describeError(data)));
    this.status = status;
    this.data = data;
  }
  /** Field errors, flattened to one message per field. */
  get fields(): Record<string, string> {
    const out: Record<string, string> = {};
    if (this.data && typeof this.data === "object" && !Array.isArray(this.data)) {
      for (const [key, value] of Object.entries(this.data as Record<string, unknown>)) {
        if (key !== "detail") out[key] = describeError(value);
      }
    }
    return out;
  }
}

/** Plain-language messages for errors that carry no useful text of their own. */
function friendly(status: number, text: string): string {
  if (text && !text.trimStart().startsWith("<")) return text;
  if (status === 0) return "Could not reach the server. Check your internet connection and the server address, then try again.";
  if (status === 400) return "The server turned this request down. If you just changed the server address, check DJANGO_ALLOWED_HOSTS includes it.";
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) return "We couldn't find that. It may have been removed.";
  if (status === 413) return "That file is too large.";
  if (status === 429) return "Too many attempts. Please wait a minute and try again.";
  if (status >= 500) return "Something went wrong on our side. Please try again in a moment.";
  return `Request failed (${status}).`;
}

function describeError(data: unknown): string {
  if (data == null) return "";
  if (typeof data === "string") return data;
  if (Array.isArray(data)) return data.map(describeError).filter(Boolean).join(" ");
  if (typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if ("detail" in obj) return describeError(obj.detail);
    return Object.entries(obj)
      .map(([k, v]) => (k === "non_field_errors" ? describeError(v) : `${k.replaceAll("_", " ")}: ${describeError(v)}`))
      .join(" ");
  }
  return String(data);
}

export function errorMessage(e: unknown, fallback = "Could not reach the server. Check your connection and try again.") {
  return e instanceof ApiError ? e.message : e instanceof Error && e.message ? e.message : fallback;
}

// The session lives in memory for fast, synchronous reads; it is saved with
// the tokens in the device's secure store and the profile in AsyncStorage.
let session: Session | null = null;
let school: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export const storage = {
  session: () => session,
  school: () => school,
  async load() {
    try {
      const [tokens, profile, sub] = await Promise.all([
        SecureStore.getItemAsync(TOKENS_KEY),
        AsyncStorage.getItem(PROFILE_KEY),
        AsyncStorage.getItem(SCHOOL_KEY),
      ]);
      if (tokens && profile) session = { ...JSON.parse(profile), ...JSON.parse(tokens) };
      school = sub;
    } catch {
      session = null;
    }
  },
  setSession(s: Session | null) {
    session = s;
    if (s) {
      const { access, refresh, ...profile } = s;
      SecureStore.setItemAsync(TOKENS_KEY, JSON.stringify({ access, refresh })).catch(() => {});
      AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile)).catch(() => {});
    } else {
      SecureStore.deleteItemAsync(TOKENS_KEY).catch(() => {});
      AsyncStorage.removeItem(PROFILE_KEY).catch(() => {});
    }
  },
  setSchool(sub: string | null) {
    school = sub;
    (sub ? AsyncStorage.setItem(SCHOOL_KEY, sub) : AsyncStorage.removeItem(SCHOOL_KEY)).catch(() => {});
  },
  /** Called when the login ends on the server (for example, the refresh token expired). */
  onExpired(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};

let refreshing: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const s = storage.session();
  if (!s) return false;
  refreshing ??= (async () => {
    const res = await fetch(apiUrl("auth/refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ refresh: s.refresh }),
    }).catch(() => null);
    if (!res?.ok) return false;
    const data = await res.json();
    storage.setSession({ ...s, access: data.access, refresh: data.refresh ?? s.refresh });
    return true;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

type Options = { method?: string; body?: unknown; school?: string | null; auth?: boolean; signal?: AbortSignal };

/** Headers that prove who is asking, for downloads made outside api(). */
export function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (session) h.Authorization = `Bearer ${session.access}`;
  if (school) h["X-School"] = school;
  return h;
}

export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const { method = "GET", body, auth = true } = opts;
  const sub = opts.school === undefined ? storage.school() : opts.school;

  const send = () => {
    const headers: Record<string, string> = { Accept: "application/json" };
    const s = storage.session();
    if (auth && s) headers.Authorization = `Bearer ${s.access}`;
    if (sub) headers["X-School"] = sub;
    let payload: BodyInit | undefined;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    return fetch(apiUrl(path), { method, headers, body: payload, signal: opts.signal });
  };

  let res: Response;
  try {
    res = await send();
    if (res.status === 401 && auth && storage.session() && (await refreshTokens())) res = await send();
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw e;
    throw new ApiError(0, null);
  }
  if (res.status === 401 && auth && storage.session()) {
    storage.setSession(null);
    emit();
  }
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
