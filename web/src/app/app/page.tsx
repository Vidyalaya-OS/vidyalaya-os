"use client";

import { useEffect, useState } from "react";
import { ParentDashboard, StudentDashboard } from "@/components/Dashboards";
import { AdminHome, TeacherHome } from "@/components/StaffHome";
import { PageHeader, Segmented } from "@/components/ui";
import { Role } from "@/lib/api";
import { ROLE_LABELS, useSession } from "@/lib/session";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Each role gets its own home screen. Someone with several roles (a teacher
 * who is also a parent) switches portal here or in the menu; the choice is
 * remembered and the menu follows it. */
export default function SchoolHome() {
  const { roles, user, school, portal, setPortal } = useSession();
  const [hello, setHello] = useState("Hello");

  useEffect(() => {
    // The time of day is only known in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHello(greeting());
  }, []);

  const current = portal ?? roles[0];
  const choose = (r: Role) => setPortal(r);
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

  return (
    <>
      <PageHeader
        title={`${hello}, ${user?.name.split(" ")[0]}`}
        subtitle={<><span suppressHydrationWarning>{today}</span> · {school?.school.name}</>}
        actions={roles.length > 1 ? (
          <Segmented label="Show home screen for" value={current} onChange={choose} options={roles.map((r) => ({ key: r, label: ROLE_LABELS[r] }))} />
        ) : undefined}
      />
      <div key={current} className="animate-enter">
        {current === "admin" && <AdminHome />}
        {current === "teacher" && <TeacherHome />}
        {current === "student" && <StudentDashboard />}
        {current === "parent" && <ParentDashboard />}
      </div>
    </>
  );
}
