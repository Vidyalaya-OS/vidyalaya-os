"use client";

import { useState } from "react";
import { ApiError } from "./api";

/** Form state plus server-side error handling for one submit action. */
export function useForm<T extends Record<string, string | boolean>>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const bind = (key: keyof T & string) => ({
    value: String(values[key] ?? ""),
    error: errors[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setValues((v) => ({ ...v, [key]: e.target.value })),
  });

  const submit = (fn: (values: T) => Promise<unknown>, onDone?: () => void) => async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setErrors({});
    setError(null);
    try {
      await fn(values);
      setValues(initial);
      onDone?.();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        setError(err.message);
      } else setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return { values, setValues, errors, error, busy, bind, submit };
}

/** Drop empty strings so optional fields are left out of the request. */
export function compact<T extends Record<string, unknown>>(obj: T) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== "" && v !== undefined)) as Partial<T>;
}
