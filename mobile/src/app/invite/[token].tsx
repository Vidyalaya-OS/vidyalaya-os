import { router, useLocalSearchParams } from "expo-router";
import { KeyRound } from "lucide-react-native";
import { useEffect, useState } from "react";
import { AuthLayout } from "@/components/AuthLayout";
import { Alert, Button, Field, PageLoader, Stack, Txt } from "@/components/ui";
import { api, errorMessage, Session } from "@/lib/api";
import { useSession } from "@/lib/session";

type InviteInfo = { name: string; email: string | null; phone: string | null; school: string | null };

export default function InvitePage() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { signIn } = useSession();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<InviteInfo>(`auth/invites/${token}`, { auth: false, school: null })
      .then(setInfo)
      .catch((e) => setInvalid(errorMessage(e, "Could not open this invite.")));
  }, [token]);

  const submit = async () => {
    if (password !== confirm) return setError("The two passwords are different. Type the same password in both boxes.");
    setBusy(true);
    setError(null);
    try {
      signIn(await api<Session>(`auth/invites/${token}`, { method: "POST", body: { password }, auth: false, school: null }));
      router.replace("/");
    } catch (err) {
      setError(errorMessage(err, "Could not set your password."));
    } finally {
      setBusy(false);
    }
  };

  if (invalid) {
    return (
      <AuthLayout server>
        <Txt size="2xl" weight="bold" style={{ marginBottom: 14 }}>This invite can&apos;t be used</Txt>
        <Alert>{invalid}</Alert>
        <Txt size="sm" soft style={{ marginTop: 14 }}>Invite links work once and expire after a while. Ask your school office to send a new one.</Txt>
        <Button variant="secondary" style={{ marginTop: 18 }} onPress={() => router.replace("/login")}>Back to sign in</Button>
      </AuthLayout>
    );
  }
  if (!info) return <PageLoader label="Opening your invite" />;

  return (
    <AuthLayout>
      <Txt size="3xl" weight="bold" style={{ letterSpacing: -0.5 }}>Welcome, {info.name}</Txt>
      <Txt soft style={{ marginTop: 6 }}>
        {info.school ? `You've been invited to ${info.school}. ` : ""}Choose a password to finish setting up your login ({info.email ?? info.phone}).
      </Txt>
      <Stack gap={16} style={{ marginTop: 22 }}>
        {error && <Alert>{error}</Alert>}
        <Field label="New password" icon={KeyRound} password autoComplete="new-password" textContentType="newPassword" hint="At least 8 characters, not only numbers." value={password} onChangeText={setPassword} />
        <Field label="Repeat password" icon={KeyRound} password autoComplete="new-password" textContentType="newPassword" value={confirm} onChangeText={setConfirm} onSubmitEditing={submit} />
        <Button size="lg" busy={busy} full disabled={password.length < 8} onPress={submit}>Set password and sign in</Button>
      </Stack>
    </AuthLayout>
  );
}
