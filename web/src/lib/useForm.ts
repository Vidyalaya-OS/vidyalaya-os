"use client";

import { useRef, useState } from "react";
import { ApiError } from "./api";

/** Form state plus server-side error handling for one submit action.
 *
 * Field errors from the API show under their own field and clear as soon as
 * the field is edited; only errors that belong to no field show at the top.
 * The first field with a problem is scrolled to and focused. */
export function useForm<T extends Record<string, string | boolean>>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const clearError = (key: string) =>
    setErrors((e) => {
      if (!(key in e)) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });

  const bind = (key: keyof T & string) => ({
    name: key,
    value: String(values[key] ?? ""),
    error: errors[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setValues((v) => ({ ...v, [key]: e.target.value }));
      clearError(key);
    },
  });

  const submit = (fn: (values: T) => Promise<unknown>, onDone?: () => void) => async (e?: React.FormEvent) => {
    e?.preventDefault();
    // A double click or a second Enter must not send the form twice.
    if (busyRef.current) return;
    busyRef.current = true;
    const form = e?.currentTarget instanceof HTMLFormElement ? e.currentTarget : null;
    setBusy(true);
    setErrors({});
    setError(null);
    try {
      await fn(values);
      setValues(initial);
      onDone?.();
    } catch (err) {
      if (err instanceof ApiError) {
        const fields = err.fields;
        const own = Object.keys(fields).filter((k) => k in initial);
        setErrors(fields);
        const rest = Object.entries(fields).filter(([k]) => !own.includes(k)).map(([k, v]) => (k === "non_field_errors" ? v : `${k.replaceAll("_", " ")}: ${v}`));
        setError(rest.length ? rest.join(" ") : own.length ? null : err.message);
        if (own.length && form) {
          const el = form.querySelector<HTMLElement>(`[name="${own[0]}"]`);
          el?.scrollIntoView({ block: "center", behavior: "smooth" });
          el?.focus({ preventScroll: true });
        }
      } else setError("Could not reach the server. Check your connection and try again.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return { values, setValues, errors, setErrors, error, busy, bind, submit };
}

/** Drop empty strings so optional fields are left out of the request. */
export function compact<T extends Record<string, unknown>>(obj: T) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== "" && v !== undefined)) as Partial<T>;
}
