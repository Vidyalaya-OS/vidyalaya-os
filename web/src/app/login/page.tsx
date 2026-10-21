"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Field } from "@/components/ui";
import { api, ApiError, Session } from "@/lib/api";
import { useSession } from "@/lib/session";

export default function LoginPage() {
  const { signIn } = useSession();
  const router = useRouter();
  const [mode, setMode] = useState<"password" | "code">("password");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const finish = (session: Session) => {
    signIn(session);
    router.replace("/");
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => finish(await api<Session>("auth/login", { method: "POST", body: { identifier, password }, auth: false, school: null })));
  };

  const requestCode = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const res = await api<{ detail: string }>("auth/otp/request", { method: "POST", body: { identifier }, auth: false, school: null });
      setInfo(res.detail);
      setCodeSent(true);
    });
  };

  const verifyCode = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => finish(await api<Session>("auth/otp/verify", { method: "POST", body: { identifier, code }, auth: false, school: null })));
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-10">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-1 text-sm text-soft">Use the email or phone number your school registered.</p>

      <div className="mt-6 grid grid-cols-2 rounded-lg bg-muted p-1 text-sm" role="tablist">
        {(["password", "code"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setError(null);
              setInfo(null);
            }}
            className={`min-h-9 rounded-md ${mode === m ? "bg-surface font-medium shadow-sm" : "text-soft"}`}
          >
            {m === "password" ? "Password" : "Parent login code"}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-4">
        {error && <Alert>{error}</Alert>}
        {info && !error && <Alert tone="info">{info}</Alert>}

        {mode === "password" ? (
          <form onSubmit={submitPassword} className="space-y-4">
            <Field label="Email or phone" autoComplete="username" required value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
            <Field label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button type="submit" busy={busy} className="w-full">Sign in</Button>
          </form>
        ) : (
          <form onSubmit={codeSent ? verifyCode : requestCode} className="space-y-4">
            <Field label="Email or phone" autoComplete="username" required value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
            {codeSent && (
              <Field label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value)} />
            )}
            <Button type="submit" busy={busy} className="w-full">{codeSent ? "Sign in" : "Send me a code"}</Button>
            {codeSent && (
              <Button type="button" variant="ghost" className="w-full" onClick={() => setCodeSent(false)}>
                Send a new code
              </Button>
            )}
          </form>
        )}
      </div>
      <p className="mt-6 text-xs text-soft">New here? Open the invite link your school sent you to set your password.</p>
    </main>
  );
}
