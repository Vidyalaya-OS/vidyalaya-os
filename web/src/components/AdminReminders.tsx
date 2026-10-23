"use client";

import { UserRoundCheck } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { TeacherAttendanceSheet } from "@/lib/types";
import { useApi } from "@/lib/useApi";

/** Sent when the admin saves teacher attendance, so reminders refresh. */
export const TEACHER_ATTENDANCE_SAVED = "vidyalaya:teacher-attendance-saved";

/** Today's teacher register, kept fresh when it is saved anywhere. */
export function useTeacherRegister() {
  const sheet = useApi<TeacherAttendanceSheet>("attendance/teachers/sheet");
  const { reload } = sheet;
  useEffect(() => {
    window.addEventListener(TEACHER_ATTENDANCE_SAVED, reload);
    return () => window.removeEventListener(TEACHER_ATTENDANCE_SAVED, reload);
  }, [reload]);
  return sheet;
}

/** A slim bar on every admin screen until today's teachers are marked:
 * teacher attendance is required each working day. Hidden on Sundays. */
export function TeacherAttendanceBar() {
  const sheet = useTeacherRegister();
  const d = sheet.data;
  if (!d || d.marked || d.teachers.length === 0 || new Date().getDay() === 0) return null;
  return (
    <Link
      href="/app/attendance"
      className="mb-5 flex animate-fade items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-950 transition hover:border-amber-300 hover:shadow-[var(--shadow-card)] dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-100 print:hidden"
    >
      <span className="relative flex size-8 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white">
        <UserRoundCheck className="size-4" aria-hidden />
        <span className="absolute -right-0.5 -top-0.5 size-2.5 animate-ping rounded-full bg-red-500" aria-hidden />
        <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-red-500" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-semibold">Teacher attendance is required today.</span>{" "}
        <span className="text-amber-900/80 dark:text-amber-200/80">{d.unmarked.length} of {d.teachers.length} teachers not marked yet.</span>
      </span>
      <span className="shrink-0 font-semibold underline-offset-4 hover:underline">Mark now</span>
    </Link>
  );
}
