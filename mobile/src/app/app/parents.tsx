import { HeartHandshake, Search, UserPlus, X } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { useToast } from "@/components/toast";
import { Alert, Avatar, Badge, Button, Card, DataTable, Empty, Enter, ErrorState, Field, Grid, Loading, PageHeader, Press, Row, Screen, Stack, Txt, statusTone } from "@/components/ui";
import { api, Page } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import type { Guardian, Student } from "@/lib/types";
import { rows, useApi, useDebounced } from "@/lib/useApi";
import { compact, useForm } from "@/lib/useForm";

export default function ParentsPage() {
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const term = useDebounced(search);
  const toast = useToast();
  const parents = useApi<Page<Guardian>>(`guardians/?search=${encodeURIComponent(term)}`);
  const list = rows(parents.data);

  return (
    <Screen>
      <PageHeader title="Parents" subtitle="Parents can also be added from a student's page."
        actions={!adding ? <Button icon={UserPlus} onPress={() => setAdding(true)}>Add parent</Button> : undefined} />
      {adding && <AddParent onDone={() => { setAdding(false); parents.reload(); toast.success("Parent added. Their invite is on its way."); }} onCancel={() => setAdding(false)} />}
      <Card>
        <View style={{ maxWidth: 360, marginBottom: 14 }}>
          <Field label="Search" icon={Search} placeholder="Name, email or phone" value={search} onChangeText={setSearch} autoCorrect={false} autoCapitalize="none" returnKeyType="search" />
        </View>
        {parents.error && !parents.data ? <ErrorState message={parents.error} onRetry={parents.reload} /> : !parents.data ? <Loading variant="table" /> : list.length === 0 ? <Empty icon={HeartHandshake}>{term ? "No parents match." : "No parents yet."}</Empty> : (
          <DataTable rows={list} rowKey={(g) => g.id}
            columns={[
              { header: "Name", flex: 1.6, cell: (g) => (
                <Row gap={10}>
                  <Avatar name={g.name} size="sm" />
                  <View style={{ flex: 1 }}><Txt size="sm" weight="medium">{g.name}</Txt>{g.relation ? <Txt size="xs" soft>{g.relation}</Txt> : null}</View>
                </Row>
              ) },
              { header: "Contact", flex: 1.6, cell: (g) => [g.email, g.phone].filter(Boolean).join(" · ") || "-" },
              { header: "Children", flex: 1.6, cell: (g) => g.children.map((c) => `${c.name}${c.section_name ? ` (${c.section_name})` : ""}`).join(", ") || "-" },
              { header: "Login", cell: (g) => <Badge tone={statusTone(g.login_status)}>{g.login_status}</Badge> },
            ]} />
        )}
      </Card>
    </Screen>
  );
}

function AddParent({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { c, card } = useTheme();
  const form = useForm({ name: "", relation: "", email: "", phone: "" });
  const [search, setSearch] = useState("");
  const [children, setChildren] = useState<Student[]>([]);
  const term = useDebounced(search);
  const matches = useApi<Page<Student>>(term.length >= 2 ? `students/?search=${encodeURIComponent(term)}` : null);
  const options = rows(matches.data).filter((s) => !children.some((x) => x.id === s.id)).slice(0, 5);

  return (
    <Enter style={{ marginBottom: 18 }}>
      <Card title="New parent" icon={UserPlus}>
        <Stack gap={14}>
          {form.error && <Alert>{form.error}</Alert>}
          <Grid cols={{ base: 1, sm: 2, lg: 4 }} gap={12}>
            <Field label="Full name" autoCapitalize="words" {...form.bind("name")} />
            <Field label="Relation" placeholder="Mother" {...form.bind("relation")} />
            <Field label="Email" keyboardType="email-address" autoCapitalize="none" {...form.bind("email")} />
            <Field label="Phone" keyboardType="phone-pad" {...form.bind("phone")} />
          </Grid>
          <View style={{ maxWidth: 420 }}>
            <Field label="Link children" icon={Search} placeholder="Type a student's name" value={search} onChangeText={setSearch} autoCorrect={false} />
            {search.length >= 2 && (
              <Enter from={4}>
                <View style={[{ marginTop: 6, borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, padding: 4 }, card]}>
                  {options.length === 0 ? <Txt size="sm" soft style={{ padding: 10 }}>{matches.data ? "No students match." : "Searching…"}</Txt> : options.map((s) => (
                    <Press key={s.id} onPress={() => { setChildren([...children, s]); setSearch(""); }} style={{ minHeight: 44, justifyContent: "center", borderRadius: 10, paddingHorizontal: 12 }}>
                      <Txt size="sm">{s.name} <Txt size="sm" soft>{s.current_enrollment?.section_name ?? ""}</Txt></Txt>
                    </Press>
                  ))}
                </View>
              </Enter>
            )}
            <Row wrap gap={8} style={{ marginTop: children.length ? 10 : 0 }}>
              {children.map((x) => (
                <Press key={x.id} onPress={() => setChildren(children.filter((y) => y.id !== x.id))} accessibilityLabel={`Remove ${x.name}`}
                  style={{ minHeight: 34, flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 99, backgroundColor: c.brandSoft, paddingHorizontal: 12 }}>
                  <Txt size="xs" weight="semibold" color={c.brand}>{x.name}</Txt>
                  <X size={14} color={c.brand} />
                </Press>
              ))}
            </Row>
          </View>
          <Row wrap gap={8}>
            <Button busy={form.busy} onPress={form.submit((v) => api("guardians/", { method: "POST", body: { ...compact(v), child_ids: children.map((x) => x.id) } }), onDone)}>Save and send invite</Button>
            <Button variant="secondary" onPress={onCancel}>Cancel</Button>
          </Row>
        </Stack>
      </Card>
    </Enter>
  );
}
