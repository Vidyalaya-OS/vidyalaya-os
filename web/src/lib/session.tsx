"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, Membership, Role, Session, storage, User } from "./api";
import { clearApiCache } from "./useApi";

type Ctx = {
  ready: boolean;
  user: User | null;
  memberships: Membership[];
  school: Membership | null;
  roles: Role[];
  /** The portal being shown: one of the person's roles. The menu and home
   * screen follow it, so an admin sees admin sections only. */
  portal: Role | null;
  setPortal: (role: Role) => void;
  hasRole: (...roles: Role[]) => boolean;
  signIn: (session: Session) => void;
  signOut: () => Promise<void>;
  chooseSchool: (subdomain: string | null) => void;
  reload: () => Promise<void>;
};

const PORTAL_KEY = "vidyalaya.homeView";

const SessionContext = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [subdomain, setSubdomain] = useState<string | null>(null);
  const [savedPortal, setSavedPortal] = useState<Role | null>(null);

  useEffect(() => {
    // Read the stored login once, on the client.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSession(storage.session());
    setSubdomain(storage.school());
    try {
      setSavedPortal(window.localStorage.getItem(PORTAL_KEY) as Role | null);
    } catch {
      // No storage: start on the first role.
    }
    setReady(true);
  }, []);

  const signIn = useCallback((s: Session) => {
    clearApiCache();
    storage.setSession(s);
    setSession(s);
    const only = s.memberships.length === 1 && !s.user.is_platform_owner ? s.memberships[0].school.subdomain : null;
    storage.setSchool(only);
    setSubdomain(only);
  }, []);

  const signOut = useCallback(async () => {
    const s = storage.session();
    if (s) await api("auth/logout", { method: "POST", body: { refresh: s.refresh }, school: null }).catch(() => {});
    clearApiCache();
    storage.setSession(null);
    storage.setSchool(null);
    setSession(null);
    setSubdomain(null);
  }, []);

  const chooseSchool = useCallback((sub: string | null) => {
    clearApiCache();
    storage.setSchool(sub);
    setSubdomain(sub);
  }, []);

  const reload = useCallback(async () => {
    const s = storage.session();
    if (!s) return;
    const me = await api<{ user: User; memberships: Membership[] }>("auth/me", { school: null });
    const next = { ...s, user: me.user, memberships: me.memberships };
    storage.setSession(next);
    setSession(next);
  }, []);

  const setPortal = useCallback((role: Role) => {
    setSavedPortal(role);
    try {
      window.localStorage.setItem(PORTAL_KEY, role);
    } catch {
      // Remembered for this visit only.
    }
  }, []);

  const value = useMemo<Ctx>(() => {
    const memberships = session?.memberships ?? [];
    const school = memberships.find((m) => m.school.subdomain === subdomain) ?? null;
    const roles = school?.roles ?? [];
    return {
      ready,
      user: session?.user ?? null,
      memberships,
      school,
      roles,
      portal: savedPortal && roles.includes(savedPortal) ? savedPortal : (roles[0] ?? null),
      setPortal,
      hasRole: (...want: Role[]) => want.some((r) => roles.includes(r)),
      signIn,
      signOut,
      chooseSchool,
      reload,
    };
  }, [ready, session, subdomain, savedPortal, setPortal, signIn, signOut, chooseSchool, reload]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: "School admin",
  teacher: "Teacher",
  student: "Student",
  parent: "Parent",
};
