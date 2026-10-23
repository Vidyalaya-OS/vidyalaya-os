"use client";

import { ArrowLeft, Eye, EyeOff, HeartHandshake, KeyRound, Mail, MessageSquareText, Smartphone } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
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

/** An email address, or a phone number of at least 7 digits. */
function identifierProblem(value: string) {
  const v = value.trim();
  if (!v) return "Enter your email or phone number.";
  if (v.includes("@")) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : "Enter a valid email address, like name@school.com.";
  return v.replace(/\D/g, "").length >= 7 ? null : "Enter a full phone number, with country code if you have one.";
}

const RESEND_SECONDS = 30;

// Shown only while developing, to save typing the demo logins.
const DEMO = process.env.NODE_ENV === "development"
  ? [["Owner", "owner@demo.test"], ["Admin", "admin@greenvalley.test"], ["Teacher", "teacher@greenvalley.test"], ["Student", "student1@greenvalley.test"], ["Parent", "parent1@greenvalley.test"]]
  : [];

function Login() {
  const { signIn } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const expired = params.get("expired") === "1";
  const next = safeNext(params.get("next"));
  const [mode, setMode] = useState<"password" | "code">(params.get("mode") === "code" ? "code" : "password");
  const [identifier, setIdentifier] = useState("");
  const [idError, setIdError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(t);
  }, [wait]);

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

  const checkIdentifier = () => {
    const problem = identifierProblem(identifier);
    setIdError(problem);
    return !problem;
  };

  const submitPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkIdentifier()) return;
    run(async () => finish(await api<Session>("auth/login", { method: "POST", body: { identifier: identifier.trim(), password }, auth: false, school: null })));
  };

  const sendCode = () => {
    if (!checkIdentifier()) return;
    run(async () => {
      await api<{ detail: string }>("auth/otp/request", { method: "POST", body: { identifier: identifier.trim() }, auth: false, school: null });
      setInfo(`If ${identifier.trim()} belongs to a parent account, a 6-digit code is on its way. It works once, for 10 minutes.`);
      setCodeSent(true);
      setCode("");
      setWait(RESEND_SECONDS);
    });
  };

  const verifyCode = (value = code) => {
    if (!/^\d{6}$/.test(value)) {
      setError("Enter all 6 digits of the code.");
      return;
    }
    run(async () => finish(await api<Session>("auth/otp/verify", { method: "POST", body: { identifier: identifier.trim(), code: value }, auth: false, school: null })));
  };

  const switchMode = (m: "password" | "code") => {
    setMode(m);
    setError(null);
    setInfo(null);
    setCodeSent(false);
  };

  const identifierField = (autoFocus: boolean) => (
    <Field
      label="Email or phone"
      icon={<Mail aria-hidden />}
      autoComplete="username"
      autoFocus={autoFocus}
      required
      value={identifier}
      error={idError ?? undefined}
      onChange={(e) => {
        setIdentifier(e.target.value);
        if (idError) setIdError(null);
      }}
      onBlur={() => identifier && checkIdentifier()}
      hint="The one your school has on file for you."
    />
  );

  return (
    <AuthLayout>
      <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-soft transition hover:text-brand">
        <ArrowLeft className="size-4" aria-hidden /> About SMS
      </Link>
      <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
      <p className="mt-2 text-soft">Sign in with the email or phone number your school registered.</p>

      {expired && !error && <div className="mt-5"><Alert tone="warn" title="Your session has ended">For your security you were signed out. Please sign in again.</Alert></div>}

      <div className="mt-6 grid grid-cols-2 rounded-xl bg-muted p-1 text-sm" role="tablist" aria-label="How to sign in">
        {(["password", "code"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => switchMode(m)}
            className={cx("flex min-h-10 items-center justify-center gap-2 rounded-lg font-medium transition", mode === m ? "bg-surface text-ink shadow-sm" : "text-soft hover:text-ink")}
          >
            {m === "password" ? <KeyRound className="size-4" aria-hidden /> : <Smartphone className="size-4" aria-hidden />}
            {m === "password" ? "Password" : "Parent code"}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-4">
        {error && <Alert>{error}</Alert>}

        {mode === "password" ? (
          <form key="password" onSubmit={submitPassword} noValidate className="animate-fade space-y-4">
            {identifierField(true)}
            <div className="relative">
              <Field label="Password" icon={<KeyRound aria-hidden />} type={showPassword ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="[&_input]:pr-11" />
              <button type="button" onClick={() => setShowPassword((s) => !s)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute bottom-0 right-1 flex size-11 items-center justify-center text-soft hover:text-ink">
                {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
              </button>
            </div>
            <Button type="submit" size="lg" busy={busy} className="w-full" disabled={!password}>Sign in</Button>
            <button type="button" onClick={() => switchMode("code")} className="flex w-full items-center gap-3 rounded-xl border border-dashed border-line p-3 text-left text-sm transition hover:border-brand/50 hover:bg-brand-soft/40">
              <HeartHandshake className="size-5 shrink-0 text-brand" aria-hidden />
              <span><strong>Parent?</strong> <span className="text-soft">Skip the password: sign in with a code we send to your phone or email.</span></span>
            </button>
          </form>
        ) : (
          <div key="code" className="animate-fade space-y-4">
            <div className="rounded-2xl border border-brand/20 bg-brand-soft/60 p-4 text-sm">
              <p className="flex items-center gap-2 font-semibold"><MessageSquareText className="size-4 text-brand" aria-hidden /> What is the Parent code?</p>
              <p className="mt-1.5 text-soft">A way for parents to sign in <strong className="text-ink">without a password</strong>. We send a 6-digit code to the phone or email the school has for you. Type it here and you are in. Each code works once and only for 10 minutes.</p>
              <ol className="mt-3 flex gap-2 text-xs font-semibold">
                <li className={cx("flex items-center gap-1.5 rounded-full px-2.5 py-1", !codeSent ? "bg-brand text-white dark:text-slate-950" : "bg-surface text-soft")}>1 · Your phone or email</li>
                <li className={cx("flex items-center gap-1.5 rounded-full px-2.5 py-1", codeSent ? "bg-brand text-white dark:text-slate-950" : "bg-surface text-soft")}>2 · The code we send</li>
              </ol>
            </div>
            {info && !error && <Alert tone="info">{info}</Alert>}

            {!codeSent ? (
              <form onSubmit={(e) => { e.preventDefault(); sendCode(); }} noValidate className="space-y-4">
                {identifierField(true)}
                <Button type="submit" size="lg" busy={busy} className="w-full">Send me a code</Button>
              </form>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); verifyCode(); }} noValidate className="space-y-4">
                <Field
                  label="6-digit code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  autoFocus
                  required
                  placeholder="••••••"
                  value={code}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
                    setCode(digits);
                    setError(null);
                    // Sign in as soon as the last digit is typed or pasted.
                    if (digits.length === 6 && !busy) verifyCode(digits);
                  }}
                  className="animate-enter [&_input]:text-center [&_input]:text-2xl [&_input]:font-bold [&_input]:tracking-[0.5em]"
                  hint={`Sent to ${identifier.trim()}.`}
                />
                <Button type="submit" size="lg" busy={busy} className="w-full" disabled={code.length !== 6}>Sign in</Button>
                <div className="flex items-center justify-between text-sm">
                  <button type="button" className="font-medium text-soft hover:text-ink" onClick={() => { setCodeSent(false); setInfo(null); }}>Use a different number</button>
                  <button type="button" className="font-medium text-brand disabled:text-soft" disabled={wait > 0 || busy} onClick={sendCode}>
                    {wait > 0 ? `Send again in ${wait}s` : "Send a new code"}
                  </button>
                </div>
              </form>
            )}
            <p className="text-xs text-soft">Parent code works for parent accounts only. Admins, teachers and students sign in with their password.</p>
          </div>
        )}
      </div>

      <p className="mt-8 text-sm text-soft">New here? Open the invite link your school sent you to set your password.</p>

      {DEMO.length > 0 && (
        <div className="mt-6 rounded-2xl border border-dashed border-line p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-soft">Demo logins (development only)</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {DEMO.map(([label, email]) => (
              <button key={email} type="button" onClick={() => { switchMode("password"); setIdentifier(email); setPassword("Demo-pass-2026"); setIdError(null); }}
                className="rounded-full border border-line px-2.5 py-1 text-xs font-medium text-soft transition hover:border-brand hover:text-brand">
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
