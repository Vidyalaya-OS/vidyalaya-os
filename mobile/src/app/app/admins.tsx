import { ShieldCheck, UserPlus } from "lucide-react-native";
import { View } from "react-native";
import { useDialog } from "@/components/dialog";
import { useToast } from "@/components/toast";
import { Alert, Avatar, Badge, Button, Card, DataTable, ErrorState, Field, Grid, LinkText, Loading, PageHeader, Row, Screen, Stack, Txt, statusTone } from "@/components/ui";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { useApi } from "@/lib/useApi";
import { compact, useForm } from "@/lib/useForm";

type Admin = { id: string; name: string; email: string; phone: string | null; login_status: string };

export default function AdminsPage() {
  const { user } = useSession();
  const { tone } = useTheme();
  const admins = useApi<Admin[]>("admins/");
  const form = useForm({ name: "", email: "", phone: "" });
  const toast = useToast();
  const dialog = useDialog();

  const remove = async (a: Admin) => {
    if (!(await dialog.confirm({ title: `Remove admin rights from ${a.name}?`, body: "Their login stays; they just can't manage the school any more.", confirmLabel: "Remove admin", danger: true }))) return;
    try {
      await api(`admins/${a.id}/`, { method: "DELETE" });
      toast.success(`${a.name} is no longer an admin.`);
      admins.reload();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Screen>
      <PageHeader title="School admins" subtitle="Admins can register people and change school settings." />
      <Grid cols={{ base: 1, lg: 2 }} gap={18}>
        <Card title="Admins" icon={ShieldCheck}>
          {admins.error && !admins.data ? <ErrorState message={admins.error} onRetry={admins.reload} /> : !admins.data ? <Loading /> : (
            <DataTable rows={admins.data} rowKey={(a) => a.id}
              columns={[
                { header: "Name", flex: 2, cell: (a) => (
                  <Row gap={10}>
                    <Avatar name={a.name} size="sm" />
                    <View style={{ flex: 1 }}><Txt size="sm" weight="medium">{a.name}{a.id === user?.id ? " (you)" : ""}</Txt><Txt size="xs" soft numberOfLines={1}>{a.email}</Txt></View>
                  </Row>
                ) },
                { header: "Login", cell: (a) => <Badge tone={statusTone(a.login_status)}>{a.login_status}</Badge> },
                { header: "", cell: (a) => (a.id !== user?.id ? <LinkText color={tone.bad.solid} onPress={() => remove(a)}>Remove</LinkText> : null) },
              ]} />
          )}
        </Card>
        <Card title="Add an admin" icon={UserPlus}>
          <Stack gap={12}>
            {form.error && <Alert>{form.error}</Alert>}
            <Field label="Full name" autoCapitalize="words" {...form.bind("name")} />
            <Field label="Email" keyboardType="email-address" autoCapitalize="none" {...form.bind("email")} />
            <Field label="Phone" optional keyboardType="phone-pad" {...form.bind("phone")} />
            <Button busy={form.busy} style={{ alignSelf: "flex-start" }}
              onPress={form.submit((v) => api("admins/", { method: "POST", body: compact(v) }), () => { admins.reload(); toast.success("Admin added. Their invite is on its way."); })}>Add and send invite</Button>
          </Stack>
        </Card>
      </Grid>
    </Screen>
  );
}
