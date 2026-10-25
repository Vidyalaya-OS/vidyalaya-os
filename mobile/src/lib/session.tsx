import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, Home, Membership, Role, Session, storage, User } from "./api";
import { loadServer } from "./server";
import { clearApiCache } from "./useApi";

type Ctx = {
  ready: boolean;
  /** True after the server ended the login (shown once on the sign-in screen). */
  expired: boolean;
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
  const [expired, setExpired] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [subdomain, setSubdomain] = useState<string | null>(null);
  const [savedPortal, setSavedPortal] = useState<Role | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([storage.load(), loadServer(), AsyncStorage.getItem(PORTAL_KEY).catch(() => null)]).then(([, , portal]) => {
      if (!live) return;
      setSession(storage.session());
      setSubdomain(storage.school());
      setSavedPortal(portal as Role | null);
      setReady(true);
    });
    const off = storage.onExpired(() => {
      clearApiCache();
      setSession(null);
      setExpired(true);
    });
    return () => {
      live = false;
      off();
    };
  }, []);

  const signIn = useCallback((s: Session) => {
    clearApiCache();
    storage.setSession(s);
    setSession(s);
    setExpired(false);
    // Open the school and portal the API picked for this login, so an admin
    // lands in the admin portal, a parent in the parent portal, and so on.
    const home = s.home;
    const only = home ? (home.kind === "school" ? home.school : null)
      : s.memberships.length === 1 && !s.user.is_platform_owner ? s.memberships[0].school.subdomain : null;
    storage.setSchool(only);
    setSubdomain(only);
    if (home?.role) {
      setSavedPortal(home.role);
      AsyncStorage.setItem(PORTAL_KEY, home.role).catch(() => {});
    }
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
    const me = await api<{ user: User; memberships: Membership[]; home?: Home }>("auth/me", { school: null });
    const next = { ...s, user: me.user, memberships: me.memberships, home: me.home };
    storage.setSession(next);
    setSession(next);
  }, []);

  const setPortal = useCallback((role: Role) => {
    setSavedPortal(role);
    AsyncStorage.setItem(PORTAL_KEY, role).catch(() => {});
  }, []);

  const value = useMemo<Ctx>(() => {
    const memberships = session?.memberships ?? [];
    const school = memberships.find((m) => m.school.subdomain === subdomain) ?? null;
    const roles = school?.roles ?? [];
    return {
      ready,
      expired,
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
  }, [ready, expired, session, subdomain, savedPortal, setPortal, signIn, signOut, chooseSchool, reload]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}

/** The first screen for a login: the platform for the owner, the school
 * portal for someone in one school, otherwise the school picker. */
export function homePath(s: Session): "/platform" | "/app" | "/choose-school" {
  const kind = s.home?.kind
    ?? (s.user.is_platform_owner && s.memberships.length === 0 ? "platform"
      : s.memberships.length === 1 && !s.user.is_platform_owner ? "school" : "choose_school");
  if (kind === "platform") return "/platform";
  if (kind === "school") return "/app";
  return "/choose-school";
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: "School admin",
  teacher: "Teacher",
  student: "Student",
  parent: "Parent",
};

export const SHORT_LABELS: Record<Role, string> = { admin: "Admin", teacher: "Teacher", student: "Student", parent: "Parent" };
