// A small client for the Django API. It keeps the login tokens, adds the
// chosen school to every request (X-School) and refreshes expired tokens.

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

const STORAGE_KEY = "vidyalaya.session";
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
  // An HTML error page (a proxy or crash page) is not something to show people.
  if (text && !text.trimStart().startsWith("<")) return text;
  if (status === 0) return "Could not reach the server. Check your internet connection and try again.";
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

function read<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable (private mode); the session then lasts for this tab only.
  }
}

export const storage = {
  session: () => read<Session>(STORAGE_KEY),
  setSession: (s: Session | null) => write(STORAGE_KEY, s),
  school: () => read<string>(SCHOOL_KEY),
  setSchool: (subdomain: string | null) => write(SCHOOL_KEY, subdomain),
};

let refreshing: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const session = storage.session();
  if (!session) return false;
  refreshing ??= (async () => {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh: session.refresh }),
    }).catch(() => null);
    if (!res?.ok) return false;
    const data = await res.json();
    storage.setSession({ ...session, access: data.access, refresh: data.refresh ?? session.refresh });
    return true;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

type Options = { method?: string; body?: unknown; school?: string | null; auth?: boolean; signal?: AbortSignal };

export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const { method = "GET", body, auth = true } = opts;
  const school = opts.school === undefined ? storage.school() : opts.school;

  const send = () => {
    const headers: Record<string, string> = { Accept: "application/json" };
    const session = storage.session();
    if (auth && session) headers.Authorization = `Bearer ${session.access}`;
    if (school) headers["X-School"] = school;
    let payload: BodyInit | undefined;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    return fetch(`/api/${path.replace(/^\//, "")}`, { method, headers, body: payload, signal: opts.signal });
  };

  let res: Response;
  try {
    res = await send();
    if (res.status === 401 && auth && (await refreshTokens())) res = await send();
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError(0, null);
  }
  if (res.status === 401 && auth) {
    storage.setSession(null);
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      // Outside React, so no router here; a full reload also clears in-memory state.
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = `/login?expired=1&next=${next}`;
    }
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

/** List endpoints are paginated; this returns all rows of the first page set. */
export async function list<T>(path: string): Promise<T[]> {
  const data = await api<Page<T> | T[]>(path);
  return Array.isArray(data) ? data : data.results;
}
