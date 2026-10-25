import { router, useLocalSearchParams } from "expo-router";
import { Mail } from "lucide-react-native";
import { useState } from "react";
import { AuthLayout } from "@/components/AuthLayout";
import { Alert, Button, Field, PageHeader, Stack, Txt } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

/** Ask for a link to choose a new password. The link opens on the web. */
export default function ForgotPassword() {
  const params = useLocalSearchParams<{ identifier?: string }>();
  const [identifier, setIdentifier] = useState(params.identifier ?? "");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!identifier.trim()) return setError("Enter your email or phone number.");
    setBusy(true);
    setError(null);
    try {
      // The answer is the same whether or not the account exists.
      const res = await api<{ detail: string }>("auth/password-reset", { method: "POST", body: { identifier: identifier.trim() }, auth: false, school: null });
      setSent(res.detail);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout server>
      <PageHeader back="Sign in" title="Forgot your password?" />
      {sent ? (
        <Stack gap={16}>
          <Alert tone="info">{sent}</Alert>
          <Txt size="sm" soft>Open the link on this phone or a computer to choose a new password, then sign in here. It works once and expires soon.</Txt>
          <Button variant="secondary" onPress={() => router.replace("/login")}>Back to sign in</Button>
        </Stack>
      ) : (
        <Stack gap={16}>
          <Txt soft>Enter the email or phone number you sign in with. We will send a link to choose a new password.</Txt>
          {error && <Alert>{error}</Alert>}
          <Field label="Email or phone" icon={Mail} autoCapitalize="none" autoCorrect={false} autoComplete="username" value={identifier} onChangeText={setIdentifier} onSubmitEditing={submit} />
          <Button size="lg" busy={busy} full onPress={submit}>Send me a link</Button>
        </Stack>
      )}
    </AuthLayout>
  );
}
