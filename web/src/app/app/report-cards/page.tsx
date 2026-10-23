"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Award } from "lucide-react";
import { useDialog } from "@/components/dialog";
import { useStaffSections } from "@/components/sections";
import { useToast } from "@/components/toast";
import { Avatar, Badge, Button, Card, Empty, ErrorState, Loading, PageHeader, Select, StickyBar } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { num, pct } from "@/lib/format";
import { useSession } from "@/lib/session";
import { Exam, ExamTerm } from "@/lib/types";
import { useApi } from "@/lib/useApi";

type Row = { student: string; name: string; roll_no: number | null; total: string; total_max: string; percentage: number | null; grade: string | null; attendance: number | null; remarks: string; published_at: string | null };
type SectionCards = { exam_term: string; exam_term_name: string; section_name: string; rows: Row[]; exams: Exam[]; published: boolean };

export default function ReportCardsPage() {
  const { hasRole } = useSession();
  const isAdmin = hasRole("admin");
  const terms = useApi<ExamTerm[]>("exam-terms/");
  const sections = useStaffSections();
  const [term, setTerm] = useState("");
  const [section, setSection] = useState("");
  const t = term || terms.data?.[0]?.id || "";
  const s = section || sections[0]?.id || "";
  const cards = useApi<SectionCards>(t && s ? `report-cards/section?exam_term=${t}&section=${s}` : null);
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const toast = useToast();
  const dialog = useDialog();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRemarks(Object.fromEntries((cards.data?.rows ?? []).map((r) => [r.student, r.remarks])));
  }, [cards.data]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      cards.reload();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const saveRemarks = () => run(() => api("report-cards/remarks", {
    method: "PUT", body: { exam_term: t, section: s, rows: Object.entries(remarks).map(([student, r]) => ({ student, remarks: r })) },
  }), "Remarks saved.");

  const publish = async () => {
    try {
      setBusy(true);
      await api("report-cards/publish", { method: "POST", body: { exam_term: t, section: s } });
      toast.success("Published. Students and parents can see and print their report cards.");
      cards.reload();
    } catch (e) {
      const missing = e instanceof ApiError ? (e.data as { missing?: string[] })?.missing : undefined;
      if (missing) {
        const ok = await dialog.confirm({ title: "Some marks are missing", body: `${missing.length} mark${missing.length === 1 ? " is" : "s are"} not entered yet. Publish the report cards anyway?`, confirmLabel: "Publish anyway" });
        if (ok) await run(() => api("report-cards/publish", { method: "POST", body: { exam_term: t, section: s, allow_missing: true } }), "Report cards published.");
      } else toast.error(e, "Could not publish.");
    } finally {
      setBusy(false);
    }
  };

  const data = cards.data;
  const locked = Boolean(data?.rows.some((r) => r.published_at));

  return (
    <>
      <PageHeader title="Report cards" subtitle="A term's marks, attendance and remarks. Students and parents see them once published." />
      <Card title="Section report cards" icon={<Award aria-hidden />}>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Select label="Term" value={t} onChange={(e) => setTerm(e.target.value)}>
            {(terms.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
          <Select label="Section" value={s} onChange={(e) => setSection(e.target.value)}>
            {sections.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
          <div className="flex items-end">{data && <Badge tone={data.published ? "good" : "warn"}>{data.published ? "Published" : "Not published"}</Badge>}</div>
        </div>
        {terms.data?.length === 0 ? <Empty>Add an exam term under Tests &amp; marks first.</Empty> : !data ? (cards.error ? <ErrorState message={cards.error} onRetry={cards.reload} /> : <Loading rows={5} />) : (
          <>
            <p className="mb-3 text-sm text-soft">
              Tests: {data.exams.length === 0 ? "none yet" : data.exams.map((e) => `${e.subject_name} (${e.marks_entered}/${e.students}${e.status === "published" ? ", published" : ""})`).join(", ")}
            </p>
            {data.rows.length === 0 ? <Empty>No students in this section.</Empty> : (
              <ul className="stagger divide-y divide-line overflow-hidden rounded-xl border border-line">
                {data.rows.map((r) => (
                  <li key={r.student} className="grid gap-3 px-3 py-3 sm:grid-cols-[1fr_2fr]">
                    <div className="flex gap-3 text-sm">
                      <Avatar name={r.name} size="sm" />
                      <div className="min-w-0">
                        <Link href={`/app/report-cards/${r.student}/${t}`} className="font-semibold text-brand hover:underline">{r.roll_no ? `${r.roll_no}. ` : ""}{r.name}</Link>
                        <div className="text-soft">{num(r.total)} / {num(r.total_max)} · {pct(r.percentage)} {r.grade ? `· ${r.grade}` : ""}</div>
                        <div className="text-soft">Attendance {pct(r.attendance)}</div>
                      </div>
                    </div>
                    <textarea
                      className="min-h-20 w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-[var(--ring)] disabled:bg-muted disabled:opacity-70"
                      placeholder="Teacher's remarks"
                      value={remarks[r.student] ?? ""}
                      disabled={locked}
                      onChange={(e) => setRemarks((m) => ({ ...m, [r.student]: e.target.value }))}
                      aria-label={`Remarks for ${r.name}`}
                    />
                  </li>
                ))}
              </ul>
            )}
            <StickyBar>
              {!locked && <Button onClick={saveRemarks} busy={busy} variant="secondary">Save remarks</Button>}
              {isAdmin && !data.published && <Button onClick={publish} busy={busy}>Publish report cards</Button>}
              {isAdmin && locked && (
                <Button variant="danger" busy={busy} onClick={async () => {
                  if (await dialog.confirm({ title: "Unpublish these report cards?", body: "Students and parents stop seeing them until you publish again.", confirmLabel: "Unpublish", danger: true })) {
                    run(() => api("report-cards/publish", { method: "DELETE", body: { exam_term: t, section: s } }), "Unpublished. Remarks can be edited again.");
                  }
                }}>
                  Unpublish
                </Button>
              )}
            </StickyBar>
          </>
        )}
      </Card>
    </>
  );
}
