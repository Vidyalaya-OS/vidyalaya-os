"use client";

import { ErrorScreen } from "@/components/ErrorScreen";

export default function PlatformError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorScreen error={error} retry={retry} />;
}
