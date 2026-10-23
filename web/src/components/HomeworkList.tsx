"use client";

import { BookOpen, Check, Paperclip } from "lucide-react";
import { useToast } from "@/components/toast";
import { Badge, Empty, ErrorState, Loading, cx } from "@/components/ui";
import { api, Page, storage } from "@/lib/api";
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
  const toast = useToast();
  const today = todayIso();

  const toggle = async (h: Homework) => {
    // Show the change at once; put it back if the server says no.
    const flip = (done: boolean) => list.setData(list.data ? { ...list.data, results: rows(list.data).map((x) => (x.id === h.id ? { ...x, done } : x)) } : null);
    flip(!h.done);
    try {
      await api(`homework/${h.id}/done/`, { method: h.done ? "DELETE" : "POST" });
      if (!h.done) toast.success(`Marked "${h.title}" as done.`);
    } catch (e) {
      flip(Boolean(h.done));
      toast.error(e, "Could not update. Try again.");
    }
  };

  if (list.error && !list.data) return <ErrorState message={list.error} onRetry={list.reload} />;
  if (!list.data) return <Loading />;
  const items = rows(list.data);
  if (items.length === 0) return <Empty icon={<BookOpen aria-hidden />} title="No homework here">New homework shows up here as soon as a teacher posts it.</Empty>;
  return (
    <>
      <ul className="stagger space-y-3">
        {items.map((h) => {
          const overdue = h.due_date < today && !h.done;
          return (
            <li key={h.id} className={cx("rounded-xl border border-line bg-surface p-4 text-sm transition duration-300", h.done && "bg-muted/40", overdue && "border-l-4 border-l-red-500")}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className={cx("font-semibold", h.done && "text-soft line-through decoration-soft/60")}>{h.title}</div>
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
                      <button className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-medium text-brand transition hover:border-brand/40 hover:bg-brand-soft" onClick={() => download(a.url, a.name).catch((e) => toast.error(e.message))}>
                        <Paperclip className="size-3.5" aria-hidden /> {a.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                {h.done_count != null && <span className="text-soft">{h.done_count} marked done</span>}
                {canMarkDone && (
                  <button
                    onClick={() => toggle(h)}
                    aria-pressed={Boolean(h.done)}
                    className={cx(
                      "inline-flex min-h-9 items-center gap-2 rounded-xl px-3 font-medium transition active:scale-95",
                      h.done ? "bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-950 dark:text-green-300" : "border border-line text-ink hover:border-brand hover:text-brand",
                    )}
                  >
                    <span className={cx("flex size-4 items-center justify-center rounded border transition", h.done ? "border-green-600 bg-green-600 text-white" : "border-soft")}>
                      {h.done && <Check className="size-3 animate-pop" aria-hidden />}
                    </span>
                    {h.done ? "Done" : "Mark as done"}
                  </button>
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
