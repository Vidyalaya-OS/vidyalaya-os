"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Loading, PageHeader, cx } from "@/components/ui";
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
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(Object.fromEntries((sheet.data?.rows ?? []).map((r) => [r.enrollment, { marks: r.marks_obtained == null ? "" : num(r.marks_obtained), absent: r.is_absent, remark: r.remark }])));
  }, [sheet.data]);

  if (sheet.error) return <Alert>{sheet.error}</Alert>;
  if (!sheet.data) return <Loading />;
  const { exam, locked } = sheet.data;
  const max = Number(exam.max_marks);

  const save = async () => {
    setBusy(true);
    setNotice(null);
    setRowErrors({});
    try {
      const rows = Object.entries(draft).map(([enrollment, d]) => ({
        enrollment, marks_obtained: d.absent || d.marks === "" ? null : d.marks, is_absent: d.absent, remark: d.remark,
      }));
      sheet.setData(await api<Sheet>(`exams/${id}/marks/`, { method: "PUT", body: { rows } }));
      setNotice({ tone: "success", text: "Marks saved." });
    } catch (e) {
      if (e instanceof ApiError) {
        const rowsErr = (e.data as { rows?: Record<string, string> })?.rows;
        if (rowsErr && typeof rowsErr === "object" && !Array.isArray(rowsErr)) setRowErrors(rowsErr);
        setNotice({ tone: "error", text: rowsErr ? "Some marks need fixing (shown in red)." : e.message });
      } else setNotice({ tone: "error", text: "Could not save." });
    } finally {
      setBusy(false);
    }
  };

  const publish = async (allow = false) => {
    try {
      await api(`exams/${id}/publish/`, { method: "POST", body: { allow_missing: allow } });
      sheet.reload();
      setNotice({ tone: "success", text: "Published. Students and parents can see these results now." });
    } catch (e) {
      const missing = e instanceof ApiError ? (e.data as { missing?: string[] })?.missing : undefined;
      if (missing && confirm(`${missing.length} marks are missing. Publish anyway?`)) return publish(true);
      if (!missing) setNotice({ tone: "error", text: e instanceof ApiError ? e.message : "Could not publish." });
    }
  };

  const set = (enrollment: string, patch: Partial<Draft[string]>) => setDraft((d) => ({ ...d, [enrollment]: { ...d[enrollment], ...patch } }));

  return (
    <>
      <PageHeader
        title={`${exam.subject_name} · ${exam.section_name}`}
        subtitle={`${exam.exam_term_name} · out of ${num(exam.max_marks)}${exam.pass_marks ? `, pass ${num(exam.pass_marks)}` : ""}${exam.date ? ` · ${formatDate(exam.date)}` : ""}`}
        actions={<Badge tone={locked ? "good" : "warn"}>{locked ? "Published, marks locked" : "Entering marks"}</Badge>}
      />
      {notice && <div className="mb-4"><Alert tone={notice.tone}>{notice.text}</Alert></div>}
      <Card actions={<span className="text-sm text-soft">Class average {sheet.data.class_average ?? "-"} · Highest {num(sheet.data.highest)}</span>} title="Marks">
        <ul className="divide-y divide-line rounded-lg border border-line">
          {sheet.data.rows.map((r) => {
            const d = draft[r.enrollment] ?? { marks: "", absent: false, remark: "" };
            const over = d.marks !== "" && Number(d.marks) > max;
            return (
              <li key={r.enrollment} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{r.roll_no ? `${r.roll_no}. ` : ""}{r.name}</div>
                  {(rowErrors[r.enrollment] || over) && <div className="text-xs text-red-600">{rowErrors[r.enrollment] ?? `Above ${num(exam.max_marks)}`}</div>}
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
                  aria-label={`Marks for ${r.name}`}
                  className={cx("h-10 w-24 rounded-lg border bg-surface px-2 text-right text-base sm:text-sm", over || rowErrors[r.enrollment] ? "border-red-500" : "border-line")}
                />
                <label className="flex items-center gap-1 text-sm">
                  <input type="checkbox" disabled={locked} checked={d.absent} onChange={(e) => set(r.enrollment, { absent: e.target.checked })} /> Absent
                </label>
              </li>
            );
          })}
        </ul>
        {!locked && (
          <div className="sticky bottom-0 mt-4 flex flex-wrap gap-2 bg-surface py-2">
            <Button onClick={save} busy={busy}>Save marks</Button>
            {hasRole("admin") && <Button variant="secondary" onClick={() => publish()}>Publish results</Button>}
          </div>
        )}
      </Card>
    </>
  );
}
