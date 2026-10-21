"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, Button, Field, Loading } from "@/components/ui";
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
    if (password !== confirm) return setError("The two passwords are different.");
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
      <main className="mx-auto max-w-sm px-4 py-16">
        <Alert>{invalid}</Alert>
        <p className="mt-4 text-sm text-soft">Ask your school to send a new invite.</p>
      </main>
    );
  }
  if (!info) return <Loading />;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-10">
      <h1 className="text-2xl font-semibold">Welcome, {info.name}</h1>
      <p className="mt-1 text-sm text-soft">
        {info.school ? `You've been invited to ${info.school}. ` : ""}Choose a password to finish setting up your login
        ({info.email ?? info.phone}).
      </p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="New password" type="password" autoComplete="new-password" minLength={8} required hint="At least 8 characters, not only numbers." value={password} onChange={(e) => setPassword(e.target.value)} />
        <Field label="Repeat password" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <Button type="submit" busy={busy} className="w-full">Set password and sign in</Button>
      </form>
    </main>
  );
}
