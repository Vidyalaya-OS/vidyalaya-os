"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useDialog } from "@/components/dialog";
import { useToast } from "@/components/toast";
import { Alert, Badge, Button, Card, ErrorState, Loading, PageHeader, Progress, StickyBar, cx } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { formatDate, num } from "@/lib/format";
import { useSession } from "@/lib/session";
import { Exam, MarkRow } from "@/lib/types";
import { useApi } from "@/lib/useApi";

type Sheet = { exam: Exam; locked: boolean; rows: MarkRow[]; class_average: number | null; highest: string | null };
type Draft = Record<string, { marks: string; absent: boolean; remark: string }>;

export default function MarksPage() {
  const { id } = useParams<{ id: string }>();
  const { hasRole } = useSession();
  const sheet = useApi<Sheet>(`exams/${id}/marks/`);
  const [draft, setDraft] = useState<Draft>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const toast = useToast();
  const dialog = useDialog();
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(Object.fromEntries((sheet.data?.rows ?? []).map((r) => [r.enrollment, { marks: r.marks_obtained == null ? "" : num(r.marks_obtained), absent: r.is_absent, remark: r.remark }])));
  }, [sheet.data]);

  if (sheet.error && !sheet.data) return <ErrorState message={sheet.error} onRetry={sheet.reload} />;
  if (!sheet.data) return <Loading variant="table" rows={8} />;
  const { exam, locked } = sheet.data;
  const max = Number(exam.max_marks);

  const save = async () => {
    // Catch obvious slips here instead of a round trip to the server.
    const bad = Object.entries(draft).filter(([, d]) => !d.absent && d.marks !== "" && (Number(d.marks) < 0 || Number(d.marks) > max || Number.isNaN(Number(d.marks))));
    if (bad.length) {
      setNotice(`${bad.length} mark${bad.length === 1 ? " is" : "s are"} outside 0 to ${num(exam.max_marks)}. They are shown in red.`);
      return;
    }
    setBusy(true);
    setNotice(null);
    setRowErrors({});
    try {
      const rows = Object.entries(draft).map(([enrollment, d]) => ({
        enrollment, marks_obtained: d.absent || d.marks === "" ? null : d.marks, is_absent: d.absent, remark: d.remark,
      }));
      sheet.setData(await api<Sheet>(`exams/${id}/marks/`, { method: "PUT", body: { rows } }));
      toast.success("Marks saved.");
    } catch (e) {
      if (e instanceof ApiError) {
        const rowsErr = (e.data as { rows?: Record<string, string> })?.rows;
        if (rowsErr && typeof rowsErr === "object" && !Array.isArray(rowsErr)) setRowErrors(rowsErr);
        if (rowsErr) setNotice("Some marks need fixing. They are shown in red.");
        else toast.error(e);
      } else toast.error("Could not save the marks.");
    } finally {
      setBusy(false);
    }
  };

  const publish = async (allow = false) => {
    try {
      await api(`exams/${id}/publish/`, { method: "POST", body: { allow_missing: allow } });
      sheet.reload();
      toast.success("Published. Students and parents can see these results now.");
    } catch (e) {
      const missing = e instanceof ApiError ? (e.data as { missing?: string[] })?.missing : undefined;
      if (missing) {
        const ok = await dialog.confirm({ title: "Some marks are missing", body: `${missing.length} mark${missing.length === 1 ? " is" : "s are"} not entered yet. Publish anyway?`, confirmLabel: "Publish anyway" });
        if (ok) return publish(true);
      } else toast.error(e, "Could not publish.");
    }
  };

  const set = (enrollment: string, patch: Partial<Draft[string]>) => setDraft((d) => ({ ...d, [enrollment]: { ...d[enrollment], ...patch } }));

  return (
    <>
      <PageHeader
        back={{ href: "/app/exams", label: "Tests & marks" }}
        title={`${exam.subject_name} · ${exam.section_name}`}
        subtitle={`${exam.exam_term_name} · out of ${num(exam.max_marks)}${exam.pass_marks ? `, pass ${num(exam.pass_marks)}` : ""}${exam.date ? ` · ${formatDate(exam.date)}` : ""}`}
        actions={<Badge tone={locked ? "good" : "warn"}>{locked ? "Published, marks locked" : "Entering marks"}</Badge>}
      />
      {notice && <div className="mb-4"><Alert>{notice}</Alert></div>}
      <Card actions={<span className="text-sm text-soft">Class average {sheet.data.class_average ?? "-"} · Highest {num(sheet.data.highest)}</span>} title="Marks"
        description={`${Object.values(draft).filter((d) => d.absent || d.marks !== "").length} of ${sheet.data.rows.length} entered`}>
        <Progress value={sheet.data.rows.length ? (Object.values(draft).filter((d) => d.absent || d.marks !== "").length / sheet.data.rows.length) * 100 : 0} className="mb-4" label="Marks entered" />
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
          {sheet.data.rows.map((r) => {
            const d = draft[r.enrollment] ?? { marks: "", absent: false, remark: "" };
            const over = d.marks !== "" && (Number(d.marks) > max || Number(d.marks) < 0);
            return (
              <li key={r.enrollment} className={cx("flex flex-wrap items-center gap-3 px-3 py-2.5 transition-colors", (rowErrors[r.enrollment] || over) && "bg-red-50/60 dark:bg-red-950/30")}>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{r.roll_no ? `${r.roll_no}. ` : ""}{r.name}</div>
                  {(rowErrors[r.enrollment] || over) && <div className="text-xs font-medium text-red-600 dark:text-red-400" role="alert">{rowErrors[r.enrollment] ?? (Number(d.marks) < 0 ? "Can't be below 0" : `Above ${num(exam.max_marks)}`)}</div>}
                </div>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={max}
                  step="0.5"
                  disabled={locked || d.absent}
                  value={d.absent ? "" : d.marks}
                  onChange={(e) => set(r.enrollment, { marks: e.target.value })}
                  onKeyDown={(e) => {
                    // Enter moves down the list, like a spreadsheet.
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    const all = [...document.querySelectorAll<HTMLInputElement>("input[data-marks]:not(:disabled)")];
                    all[all.indexOf(e.currentTarget) + 1]?.focus();
                  }}
                  data-marks
                  aria-label={`Marks for ${r.name}`}
                  className={cx("h-11 w-24 rounded-xl border bg-surface px-3 text-right text-base tabular-nums outline-none transition focus:border-brand focus:ring-4 focus:ring-[var(--ring)] disabled:bg-muted sm:text-sm", over || rowErrors[r.enrollment] ? "border-red-500" : "border-line")}
                />
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4 accent-[var(--brand)]" disabled={locked} checked={d.absent} onChange={(e) => set(r.enrollment, { absent: e.target.checked })} /> Absent
                </label>
              </li>
            );
          })}
        </ul>
        {!locked && (
          <StickyBar>
            <Button onClick={save} busy={busy}>Save marks</Button>
            {hasRole("admin") && <Button variant="secondary" onClick={() => publish()}>Publish results</Button>}
          </StickyBar>
        )}
      </Card>
    </>
  );
}
