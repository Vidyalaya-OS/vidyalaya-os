"use client";

import { useParams } from "next/navigation";
import { Alert, Button, Loading } from "@/components/ui";
import { formatDate, num, pct } from "@/lib/format";
import { ReportCard } from "@/lib/types";
import { useApi } from "@/lib/useApi";

/** A printable term report card. "Print" lets the browser save it as a PDF. */
export default function ReportCardPage() {
  const { student, term } = useParams<{ student: string; term: string }>();
  const card = useApi<ReportCard>(`report-cards/students/${student}/${term}`);
  if (card.error) return <Alert>{card.error}</Alert>;
  if (!card.data) return <Loading />;
  const c = card.data;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        {!c.published_at && <Alert tone="info">Draft: students and parents can&apos;t see this until it is published.</Alert>}
        <Button onClick={() => window.print()}>Print or save as PDF</Button>
      </div>
      <article className="mx-auto max-w-3xl rounded-xl border border-line bg-surface p-6 text-sm print:border-0 print:p-0 print:text-black">
        <header className="flex items-center gap-4 border-b border-line pb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {c.school.logo && <img src={c.school.logo} alt="" className="h-16 w-16 object-contain" />}
          <div>
            <h1 className="text-xl font-semibold">{c.school.name}</h1>
            {c.school.address && <p className="text-soft">{c.school.address}</p>}
            <p className="mt-1 font-medium">Report card · {c.result.exam_term_name} · {c.academic_year}</p>
          </div>
        </header>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 py-4 sm:grid-cols-4">
          <div><dt className="text-soft">Student</dt><dd className="font-medium">{c.student.name}</dd></div>
          <div><dt className="text-soft">Class</dt><dd className="font-medium">{c.section_name ?? "-"}</dd></div>
          <div><dt className="text-soft">Roll no.</dt><dd className="font-medium">{c.student.roll_no ?? "-"}</dd></div>
          <div><dt className="text-soft">Admission no.</dt><dd className="font-medium">{c.student.admission_no}</dd></div>
        </dl>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-y border-line text-xs uppercase tracking-wide text-soft">
              <th className="py-2 pr-2">Subject</th>
              <th className="py-2 pr-2 text-right">Marks</th>
              <th className="py-2 pr-2 text-right">Out of</th>
              <th className="py-2 pr-2 text-right">%</th>
              <th className="py-2 pr-2">Grade</th>
              <th className="py-2 text-right">Class avg.</th>
            </tr>
          </thead>
          <tbody>
            {c.result.subjects.map((s) => (
              <tr key={s.exam} className="border-b border-line">
                <td className="py-2 pr-2">{s.subject_name}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{s.is_absent ? "Absent" : num(s.marks_obtained)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{num(s.max_marks)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{pct(s.percentage)}</td>
                <td className="py-2 pr-2 font-medium">{s.grade ?? "-"}</td>
                <td className="py-2 text-right tabular-nums">{s.class_average ?? "-"}</td>
              </tr>
            ))}
            {c.result.subjects.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-soft">No marks yet.</td></tr>}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className="py-2 pr-2">Total</td>
              <td className="py-2 pr-2 text-right tabular-nums">{num(c.result.total)}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{num(c.result.total_max)}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{pct(c.result.percentage)}</td>
              <td className="py-2 pr-2">{c.result.grade ?? "-"}</td>
              <td />
            </tr>
          </tfoot>
        </table>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <h2 className="font-semibold">Attendance</h2>
            <p>{pct(c.attendance.percentage)} ({c.attendance.attended} of {c.attendance.marked_days} days)</p>
          </div>
          <div>
            <h2 className="font-semibold">Remarks</h2>
            <p className="whitespace-pre-line">{c.remarks || "-"}</p>
          </div>
        </div>
        <p className="mt-5 text-xs text-soft">Grades: {c.bands.map((b) => `${b.grade} ${b.min}%+`).join(" · ")}</p>
        <footer className="mt-10 grid grid-cols-2 gap-8 text-center text-xs text-soft">
          <div className="border-t border-line pt-1">Class teacher{c.class_teacher ? `: ${c.class_teacher}` : ""}</div>
          <div className="border-t border-line pt-1">Principal</div>
        </footer>
        {c.published_at && <p className="mt-4 text-right text-xs text-soft">Published {formatDate(c.published_at)}</p>}
      </article>
    </>
  );
}
