import { useLocalSearchParams } from "expo-router";
import { ArrowRightLeft, History, IdCard, UsersRound } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { DateField } from "@/components/Calendar";
import { useDialog } from "@/components/dialog";
import { StudentRecord } from "@/components/StudentRecord";
import { useToast } from "@/components/toast";
import { Alert, Avatar, Badge, Button, Card, DataTable, Divider, ErrorState, Facts, Field, Grid, LinkText, Loading, PageHeader, Row, Screen, Select, Span, Stack, Txt, statusTone } from "@/components/ui";
import { api, Page } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import type { Enrollment, Section, Student } from "@/lib/types";
import { rows, useApi } from "@/lib/useApi";
import { compact, useForm } from "@/lib/useForm";

const GENDERS = [
  { value: "", label: "Not given" },
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "other", label: "Other" },
];

export default function StudentPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { hasRole } = useSession();
  const { c, tone } = useTheme();
  const student = useApi<Student>(`students/${id}/`);
  const history = useApi<Enrollment[]>(`students/${id}/history/`);
  const sections = useApi<Page<Section>>("sections/");
  const toast = useToast();
  const dialog = useDialog();
  const isAdmin = hasRole("admin");

  if (student.error && !student.data) return <Screen><ErrorState message={student.error} onRetry={student.reload} /></Screen>;
  if (!student.data) return <Screen><Stack gap={18}><Loading variant="stats" /><Loading variant="cards" /></Stack></Screen>;
  const s = student.data;
  const reloadAll = () => { student.reload(); history.reload(); };

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      reloadAll();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Screen>
      <PageHeader back="Students"
        title={<Row gap={12}><Avatar name={s.name} size="lg" /><Txt size="2xl" weight="bold" style={{ flexShrink: 1 }}>{s.name}</Txt></Row>}
        subtitle={`Admission no. ${s.admission_no} · ${s.current_enrollment?.section_name ?? "No section"}`}
        actions={<Badge tone={statusTone(s.status)} dot>{s.status}</Badge>} />
      <Stack gap={18}>
        {!isAdmin && <StudentRecord studentId={s.id} />}
        <Grid cols={{ base: 1, lg: 2 }} gap={18}>
          <Card title="Details" icon={IdCard}>
            {isAdmin ? <EditStudent student={s} onSaved={() => { toast.success("Student details saved."); reloadAll(); }} /> : (
              <Facts cols={2} items={[{ label: "Date of birth", value: s.dob ?? "-" }, { label: "Roll number", value: String(s.current_enrollment?.roll_no ?? "-") }]} />
            )}
          </Card>
          <Card title="Parents" icon={UsersRound}>
            {s.guardians.length === 0 ? <Txt size="sm" soft>No parent linked.</Txt> : (
              <Stack gap={8}>
                {s.guardians.map((g) => (
                  <Row key={g.id} align="flex-start" justify="space-between" gap={8} style={{ borderRadius: 12, borderWidth: 1, borderColor: c.line, paddingHorizontal: 12, paddingVertical: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Row gap={6} wrap><Txt size="sm" weight="medium">{g.name}</Txt>{g.is_primary && <Badge>Primary</Badge>}</Row>
                      <Txt size="sm" soft>{[g.relation, g.email, g.phone].filter(Boolean).join(" · ")}</Txt>
                    </View>
                    {isAdmin && (
                      <LinkText color={tone.bad.solid} onPress={async () => {
                        if (await dialog.confirm({ title: `Unlink ${g.name}?`, body: `They will no longer see ${s.name}'s records.`, confirmLabel: "Unlink", danger: true })) {
                          run(() => api(`students/${s.id}/guardians/${g.id}/`, { method: "DELETE" }), "Parent unlinked.");
                        }
                      }}>Unlink</LinkText>
                    )}
                  </Row>
                ))}
              </Stack>
            )}
            {isAdmin && <AddParent studentId={s.id} onDone={() => { toast.success("Parent linked."); reloadAll(); }} />}
          </Card>
          {isAdmin && s.status === "active" && (
            <Card title="Move or leave" icon={ArrowRightLeft}>
              <MoveForm student={s} sections={rows(sections.data)} onDone={() => { toast.success("Student moved."); reloadAll(); }} />
              <Divider style={{ marginVertical: 16 }} />
              <LeaveForm onLeave={async (left_on, status) => {
                if (await dialog.confirm({ title: `Mark ${s.name} as left?`, body: "Nothing is deleted. Their attendance, marks and fees stay on record.", confirmLabel: "Mark as left", danger: true })) {
                  run(() => api(`students/${s.id}/leave/`, { method: "POST", body: { left_on, status } }), "Marked as left. Their records are kept.");
                }
              }} />
            </Card>
          )}
          {isAdmin && s.status !== "active" && (
            <Card title="Rejoin">
              <Button variant="secondary" onPress={() => run(() => api(`students/${s.id}/rejoin/`, { method: "POST" }), "Student is active again. Assign a section.")}>Mark as active again</Button>
            </Card>
          )}
          <Card title="Class history" icon={History}>
            <DataTable rows={history.data ?? []} rowKey={(e) => e.id}
              columns={[
                { header: "Year", cell: (e) => e.academic_year_name },
                { header: "Section", cell: (e) => e.section_name },
                { header: "Roll", cell: (e) => String(e.roll_no ?? "-") },
                { header: "Status", cell: (e) => <Badge tone={statusTone(e.status)}>{e.status}</Badge> },
              ]} />
          </Card>
        </Grid>
        {isAdmin && s.login_status === "invited" && (s.email || s.phone) && (
          <Button variant="ghost" style={{ alignSelf: "flex-start" }} onPress={() => run(() => api(`students/${s.id}/resend-invite/`, { method: "POST" }), "Invite sent again.")}>Resend login invite</Button>
        )}
        {isAdmin && <StudentRecord studentId={s.id} />}
      </Stack>
    </Screen>
  );
}

