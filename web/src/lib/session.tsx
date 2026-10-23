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
  hasRole: (...roles: Role[]) => boolean;
  signIn: (session: Session) => void;
  signOut: () => Promise<void>;
  chooseSchool: (subdomain: string | null) => void;
  reload: () => Promise<void>;
};

const SessionContext = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [subdomain, setSubdomain] = useState<string | null>(null);

  useEffect(() => {
    // Read the stored login once, on the client.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSession(storage.session());
    setSubdomain(storage.school());
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
      hasRole: (...want: Role[]) => want.some((r) => roles.includes(r)),
      signIn,
      signOut,
      chooseSchool,
      reload,
    };
  }, [ready, session, subdomain, signIn, signOut, chooseSchool, reload]);

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
