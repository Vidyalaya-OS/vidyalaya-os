import type { Page } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { Section, Teacher } from "@/lib/types";
import { rows, useApi } from "@/lib/useApi";

/** Sections the user works with: every current section for an admin, the
 * sections a teacher teaches or is class teacher of. Follows the portal, so
 * an admin who also teaches sees only their own sections as a teacher. */
export function useStaffSections() {
  const { portal, hasRole } = useSession();
  const isAdmin = portal === "admin";
  const sections = useApi<Page<Section>>(isAdmin ? "sections/" : null);
  const me = useApi<Page<Teacher>>(!isAdmin && hasRole("teacher") ? "teachers/?mine=true" : null);
  if (isAdmin) return rows(sections.data).map((s) => ({ id: s.id, name: s.display_name }));
  const t = rows(me.data)[0];
  if (!t) return [];
  const seen = new Map<string, string>();
  for (const c of t.class_teacher_of) seen.set(c.section, c.section_name);
  for (const x of t.teaches) seen.set(x.section, x.section_name);
  return [...seen].map(([id, name]) => ({ id, name }));
}
