"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "./api";

/** Load an API path and re-load it on demand. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));

  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return { data, error, loading, reload: load, setData };
}

export function rows<T>(data: { results: T[] } | T[] | null): T[] {
  if (!data) return [];
  return Array.isArray(data) ? data : data.results;
}
