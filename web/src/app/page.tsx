"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { PageLoader } from "@/components/ui";
import { useSession } from "@/lib/session";

/** Send people where they belong: login, school picker, platform or their school. */
export default function Home() {
  const { ready, user, memberships, school } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace("/login");
    else if (school) router.replace("/app");
    else if (user.is_platform_owner && memberships.length === 0) router.replace("/platform");
    else router.replace("/choose-school");
  }, [ready, user, school, memberships, router]);

  return <PageLoader />;
}
