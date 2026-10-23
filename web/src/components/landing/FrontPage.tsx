"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { PageLoader } from "@/components/ui";
import { useSession } from "@/lib/session";
import { Landing } from "./Landing";

/** Signed-in people go straight to their portal; everyone else sees the landing page. */
export function FrontPage() {
  const { ready, user, memberships, school } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!ready || !user) return;
    if (school) router.replace("/app");
    else if (user.is_platform_owner && memberships.length === 0) router.replace("/platform");
    else router.replace("/choose-school");
  }, [ready, user, school, memberships, router]);

  if (ready && user) return <PageLoader />;
  return <Landing />;
}
