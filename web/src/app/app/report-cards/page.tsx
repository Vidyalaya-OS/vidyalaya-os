"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useStaffSections } from "@/components/sections";
import { Alert, Badge, Button, Card, Empty, Loading, PageHeader, Select } from "@/components/ui";
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
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRemarks(Object.fromEntries((cards.data?.rows ?? []).map((r) => [r.student, r.remarks])));
  }, [cards.data]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
      setNotice({ tone: "success", text: ok });
      cards.reload();
    } catch (e) {
      setNotice({ tone: "error", text: e instanceof ApiError ? e.message : "That did not work." });
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
      setNotice({ tone: "success", text: "Published. Students and parents can see and print their report cards." });
      cards.reload();
    } catch (e) {
      const missing = e instanceof ApiError ? (e.data as { missing?: string[] })?.missing : undefined;
      if (missing && confirm(`${missing.length} marks are missing. Publish anyway?`)) {
        await run(() => api("report-cards/publish", { method: "POST", body: { exam_term: t, section: s, allow_missing: true } }), "Published.");
      } else if (!missing) setNotice({ tone: "error", text: e instanceof ApiError ? e.message : "Could not publish." });
    } finally {
      setBusy(false);
    }
  };

  const data = cards.data;
  const locked = Boolean(data?.rows.some((r) => r.published_at));

  return (
    <>
      <PageHeader title="Report cards" subtitle="A term's marks, attendance and remarks. Students and parents see them once published." />
      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Select label="Term" value={t} onChange={(e) => setTerm(e.target.value)}>
            {(terms.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
          <Select label="Section" value={s} onChange={(e) => setSection(e.target.value)}>
            {sections.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
          <div className="flex items-end">{data && <Badge tone={data.published ? "good" : "warn"}>{data.published ? "Published" : "Not published"}</Badge>}</div>
        </div>
        {notice && <div className="mb-3"><Alert tone={notice.tone}>{notice.text}</Alert></div>}
        {terms.data?.length === 0 ? <Empty>Add an exam term under Tests &amp; marks first.</Empty> : !data ? (cards.error ? <Alert>{cards.error}</Alert> : <Loading />) : (
          <>
            <p className="mb-3 text-sm text-soft">
              Tests: {data.exams.length === 0 ? "none yet" : data.exams.map((e) => `${e.subject_name} (${e.marks_entered}/${e.students}${e.status === "published" ? ", published" : ""})`).join(", ")}
            </p>
            {data.rows.length === 0 ? <Empty>No students in this section.</Empty> : (
              <ul className="divide-y divide-line rounded-lg border border-line">
                {data.rows.map((r) => (
                  <li key={r.student} className="grid gap-2 px-3 py-3 sm:grid-cols-[1fr_2fr]">
                    <div className="text-sm">
                      <Link href={`/app/report-cards/${r.student}/${t}`} className="font-medium text-brand">{r.roll_no ? `${r.roll_no}. ` : ""}{r.name}</Link>
                      <div className="text-soft">{num(r.total)} / {num(r.total_max)} · {pct(r.percentage)} {r.grade ? `· ${r.grade}` : ""}</div>
                      <div className="text-soft">Attendance {pct(r.attendance)}</div>
                    </div>
                    <textarea
                      className="min-h-16 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm disabled:opacity-60"
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
            <div className="mt-4 flex flex-wrap gap-2">
              {!locked && <Button onClick={saveRemarks} busy={busy} variant="secondary">Save remarks</Button>}
              {isAdmin && !data.published && <Button onClick={publish} busy={busy}>Publish report cards</Button>}
              {isAdmin && locked && (
                <Button variant="danger" busy={busy} onClick={() => confirm("Unpublish? Students and parents stop seeing these report cards.") && run(() => api("report-cards/publish", { method: "DELETE", body: { exam_term: t, section: s } }), "Unpublished. Remarks can be edited again.")}>
                  Unpublish
                </Button>
              )}
            </div>
          </>
        )}
      </Card>
    </>
  );
}
