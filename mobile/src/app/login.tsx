import { router } from "expo-router";
import { HeartHandshake, KeyRound, Mail, MessageSquareText, Smartphone } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { AuthLayout } from "@/components/AuthLayout";
import { Alert, Button, Enter, Field, Row, Stack, Txt } from "@/components/ui";
import { api, errorMessage, Session } from "@/lib/api";
import { useAppConfig } from "@/lib/config";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";

/** An email address, or a phone number of at least 7 digits. */
function identifierProblem(value: string) {
  const v = value.trim();
  if (!v) return "Enter your email or phone number.";
  if (v.includes("@")) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : "Enter a valid email address, like name@school.com.";
  return v.replace(/\D/g, "").length >= 7 ? null : "Enter a full phone number, with country code if you have one.";
}

const RESEND_SECONDS = 30;

export default function Login() {
  const { signIn, expired } = useSession();
  const { c } = useTheme();
  const { demo } = useAppConfig();
  const [mode, setMode] = useState<"password" | "code">("password");
  const [identifier, setIdentifier] = useState("");
  const [idError, setIdError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const finish = (session: Session) => {
    signIn(session);
    const only = session.memberships.length === 1 && !session.user.is_platform_owner;
    router.replace(only ? "/app" : session.user.is_platform_owner && session.memberships.length === 0 ? "/platform" : "/choose-school");
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const checkIdentifier = () => {
    const problem = identifierProblem(identifier);
    setIdError(problem);
    return !problem;
  };

  const submitPassword = () => {
    if (!checkIdentifier()) return;
    run(async () => finish(await api<Session>("auth/login", { method: "POST", body: { identifier: identifier.trim(), password }, auth: false, school: null })));
  };

  const sendCode = () => {
    if (!checkIdentifier()) return;
    run(async () => {
      const res = await api<{ detail: string; demo_code?: string }>("auth/otp/request", { method: "POST", body: { identifier: identifier.trim() }, auth: false, school: null });
      setInfo(res.demo_code
        ? `Demo: no SMS is sent, so here is the code for ${identifier.trim()}: ${res.demo_code}. We have filled it in for you.`
        : `If ${identifier.trim()} belongs to a parent account, a 6-digit code is on its way. It works once, for 10 minutes.`);
      setCodeSent(true);
      setCode(res.demo_code ?? "");
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

  const identifierField = (
    <Field
      label="Email or phone"
      icon={Mail}
      autoComplete="username"
      textContentType="username"
      autoCapitalize="none"
      autoCorrect={false}
      keyboardType="email-address"
      value={identifier}
      error={idError}
      onChangeText={(t) => {
        setIdentifier(t);
        if (idError) setIdError(null);
      }}
      onBlur={() => identifier && checkIdentifier()}
      hint="The one your school has on file for you."
      returnKeyType="next"
    />
  );

  return (
    <AuthLayout server>
      <Txt size="3xl" weight="bold" style={{ letterSpacing: -0.5 }}>Welcome back</Txt>
      <Txt soft style={{ marginTop: 6 }}>Sign in with the email or phone number your school registered.</Txt>

      {expired && !error && <Alert tone="warn" title="Your session has ended" style={{ marginTop: 18 }}>For your security you were signed out. Please sign in again.</Alert>}

      <View accessibilityRole="tablist" style={{ marginTop: 22, flexDirection: "row", borderRadius: 12, backgroundColor: c.muted, padding: 4 }}>
        {(["password", "code"] as const).map((m) => {
          const on = mode === m;
          const IconC = m === "password" ? KeyRound : Smartphone;
          return (
            <Pressable key={m} onPress={() => switchMode(m)} accessibilityRole="tab" accessibilityState={{ selected: on }}
              style={{ flex: 1, minHeight: 40, borderRadius: 9, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: on ? c.surface : "transparent" }}>
              <IconC size={16} color={on ? c.ink : c.soft} />
              <Txt size="sm" weight="medium" color={on ? c.ink : c.soft}>{m === "password" ? "Password" : "Parent code"}</Txt>
            </Pressable>
          );
        })}
      </View>

      <Stack gap={16} style={{ marginTop: 18 }}>
        {error && <Alert>{error}</Alert>}

        {mode === "password" ? (
          <Enter key="password">
            <Stack gap={16}>
              {identifierField}
              <Field label="Password" icon={KeyRound} password autoComplete="current-password" textContentType="password" value={password} onChangeText={setPassword} onSubmitEditing={submitPassword} returnKeyType="go" />
              <Button size="lg" busy={busy} full disabled={!password} onPress={submitPassword}>Sign in</Button>
              <Pressable onPress={() => switchMode("code")} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, borderStyle: "dashed", borderColor: pressed ? c.brand : c.line, padding: 12, backgroundColor: pressed ? c.brandSoft : "transparent" })}>
                <HeartHandshake size={20} color={c.brand} />
                <Txt size="sm" style={{ flex: 1 }}><Txt size="sm" weight="bold">Parent? </Txt><Txt size="sm" soft>Skip the password: sign in with a code we send to your phone or email.</Txt></Txt>
              </Pressable>
            </Stack>
          </Enter>
        ) : (
          <Enter key="code">
            <Stack gap={16}>
              <View style={{ borderRadius: 18, borderWidth: 1, borderColor: c.brand + "33", backgroundColor: c.brandSoft + "99", padding: 14 }}>
                <Row gap={8}><MessageSquareText size={16} color={c.brand} /><Txt size="sm" weight="semibold">What is the Parent code?</Txt></Row>
                <Txt size="sm" soft style={{ marginTop: 6 }}>A way for parents to sign in <Txt size="sm" weight="bold">without a password</Txt>. We send a 6-digit code to the phone or email the school has for you. Each code works once and only for 10 minutes.</Txt>
                <Row gap={8} wrap style={{ marginTop: 10 }}>
                  {["1 · Your phone or email", "2 · The code we send"].map((s, i) => {
                    const on = (i === 0) !== codeSent;
                    return (
                      <View key={s} style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: on ? c.brand : c.surface }}>
                        <Txt size="xs" weight="semibold" color={on ? c.onBrand : c.soft}>{s}</Txt>
                      </View>
                    );
                  })}
                </Row>
              </View>
              {info && !error && <Alert tone="info">{info}</Alert>}
              {!codeSent ? (
                <>
                  {identifierField}
                  <Button size="lg" busy={busy} full onPress={sendCode}>Send me a code</Button>
                </>
              ) : (
                <>
                  <Field
                    label="6-digit code"
                    keyboardType="number-pad"
                    autoComplete="one-time-code"
                    textContentType="oneTimeCode"
                    maxLength={6}
                    autoFocus
                    placeholder="••••••"
                    value={code}
                    inputStyle={{ textAlign: "center", fontSize: 26, letterSpacing: 10, fontFamily: "PlusJakartaSans_700Bold" }}
                    onChangeText={(t) => {
                      const digits = t.replace(/\D/g, "").slice(0, 6);
                      setCode(digits);
                      setError(null);
                      if (digits.length === 6 && !busy) verifyCode(digits);
                    }}
                    hint={`Sent to ${identifier.trim()}.`}
                  />
                  <Button size="lg" busy={busy} full disabled={code.length !== 6} onPress={() => verifyCode()}>Sign in</Button>
                  <Row justify="space-between" wrap>
                    <Pressable onPress={() => { setCodeSent(false); setInfo(null); }} hitSlop={6}><Txt size="sm" weight="medium" soft>Use a different number</Txt></Pressable>
                    <Pressable disabled={wait > 0 || busy} onPress={sendCode} hitSlop={6}>
                      <Txt size="sm" weight="medium" color={wait > 0 || busy ? c.soft : c.brand}>{wait > 0 ? `Send again in ${wait}s` : "Send a new code"}</Txt>
                    </Pressable>
                  </Row>
                </>
              )}
              <Txt size="xs" soft>Parent code works for parent accounts only. Admins, teachers and students sign in with their password.</Txt>
            </Stack>
          </Enter>
        )}
      </Stack>

      <Pressable onPress={() => router.push("/invite")} style={{ marginTop: 26 }}>
        <Txt size="sm" soft>New here? <Txt size="sm" weight="semibold" color={c.brand}>Open your invite</Txt> to set your password.</Txt>
      </Pressable>

      {demo && demo.logins.length > 0 && (
        <View style={{ marginTop: 22, borderRadius: 18, borderWidth: 1, borderStyle: "dashed", borderColor: c.line, padding: 12 }}>
          <Txt size="xxs" weight="semibold" soft upper>Demo logins</Txt>
          <Row wrap gap={6} style={{ marginTop: 8 }}>
            {demo.logins.map(({ label, email }) => (
              <Pressable key={email} onPress={() => { switchMode("password"); setIdentifier(email); setPassword(demo.password); setIdError(null); }}
                style={({ pressed }) => ({ borderRadius: 999, borderWidth: 1, borderColor: pressed ? c.brand : c.line, paddingHorizontal: 10, paddingVertical: 5 })}>
                <Txt size="xs" weight="medium" soft>{label}</Txt>
              </Pressable>
            ))}
          </Row>
          {demo.codes_on_screen && (
            <Txt size="xs" soft style={{ marginTop: 8 }}>Parent code works too: choose Parent code and use {demo.logins.find((l) => l.role === "parent")?.email ?? "a parent's email"}. The code shows here instead of by SMS.</Txt>
          )}
        </View>
      )}
    </AuthLayout>
  );
}
