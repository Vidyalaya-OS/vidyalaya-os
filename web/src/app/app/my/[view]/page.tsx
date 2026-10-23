"use client";

import { notFound, useParams } from "next/navigation";
import { ChildSwitcher } from "@/components/Dashboards";
import { FeeStatement } from "@/components/FeeStatement";
import { AttendanceCalendar, Results } from "@/components/StudentRecord";
import { Empty, ErrorState, Loading, PageHeader } from "@/components/ui";
import { useChildren } from "@/lib/children";
import { useSession } from "@/lib/session";

const VIEWS = {
  attendance: { title: "Attendance", subtitle: "Day by day, with this month's and this year's percentage." },
  results: { title: "Results & report cards", subtitle: "Marks for every published test, against the class average." },
  fees: { title: "Fees", subtitle: "What is billed, paid and still due, with receipts." },
} as const;

/** A student's own record, or a parent's child's, one part at a time. */
export default function MyRecord() {
  const { view } = useParams<{ view: string }>();
  const { hasRole } = useSession();
  const { list, chosen, choose, loading, error, reload } = useChildren();
  if (!(view in VIEWS)) notFound();
  const v = VIEWS[view as keyof typeof VIEWS];
  const isParent = hasRole("parent");

  return (
    <>
      <PageHeader title={v.title} subtitle={chosen && isParent ? `${chosen.name} · ${chosen.current_enrollment?.section_name ?? "No class yet"}` : v.subtitle} />
      {error && !list.length ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <Loading variant="stats" />
      ) : !chosen ? (
        <Empty title={isParent ? "No children linked yet" : "Your student record is not set up"}>Ask the school office to set this up.</Empty>
      ) : (
        <>
          <ChildSwitcher items={list.map((c) => ({ id: c.id, name: c.name, detail: c.current_enrollment?.section_name }))} value={chosen.id} onChange={choose} />
          <div key={chosen.id} className="animate-enter">
            {view === "attendance" && <AttendanceCalendar studentId={chosen.id} />}
            {view === "results" && <Results studentId={chosen.id} />}
            {view === "fees" && <FeeStatement studentId={chosen.id} isAdmin={false} />}
          </div>
        </>
      )}
    </>
  );
}