function EditStudent({ student, onSaved }: { student: Student; onSaved: () => void }) {
  const form = useForm({ name: student.name, admission_no: student.admission_no, dob: student.dob ?? "", gender: student.gender, email: student.email ?? "", phone: student.phone ?? "" });
  return (
    <Grid cols={{ base: 1, sm: 2 }} gap={12}>
      {form.error && <Span span={2}><Alert>{form.error}</Alert></Span>}
      <Field label="Full name" {...form.bind("name")} />
      <Field label="Admission number" {...form.bind("admission_no")} />
      <DateField label="Date of birth" optional clearable value={form.values.dob} onChange={(v) => form.set("dob", v)} error={form.errors.dob} />
      <Select label="Gender" {...form.bind("gender")} options={GENDERS} />
      <Field label="Email" keyboardType="email-address" autoCapitalize="none" {...form.bind("email")} />
      <Field label="Phone" keyboardType="phone-pad" {...form.bind("phone")} />
      <Button busy={form.busy} variant="secondary" style={{ alignSelf: "flex-start" }}
        onPress={form.submit((v) => api(`students/${student.id}/`, { method: "PATCH", body: { ...v, dob: v.dob || null } }), onSaved)}>Save changes</Button>
    </Grid>
  );
}

function AddParent({ studentId, onDone }: { studentId: string; onDone: () => void }) {
  const form = useForm({ name: "", relation: "", email: "", phone: "" });
  return (
    <View style={{ marginTop: 16 }}>
      <Grid cols={{ base: 1, sm: 2 }} gap={12}>
        {form.error && <Span span={2}><Alert>{form.error}</Alert></Span>}
        <Field label="Parent name" autoCapitalize="words" {...form.bind("name")} />
        <Field label="Relation" placeholder="Father" {...form.bind("relation")} />
        <Field label="Email" keyboardType="email-address" autoCapitalize="none" {...form.bind("email")} />
        <Field label="Phone" keyboardType="phone-pad" {...form.bind("phone")} />
        <Button busy={form.busy} variant="secondary" style={{ alignSelf: "flex-start" }}
          onPress={form.submit((v) => api(`students/${studentId}/guardians/`, { method: "POST", body: compact(v) }), onDone)}>Link parent</Button>
      </Grid>
    </View>
  );
}

function MoveForm({ student, sections, onDone }: { student: Student; sections: Section[]; onDone: () => void }) {
  const form = useForm({ section: "", roll_no: "" });
  const choices = sections.filter((s) => s.id !== student.current_enrollment?.section);
  return (
    <Stack gap={12}>
      {form.error && <Alert>{form.error}</Alert>}
      <Grid cols={{ base: 1, sm: 3 }} gap={12}>
        <Select label="Move to section" {...form.bind("section")} options={choices.map((s) => ({ value: s.id, label: s.display_name }))} />
        <Field label="New roll number" optional keyboardType="number-pad" {...form.bind("roll_no")} />
        <View style={{ justifyContent: "flex-end" }}>
          <Button busy={form.busy} variant="secondary" disabled={!form.values.section}
            onPress={form.submit((v) => api(`students/${student.id}/move/`, { method: "POST", body: { section: v.section, roll_no: v.roll_no ? Number(v.roll_no) : null } }), onDone)}>Move</Button>
        </View>
      </Grid>
    </Stack>
  );
}

function LeaveForm({ onLeave }: { onLeave: (date: string, status: string) => void }) {
  const [date, setDate] = useState("");
  const [status, setStatus] = useState("left");
  return (
    <Grid cols={{ base: 1, sm: 3 }} gap={12}>
      <DateField label="Leaving date" value={date} onChange={setDate} />
      <Select label="Reason" value={status} onChange={setStatus} options={[{ value: "left", label: "Left the school" }, { value: "graduated", label: "Graduated" }]} />
      <View style={{ justifyContent: "flex-end" }}>
        <Button variant="danger" disabled={!date} onPress={() => onLeave(date, status)}>Mark as left</Button>
      </View>
    </Grid>
  );
}
