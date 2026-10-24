import { Search, UserPlus, Users } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { DateField } from "@/components/Calendar";
import { useDialog } from "@/components/dialog";
import { useToast } from "@/components/toast";
import { Alert, Avatar, Badge, Button, Card, DataTable, Empty, Enter, ErrorState, Field, Grid, LinkText, Loading, PageHeader, Row, Screen, Span, Txt, statusTone } from "@/components/ui";
import { api, Page } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import type { Teacher } from "@/lib/types";
import { rows, useApi, useDebounced } from "@/lib/useApi";
import { compact, useForm } from "@/lib/useForm";

export default function TeachersPage() {
  const { tone } = useTheme();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const toast = useToast();
  const dialog = useDialog();
  const term = useDebounced(search);
  const teachers = useApi<Page<Teacher>>(`teachers/?search=${encodeURIComponent(term)}`);
  const form = useForm({ name: "", email: "", phone: "", employee_no: "", qualification: "", joined_on: "" });
  const list = rows(teachers.data);

  const act = async (t: Teacher, action: "leave" | "resend-invite") => {
    if (action === "leave" && !(await dialog.confirm({ title: `Mark ${t.name} as left?`, body: "Their classes become unassigned. Their records are kept.", confirmLabel: "Mark as left", danger: true }))) return;
    try {
      const res = await api<{ sent?: boolean; detail?: string }>(`teachers/${t.id}/${action}/`, { method: "POST" });
      if (action === "leave") toast.success(`${t.name} is marked as left.`);
      else if (res.sent) toast.success("Invite sent again.");
      else toast.info(res.detail ?? "Nothing sent.");
      teachers.reload();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Screen>
      <PageHeader title="Teachers" subtitle="Assign subjects and class teachers under Classes & subjects."
        actions={!adding ? <Button icon={UserPlus} onPress={() => setAdding(true)}>Add teacher</Button> : undefined} />
      {adding && (
        <Enter style={{ marginBottom: 18 }}>
          <Card title="New teacher" icon={UserPlus}>
            <Grid cols={{ base: 1, sm: 2, lg: 3 }} gap={12}>
              {form.error && <Span span={3}><Alert>{form.error}</Alert></Span>}
              <Field label="Full name" autoCapitalize="words" {...form.bind("name")} />
              <Field label="Email" keyboardType="email-address" autoCapitalize="none" hint="Email or phone is needed to log in." {...form.bind("email")} />
              <Field label="Phone" keyboardType="phone-pad" {...form.bind("phone")} />
              <Field label="Employee number" optional {...form.bind("employee_no")} />
              <Field label="Qualification" optional {...form.bind("qualification")} />
              <DateField label="Joined on" optional clearable value={form.values.joined_on} onChange={(v) => form.set("joined_on", v)} error={form.errors.joined_on} />
            </Grid>
            <Row wrap gap={8} style={{ marginTop: 14 }}>
              <Button busy={form.busy} onPress={form.submit((v) => api("teachers/", { method: "POST", body: compact(v) }), () => { setAdding(false); teachers.reload(); toast.success("Teacher added. Their invite is on its way."); })}>Save and send invite</Button>
              <Button variant="secondary" onPress={() => setAdding(false)}>Cancel</Button>
            </Row>
          </Card>
        </Enter>
      )}
      <Card>
        <View style={{ maxWidth: 360, marginBottom: 14 }}>
          <Field label="Search" icon={Search} placeholder="Name or employee no." value={search} onChangeText={setSearch} autoCorrect={false} returnKeyType="search" />
        </View>
        {teachers.error && !teachers.data ? <ErrorState message={teachers.error} onRetry={teachers.reload} /> : !teachers.data ? <Loading variant="table" /> : list.length === 0 ? <Empty icon={Users}>{term ? "No teachers match." : "No teachers yet."}</Empty> : (
          <DataTable rows={list} rowKey={(t) => t.id}
            columns={[
              { header: "Name", flex: 2, cell: (t) => (
                <Row gap={10}>
                  <Avatar name={t.name} size="sm" />
                  <View style={{ flex: 1 }}><Txt size="sm" weight="medium">{t.name}</Txt><Txt size="xs" soft numberOfLines={1}>{t.email ?? t.phone}</Txt></View>
                </Row>
              ) },
              { header: "Emp. no.", cell: (t) => t.employee_no || "-" },
              { header: "Teaches", flex: 2, cell: (t) => t.teaches.map((x) => `${x.section_name} ${x.subject_name}`).join(", ") || "-" },
              { header: "Login", cell: (t) => <Badge tone={statusTone(t.login_status)}>{t.login_status}</Badge> },
              { header: "Status", cell: (t) => <Badge tone={statusTone(t.status)}>{t.status}</Badge> },
              { header: "Actions", flex: 1.4, cell: (t) => (
                <Row wrap gap={14}>
                  {t.login_status === "invited" && <LinkText onPress={() => act(t, "resend-invite")}>Resend invite</LinkText>}
                  {t.status === "active" && <LinkText color={tone.bad.solid} onPress={() => act(t, "leave")}>Mark as left</LinkText>}
                </Row>
              ) },
            ]} />
        )}
      </Card>
    </Screen>
  );
}
