import { Redirect } from "expo-router";
import { Landing } from "@/components/landing/Landing";
import { PageLoader } from "@/components/ui";
import { useSession } from "@/lib/session";

/** Signed-in people go straight to their portal; everyone else sees the
 * landing page, the same as the web's front page. */
export default function Index() {
  const { ready, user, school, memberships } = useSession();
  if (!ready) return <PageLoader />;
  if (!user) return <Landing />;
  if (school) return <Redirect href="/app" />;
  if (user.is_platform_owner && memberships.length === 0) return <Redirect href="/platform" />;
  return <Redirect href="/choose-school" />;
}
