import type { Metadata } from "next";
import { FrontPage } from "@/components/landing/FrontPage";

export const metadata: Metadata = {
  title: { absolute: "Vidyalaya OS · The school operating system" },
  // The public front page may be found; signed-in screens may not.
  robots: { index: true, follow: true },
};

export default function Home() {
  return <FrontPage />;
}
