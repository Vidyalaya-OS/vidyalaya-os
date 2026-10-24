import { router } from "expo-router";
import { Link2 } from "lucide-react-native";
import { useState } from "react";
import { AuthLayout } from "@/components/AuthLayout";
import { Button, Field, PageHeader, Stack, Txt } from "@/components/ui";

/** Paste the invite link from the school's email or SMS. */
export default function InviteLink() {
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const open = () => {
    const token = link.trim().replace(/\/+$/, "").split("/").pop()?.split("?")[0];
    if (!token || token.length < 8) return setError("Paste the whole link from your invite message.");
    router.push(`/invite/${encodeURIComponent(token)}`);
  };
  return (
    <AuthLayout server>
      <PageHeader back="Sign in" title="Open your invite" />
      <Stack gap={16}>
        <Txt soft>Your school sent you a link by email or SMS. Copy it and paste it here to choose your password.</Txt>
        <Field label="Invite link" icon={Link2} autoCapitalize="none" autoCorrect={false} value={link} error={error} placeholder="https://…/invite/…" onChangeText={(t) => { setLink(t); setError(null); }} onSubmitEditing={open} />
        <Button size="lg" full onPress={open}>Continue</Button>
      </Stack>
    </AuthLayout>
  );
}
