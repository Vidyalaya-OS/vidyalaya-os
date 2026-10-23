"use client";

import { useEffect, useState } from "react";
import { api } from "./api";

// Public settings from the API (GET /api/config): the lists shown in forms,
// and the demo logins while developing. The defaults below are used until
// the API answers, or if it can't be reached, so forms always work.

export type AppConfig = {
  app_name: string;
  plans: { key: string; label: string; description: string }[];
  boards: string[];
  timezones: string[];
  currencies: { code: string; name: string }[];
  reserved_subdomains: string[];
  payment_modes: { key: string; label: string }[];
  invite_valid_days: number;
  login_code: { digits: number; valid_minutes: number; roles: string[] };
  demo: { password: string; logins: { role: string; label: string; email: string }[] } | null;
};

export const DEFAULT_CONFIG: AppConfig = {
  app_name: "Vidyalaya OS",
  plans: [
    { key: "trial", label: "Trial", description: "Try every feature free while the school sets up." },
    { key: "standard", label: "Standard", description: "Attendance, homework, tests, report cards and fees." },
    { key: "premium", label: "Premium", description: "Everything in Standard, plus priority support." },
  ],
  boards: ["CBSE", "ICSE", "State board", "IB", "Cambridge"],
  timezones: ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York", "UTC"],
  currencies: [
    { code: "INR", name: "Indian rupee" },
    { code: "AED", name: "UAE dirham" },
    { code: "SGD", name: "Singapore dollar" },
    { code: "GBP", name: "Pound sterling" },
    { code: "USD", name: "US dollar" },
    { code: "EUR", name: "Euro" },
  ],
  reserved_subdomains: ["admin", "api", "app", "mail", "media", "platform", "static", "www"],
  payment_modes: [
    { key: "cash", label: "Cash" },
    { key: "cheque", label: "Cheque" },
    { key: "bank_transfer", label: "Bank transfer" },
    { key: "online", label: "Online" },
    { key: "other", label: "Other" },
  ],
  invite_valid_days: 7,
  login_code: { digits: 6, valid_minutes: 10, roles: ["parent"] },
  demo: null,
};

let cached: AppConfig | null = null;
let pending: Promise<AppConfig> | null = null;

function load() {
  pending ??= api<AppConfig>("config", { auth: false, school: null })
    .then((c) => (cached = { ...DEFAULT_CONFIG, ...c }))
    .catch(() => {
      pending = null;
      return DEFAULT_CONFIG;
    });
  return pending;
}

/** The app config: defaults at first, then the API's answer (fetched once). */
export function useAppConfig() {
  const [config, setConfig] = useState<AppConfig>(cached ?? DEFAULT_CONFIG);
  useEffect(() => {
    if (cached) return;
    let live = true;
    load().then((c) => live && setConfig(c));
    return () => {
      live = false;
    };
  }, []);
  return config;
}
