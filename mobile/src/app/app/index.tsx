import { View } from "react-native";
import { ParentDashboard, StudentDashboard } from "@/components/Dashboards";
import { AdminHome, TeacherHome } from "@/components/StaffHome";
import { Enter, PageHeader, Screen, Segmented, useLayout } from "@/components/ui";
import type { Role } from "@/lib/api";
import { ROLE_LABELS, SHORT_LABELS, useSession } from "@/lib/session";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Each role gets its own home screen. Someone with several roles switches
 * portal here or in the menu; the choice is remembered. */
export default function SchoolHome() {
  const { roles, user, school, portal, setPortal } = useSession();
  const { md } = useLayout();
  const current = portal ?? roles[0];
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  return (
    <Screen>
      <PageHeader
        title={`${greeting()}, ${user?.name.split(" ")[0]}`}
        subtitle={`${today} · ${school?.school.name}`}
        actions={roles.length > 1 ? (
          <Segmented value={current} onChange={(r: Role) => setPortal(r)} options={roles.map((r) => ({ key: r, label: md ? ROLE_LABELS[r] : SHORT_LABELS[r] }))} />
        ) : undefined}
      />
      <Enter key={current}>
        <View>
          {current === "admin" && <AdminHome />}
          {current === "teacher" && <TeacherHome />}
          {current === "student" && <StudentDashboard />}
          {current === "parent" && <ParentDashboard />}
        </View>
      </Enter>
    </Screen>
  );
}
