import { UserRoundCheck } from "lucide-react-native";
import { useEffect } from "react";
import { DeviceEventEmitter, View } from "react-native";
import type { TeacherAttendanceSheet } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { useTheme } from "@/lib/theme";
import { Enter, Ping, Press, Txt, go } from "./ui";

/** Sent when the admin saves teacher attendance, so reminders refresh. */
export const TEACHER_ATTENDANCE_SAVED = "vidyalaya:teacher-attendance-saved";

/** Today's teacher register, kept fresh when it is saved anywhere. */
export function useTeacherRegister() {
  const sheet = useApi<TeacherAttendanceSheet>("attendance/teachers/sheet");
  const { reload } = sheet;
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(TEACHER_ATTENDANCE_SAVED, reload);
    return () => sub.remove();
  }, [reload]);
  return sheet;
}

/** A slim bar on admin screens until today's teachers are marked. Hidden on Sundays. */
export function TeacherAttendanceBar() {
  const sheet = useTeacherRegister();
  const { dark } = useTheme();
  const d = sheet.data;
  if (!d || d.marked || d.teachers.length === 0 || new Date().getDay() === 0) return null;
  return (
    <Enter style={{ marginBottom: 16 }}>
      <Press onPress={() => go("/app/attendance")} scale={0.99} accessibilityRole="link"
        style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 18, borderWidth: 1, borderColor: dark ? "#78350fb3" : "#fde68a", backgroundColor: dark ? "#451a0366" : "#fffbeb", paddingHorizontal: 14, paddingVertical: 10 }}>
        <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "#f59e0b", alignItems: "center", justifyContent: "center" }}>
          <UserRoundCheck size={16} color="#fff" />
          <View style={{ position: "absolute", top: -2, right: -2 }}><Ping color="#ef4444" size={9} /></View>
        </View>
        <View style={{ flex: 1 }}>
          <Txt size="sm" weight="semibold" color={dark ? "#fef3c7" : "#451a03"}>Teacher attendance is required today.</Txt>
          <Txt size="xs" color={dark ? "#fde68acc" : "#78350fcc"}>{d.unmarked.length} of {d.teachers.length} teachers not marked yet.</Txt>
        </View>
        <Txt size="sm" weight="semibold" color={dark ? "#fef3c7" : "#451a03"}>Mark now</Txt>
      </Press>
    </Enter>
  );
}
