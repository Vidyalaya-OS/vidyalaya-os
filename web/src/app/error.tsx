"use client";

import { ErrorScreen } from "@/components/ErrorScreen";

export default function RootError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorScreen error={error} retry={retry} full />;
}
