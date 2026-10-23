"use client";

import { KeyRound, Mail, Smartphone } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthLayout } from "@/components/AuthLayout";
import { Alert, Button, Field, PageLoader, cx } from "@/components/ui";
import { api, ApiError, Session } from "@/lib/api";
import { useSession } from "@/lib/session";

export default function LoginPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Login />
    </Suspense>
  );
}

/** Only send people back to a page inside this app after signing in. */
function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

function Login() {
  const { signIn } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const expired = params.get("expired") === "1";
  const next = safeNext(params.get("next"));
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
    // The school a returning person was in is chosen again on the next screen.
    router.replace(next.startsWith("/app") && session.memberships.length > 1 ? "/choose-school" : next);
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not reach the server. Check your connection and try again.");
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
    <AuthLayout>
      <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
      <p className="mt-2 text-soft">Sign in with the email or phone number your school registered.</p>

      {expired && !error && <div className="mt-5"><Alert tone="warn" title="Your session has ended">For your security you were signed out. Please sign in again.</Alert></div>}

      <div className="mt-6 grid grid-cols-2 rounded-xl bg-muted p-1 text-sm" role="tablist" aria-label="How to sign in">
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
            className={cx("flex min-h-10 items-center justify-center gap-2 rounded-lg font-medium transition", mode === m ? "bg-surface text-ink shadow-sm" : "text-soft hover:text-ink")}
          >
            {m === "password" ? <KeyRound className="size-4" aria-hidden /> : <Smartphone className="size-4" aria-hidden />}
            {m === "password" ? "Password" : "Parent code"}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-4">
        {error && <Alert>{error}</Alert>}
        {info && !error && <Alert tone="info">{info}</Alert>}

        {mode === "password" ? (
          <form key="password" onSubmit={submitPassword} className="animate-fade space-y-4">
            <Field label="Email or phone" icon={<Mail aria-hidden />} autoComplete="username" autoFocus required value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
            <Field label="Password" icon={<KeyRound aria-hidden />} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button type="submit" size="lg" busy={busy} className="w-full">Sign in</Button>
          </form>
        ) : (
          <form key="code" onSubmit={codeSent ? verifyCode : requestCode} className="animate-fade space-y-4">
            <Field label="Email or phone" icon={<Mail aria-hidden />} autoComplete="username" required value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
            {codeSent && (
              <Field label="6-digit code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} autoFocus required value={code} onChange={(e) => setCode(e.target.value)} className="animate-enter" />
            )}
            <Button type="submit" size="lg" busy={busy} className="w-full">{codeSent ? "Sign in" : "Send me a code"}</Button>
            {codeSent && (
              <Button variant="ghost" className="w-full" onClick={() => setCodeSent(false)}>
                Send a new code
              </Button>
            )}
          </form>
        )}
      </div>
      <p className="mt-8 text-sm text-soft">New here? Open the invite link your school sent you to set your password.</p>
    </AuthLayout>
  );
}
