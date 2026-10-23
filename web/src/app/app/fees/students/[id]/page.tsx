"use client";

import { useParams } from "next/navigation";
import { FeeStatement } from "@/components/FeeStatement";
import { PageHeader } from "@/components/ui";
import { useSession } from "@/lib/session";
import { Student } from "@/lib/types";
import { useApi } from "@/lib/useApi";

export default function StudentFeesPage() {
  const { id } = useParams<{ id: string }>();
  const { hasRole } = useSession();
  const student = useApi<Student>(`students/${id}/`);
  const s = student.data;
  return (
    <>
      <PageHeader back={hasRole("admin") ? { href: "/app/fees", label: "Fees" } : undefined} title={s ? `Fees: ${s.name}` : "Fees"} subtitle={s ? `Admission no. ${s.admission_no} · ${s.current_enrollment?.section_name ?? "No section"}` : undefined} />
      <FeeStatement studentId={id} isAdmin={hasRole("admin")} />
    </>
  );
}
