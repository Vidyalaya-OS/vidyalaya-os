import { useRef, useState } from "react";
import { ApiError } from "./api";

/** Form state plus server-side error handling for one submit action, like
 * the web's useForm. Field errors from the API show under their own field
 * and clear as soon as it is edited; others show at the top. */
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

  const set = (key: keyof T & string, value: string | boolean) => {
    setValues((v) => ({ ...v, [key]: value }));
    clearError(key);
  };

  /** Props for a text Field or a Select. */
  const bind = (key: keyof T & string) => ({
    value: String(values[key] ?? ""),
    error: errors[key],
    onChangeText: (text: string) => set(key, text),
  });

  const submit = (fn: (values: T) => Promise<unknown>, onDone?: () => void) => async () => {
    // A double tap must not send the form twice.
    if (busyRef.current) return;
    busyRef.current = true;
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
      } else setError("Could not reach the server. Check your connection and try again.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return { values, setValues, set, errors, setErrors, error, setError, busy, bind, submit };
}

/** Drop empty strings so optional fields are left out of the request. */
export function compact<T extends Record<string, unknown>>(obj: T) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== "" && v !== undefined)) as Partial<T>;
}
