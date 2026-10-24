import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, storage } from "./api";

// Recent responses, so going back to a screen shows it at once while it
// refreshes in the background. Keyed by school, and cleared on sign-out and
// when the school changes.
const cache = new Map<string, { at: number; data: unknown }>();
const MAX_AGE = 5 * 60 * 1000;

export function clearApiCache() {
  cache.clear();
}

function cacheKey(path: string) {
  return `${storage.school() ?? ""}|${path}`;
}

/** Load an API path and re-load it on demand. A newer request always wins over
 * an older one still in flight (for example while typing in a search box). */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(() => {
    if (!path) return null;
    const hit = cache.get(cacheKey(path));
    return hit && Date.now() - hit.at < MAX_AGE ? (hit.data as T) : null;
  });
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const current = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!path) {
      setLoading(false);
      return;
    }
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    const key = cacheKey(path);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < MAX_AGE) setData(hit.data as T);
    setLoading(true);
    try {
      const result = await api<T>(path, { signal: controller.signal });
      if (controller.signal.aborted) return;
      cache.set(key, { at: Date.now(), data: result });
      setData(result);
      setError(null);
      setStatus(null);
    } catch (e) {
      if (controller.signal.aborted || (e instanceof Error && e.name === "AbortError")) return;
      setError(e instanceof ApiError ? e.message : "Could not reach the server. Check your internet connection and try again.");
      setStatus(e instanceof ApiError ? e.status : 0);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    return () => current.current?.abort();
  }, [load]);

  const set = useCallback((value: T | null) => {
    if (path && value != null) cache.set(cacheKey(path), { at: Date.now(), data: value });
    setData(value);
  }, [path]);

  return { data, error, status, loading, reload: load, setData: set };
}

export function rows<T>(data: { results: T[] } | T[] | null): T[] {
  if (!data) return [];
  return Array.isArray(data) ? data : data.results;
}

/** The value, once it has stopped changing for a moment (for search boxes). */
export function useDebounced<T>(value: T, delay = 300) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return settled;
}
