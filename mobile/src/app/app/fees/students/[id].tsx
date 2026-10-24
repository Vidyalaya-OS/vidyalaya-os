import { useLocalSearchParams } from "expo-router";
import { FeeStatement } from "@/components/FeeStatement";
import { PageHeader, Screen } from "@/components/ui";
import { useSession } from "@/lib/session";
import type { Student } from "@/lib/types";
import { useApi } from "@/lib/useApi";

export default function StudentFeesPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { hasRole } = useSession();
  const student = useApi<Student>(`students/${id}/`);
  const s = student.data;
  return (
    <Screen>
      <PageHeader back={hasRole("admin") ? "Fees" : "Back"} title={s ? `Fees: ${s.name}` : "Fees"}
        subtitle={s ? `Admission no. ${s.admission_no} · ${s.current_enrollment?.section_name ?? "No section"}` : undefined} />
      <FeeStatement studentId={id} isAdmin={hasRole("admin")} />
    </Screen>
  );
}
