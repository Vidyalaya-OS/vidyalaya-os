"use client";

import { ArrowLeft, Mail } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthLayout } from "@/components/AuthLayout";
import { Alert, Button, Field, PageLoader } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <ForgotPassword />
    </Suspense>
  );
}

function ForgotPassword() {
  const params = useSearchParams();
  const [identifier, setIdentifier] = useState(params.get("identifier") ?? "");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) return setError("Enter your email or phone number.");
    setBusy(true);
    setError(null);
    try {
      // The answer is the same whether or not the account exists.
      const res = await api<{ detail: string }>("auth/password-reset", { method: "POST", body: { identifier: identifier.trim() }, auth: false, school: null });
      setSent(res.detail);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <Link href="/login" className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-soft transition hover:text-brand">
        <ArrowLeft className="size-4" aria-hidden /> Back to sign in
      </Link>
      <h1 className="text-3xl font-bold tracking-tight">Forgot your password?</h1>
      <p className="mt-2 text-soft">Enter the email or phone number you sign in with. We will send a link to choose a new password.</p>
      {sent ? (
        <div className="mt-6 space-y-4">
          <Alert tone="info">{sent}</Alert>
          <p className="text-sm text-soft">The link works once and expires soon. If nothing arrives, check spam or ask your school office to send you a new login link.</p>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="mt-6 space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field label="Email or phone" icon={<Mail aria-hidden />} autoComplete="username" autoFocus required value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
          <Button type="submit" size="lg" busy={busy} className="w-full">Send me a link</Button>
        </form>
      )}
    </AuthLayout>
  );
}
