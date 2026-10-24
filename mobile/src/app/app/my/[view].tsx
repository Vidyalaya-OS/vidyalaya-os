import { useLocalSearchParams } from "expo-router";
import { ChildSwitcher } from "@/components/Dashboards";
import { FeeStatement } from "@/components/FeeStatement";
import { AttendanceCalendar, Results } from "@/components/StudentRecord";
import { Empty, Enter, ErrorState, Loading, PageHeader, Screen } from "@/components/ui";
import { useChildren } from "@/lib/children";
import { useSession } from "@/lib/session";

const VIEWS = {
  attendance: { title: "Attendance", subtitle: "Day by day, with this month's and this year's percentage." },
  results: { title: "Results & report cards", subtitle: "Marks for every published test, against the class average." },
  fees: { title: "Fees", subtitle: "What is billed, paid and still due, with receipts." },
} as const;

/** A student's own record, or a parent's child's, one part at a time. */
export default function MyRecord() {
  const { view } = useLocalSearchParams<{ view: string }>();
  const { hasRole } = useSession();
  const { list, chosen, choose, loading, error, reload } = useChildren();
  const v = VIEWS[view as keyof typeof VIEWS];
  const isParent = hasRole("parent");
  if (!v) return <Screen><Empty title="Page not found">This page does not exist.</Empty></Screen>;

  return (
    <Screen>
      <PageHeader title={v.title} subtitle={chosen && isParent ? `${chosen.name} · ${chosen.current_enrollment?.section_name ?? "No class yet"}` : v.subtitle} />
      {error && !list.length ? <ErrorState message={error} onRetry={reload} /> : loading ? <Loading variant="stats" /> : !chosen ? (
        <Empty title={isParent ? "No children linked yet" : "Your student record is not set up"}>Ask the school office to set this up.</Empty>
      ) : (
        <>
          <ChildSwitcher items={list.map((c) => ({ id: c.id, name: c.name, detail: c.current_enrollment?.section_name }))} value={chosen.id} onChange={choose} />
          <Enter key={chosen.id}>
            {view === "attendance" && <AttendanceCalendar studentId={chosen.id} />}
            {view === "results" && <Results studentId={chosen.id} />}
            {view === "fees" && <FeeStatement studentId={chosen.id} isAdmin={false} />}
          </Enter>
        </>
      )}
    </Screen>
  );
}
