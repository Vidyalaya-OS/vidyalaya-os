"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type ThemeChoice = "system" | "light" | "dark";

const KEY = "vidyalaya.theme";

/** Runs before the page paints, so a dark-mode user never sees a white flash.
 * It first moves anything saved under the old "sms." prefix (from before the
 * rename to Vidyalaya OS) to "vidyalaya.", so nobody is signed out or loses
 * their theme, chosen child or quiz drafts. */
export const THEME_SCRIPT = `(function(){try{for(var i=localStorage.length-1;i>=0;i--){var k=localStorage.key(i);if(k&&k.indexOf("sms.")===0){var n="vidyalaya."+k.slice(4);if(localStorage.getItem(n)===null)localStorage.setItem(n,localStorage.getItem(k));localStorage.removeItem(k)}}}catch(e){}try{var c=localStorage.getItem("${KEY}");var d=c==="dark"||((!c||c==="system")&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light"}catch(e){document.documentElement.dataset.theme="light"}})()`;

type Ctx = { choice: ThemeChoice; resolved: "light" | "dark"; setChoice: (c: ThemeChoice) => void };

const ThemeContext = createContext<Ctx | null>(null);

function systemDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function apply(choice: ThemeChoice): "light" | "dark" {
  const resolved = choice === "dark" || (choice === "system" && systemDark()) ? "dark" : "light";
  document.documentElement.dataset.theme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "dark" ? "#0b1018" : "#2f5bea");
  return resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  useEffect(() => {
    let saved: ThemeChoice = "system";
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw === "light" || raw === "dark") saved = raw;
    } catch {
      // Storage blocked: follow the system setting.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChoiceState(saved);
    setResolved(apply(saved));
  }, []);

  useEffect(() => {
    if (choice !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setResolved(apply("system"));
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [choice]);

  const setChoice = useCallback((c: ThemeChoice) => {
    try {
      if (c === "system") window.localStorage.removeItem(KEY);
      else window.localStorage.setItem(KEY, c);
    } catch {
      // The choice then lasts for this visit only.
    }
    setChoiceState(c);
    setResolved(apply(c));
  }, []);

  return <ThemeContext.Provider value={{ choice, resolved, setChoice }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
