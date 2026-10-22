"use client";

import { useState } from "react";
import { Badge, Empty, Loading, cx } from "@/components/ui";
import { api, ApiError, Page, storage } from "@/lib/api";
import { formatDate, todayIso } from "@/lib/format";
import { Homework } from "@/lib/types";
import { rows, useApi } from "@/lib/useApi";

/** Download an attachment with the login token (files are never public). */
export async function download(url: string, name: string) {
  const session = storage.session();
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${session?.access ?? ""}`, "X-School": storage.school() ?? "" },
  });
  if (!res.ok) throw new Error("Could not download the file.");
  const blob = await res.blob();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function HomeworkList({
  query,
  canMarkDone,
  actions,
}: {
  query: string;
  canMarkDone?: boolean;
  actions?: (h: Homework, reload: () => void) => React.ReactNode;
}) {
  const list = useApi<Page<Homework>>(`homework/?${query}`);
  const [error, setError] = useState<string | null>(null);
  const today = todayIso();

  const toggle = async (h: Homework) => {
    try {
      await api(`homework/${h.id}/done/`, { method: h.done ? "DELETE" : "POST" });
      list.reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update.");
    }
  };

  if (list.error) return <p className="text-sm text-red-600">{list.error}</p>;
  if (!list.data) return <Loading />;
  const items = rows(list.data);
  if (items.length === 0) return <Empty>No homework here.</Empty>;
  return (
    <>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <ul className="space-y-3">
        {items.map((h) => {
          const overdue = h.due_date < today && !h.done;
          return (
            <li key={h.id} className={cx("rounded-lg border border-line p-3 text-sm", h.done && "opacity-70")}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium">{h.title}</div>
                  <div className="text-xs text-soft">{h.subject_name} · {h.section_name}{h.teacher_name ? ` · ${h.teacher_name}` : ""}</div>
                </div>
                <div className="flex items-center gap-2">
                  {h.done ? <Badge tone="good">Done</Badge> : overdue ? <Badge tone="bad">Overdue</Badge> : null}
                  <Badge tone={h.due_date === today ? "warn" : "neutral"}>Due {h.due_date === today ? "today" : formatDate(h.due_date)}</Badge>
                </div>
              </div>
              {h.instructions && <p className="mt-2 whitespace-pre-line">{h.instructions}</p>}
              {h.attachments.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {h.attachments.map((a) => (
                    <li key={a.id}>
                      <button className="rounded border border-line px-2 py-1 text-xs text-brand" onClick={() => download(a.url, a.name).catch((e) => setError(e.message))}>
                        📎 {a.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                {h.done_count != null && <span className="text-soft">{h.done_count} marked done</span>}
                {canMarkDone && (
                  <button className="font-medium text-brand" onClick={() => toggle(h)}>{h.done ? "Mark as not done" : "Mark as done"}</button>
                )}
                {actions?.(h, list.reload)}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
