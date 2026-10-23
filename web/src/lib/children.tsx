"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Page } from "./api";
import { useSession } from "./session";
import { Student } from "./types";
import { rows, useApi } from "./useApi";

type Ctx = {
  /** The student themself, or a parent's children. */
  list: Student[];
  chosen: Student | null;
  choose: (id: string) => void;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

const ChildrenContext = createContext<Ctx | null>(null);
const KEY = "vidyalaya.child";

/** Which student the "your record" screens are about. A parent's choice of
 * child is shared by every screen and remembered on this device. */
export function ChildrenProvider({ children }: { children: React.ReactNode }) {
  const { hasRole, user } = useSession();
  const isParent = hasRole("parent");
  const isStudent = hasRole("student");
  const kids = useApi<Student[]>(isParent ? "my-children" : null);
  const self = useApi<Page<Student>>(isStudent && !isParent ? "students/" : null);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPicked(window.localStorage.getItem(KEY));
    } catch {
      // No storage: start from the first child.
    }
  }, []);

  const value = useMemo<Ctx>(() => {
    const own = rows(self.data).filter((s) => s.user_id === user?.id);
    const list = isParent ? kids.data ?? [] : own;
    const chosen = list.find((s) => s.id === picked) ?? list[0] ?? null;
    const src = isParent ? kids : self;
    return {
      list,
      chosen,
      choose: (id: string) => {
        setPicked(id);
        try {
          window.localStorage.setItem(KEY, id);
        } catch {
          // The choice lasts for this visit only.
        }
      },
      loading: src.loading && !src.data,
      error: src.error,
      reload: src.reload,
    };
  }, [isParent, kids, self, picked, user]);

  return <ChildrenContext.Provider value={value}>{children}</ChildrenContext.Provider>;
}

export function useChildren() {
  const ctx = useContext(ChildrenContext);
  if (!ctx) throw new Error("useChildren must be used inside ChildrenProvider");
  return ctx;
}
