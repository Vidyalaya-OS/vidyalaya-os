"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { AuthLayout } from "@/components/AuthLayout";
import { Alert, Button, Field, PageLoader } from "@/components/ui";
import { api, ApiError, Session } from "@/lib/api";
import { useSession } from "@/lib/session";

type InviteInfo = { name: string; email: string | null; phone: string | null; school: string | null };

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const { signIn } = useSession();
  const router = useRouter();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<InviteInfo>(`auth/invites/${token}`, { auth: false, school: null })
      .then(setInfo)
      .catch((e) => setInvalid(e instanceof ApiError ? e.message : "Could not open this invite."));
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setError("The two passwords are different. Type the same password in both boxes.");
    setBusy(true);
    setError(null);
    try {
      signIn(await api<Session>(`auth/invites/${token}`, { method: "POST", body: { password }, auth: false, school: null }));
      router.replace("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not set your password.");
    } finally {
      setBusy(false);
    }
  };

  if (invalid) {
    return (
      <AuthLayout>
        <h1 className="mb-4 text-2xl font-bold">This invite can&apos;t be used</h1>
        <Alert>{invalid}</Alert>
        <p className="mt-4 text-sm text-soft">Invite links work once and expire after a while. Ask your school office to send a new one.</p>
      </AuthLayout>
    );
  }
  if (!info) return <PageLoader label="Opening your invite" />;

  return (
    <AuthLayout>
      <h1 className="text-3xl font-bold tracking-tight">Welcome, {info.name}</h1>
      <p className="mt-2 text-soft">
        {info.school ? `You've been invited to ${info.school}. ` : ""}Choose a password to finish setting up your login
        ({info.email ?? info.phone}).
      </p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="New password" icon={<KeyRound aria-hidden />} type="password" autoComplete="new-password" minLength={8} required hint="At least 8 characters, not only numbers." value={password} onChange={(e) => setPassword(e.target.value)} />
        <Field label="Repeat password" icon={<KeyRound aria-hidden />} type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <Button type="submit" size="lg" busy={busy} className="w-full">Set password and sign in</Button>
      </form>
    </AuthLayout>
  );
}
