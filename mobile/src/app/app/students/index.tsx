import { GraduationCap, Search, UserPlus } from "lucide-react-native";
import { useState } from "react";
import { DateField } from "@/components/Calendar";
import { useToast } from "@/components/toast";
import { Alert, Avatar, Badge, Button, Card, DataTable, Divider, Empty, Enter, ErrorState, Field, Grid, Loading, PageHeader, Row, Screen, Select, Stack, Txt, go, statusTone } from "@/components/ui";
import { api, Page } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { Section, Student } from "@/lib/types";
import { rows, useApi, useDebounced } from "@/lib/useApi";
import { compact, useForm } from "@/lib/useForm";

const GENDERS = [
  { value: "", label: "Not given" },
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "other", label: "Other" },
];

export default function StudentsPage() {
  const { hasRole } = useSession();
  const [search, setSearch] = useState("");
  const [section, setSection] = useState("");
  const [adding, setAdding] = useState(false);
  const sections = useApi<Page<Section>>("sections/");
  const term = useDebounced(search);
  const toast = useToast();
  const query = Object.entries(compact({ search: term, section })).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
  const students = useApi<Page<Student>>(`students/?${query}`);
  const isAdmin = hasRole("admin");
  const list = rows(students.data);

  return (
    <Screen>
      <PageHeader title="Students" subtitle={isAdmin ? "Register students and link their parents." : "Students in the sections you teach."}
        actions={isAdmin && !adding ? <Button icon={UserPlus} onPress={() => setAdding(true)}>Add student</Button> : undefined} />
      {adding && (
        <AddStudent sections={rows(sections.data)} onCancel={() => setAdding(false)}
          onDone={() => { setAdding(false); students.reload(); toast.success("Student added. Login invites are on their way."); }} />
      )}
      <Card>
        <Grid cols={{ base: 1, md: 3 }} gap={12} style={{ marginBottom: 14 }}>
          <Field label="Search" icon={Search} placeholder="Name or admission no." value={search} onChangeText={setSearch} autoCorrect={false} returnKeyType="search" />
          <Select label="Section" value={section} onChange={setSection} options={[{ value: "", label: "All sections" }, ...rows(sections.data).map((s) => ({ value: s.id, label: s.display_name }))]} />
        </Grid>
        {students.error && !students.data ? <ErrorState message={students.error} onRetry={students.reload} /> : !students.data ? <Loading variant="table" rows={6} /> : list.length === 0 ? (
          <Empty icon={GraduationCap} title={term || section ? "No students match" : "No students yet"}>
            {term || section ? "Try another name or section." : isAdmin ? "Add a student, or import a spreadsheet from Import." : "Students show here once they are in your sections."}
          </Empty>
        ) : (
          <>
            <DataTable rows={list} rowKey={(s) => s.id} onRowPress={(s) => go(`/app/students/${s.id}`)}
              columns={[
                { header: "Name", flex: 2, cell: (s) => <Row gap={10}><Avatar name={s.name} size="sm" /><Txt size="sm" weight="medium" style={{ flex: 1 }}>{s.name}</Txt></Row> },
                { header: "Adm. no.", cell: (s) => s.admission_no },
                { header: "Section", cell: (s) => s.current_enrollment?.section_name ?? "-" },
                { header: "Roll", cell: (s) => String(s.current_enrollment?.roll_no ?? "-") },
                { header: "Parent", cell: (s) => s.guardians[0]?.name ?? "-" },
                { header: "Status", cell: (s) => <Badge tone={statusTone(s.status)}>{s.status}</Badge> },
              ]} />
            <Txt size="xs" soft style={{ marginTop: 10 }}>{students.data.count} students</Txt>
          </>
        )}
      </Card>
    </Screen>
  );
}

function AddStudent({ sections, onDone, onCancel }: { sections: Section[]; onDone: () => void; onCancel: () => void }) {
  const form = useForm({
    name: "", admission_no: "", dob: "", gender: "", section: "", roll_no: "", email: "", phone: "",
    guardian_name: "", guardian_relation: "", guardian_email: "", guardian_phone: "",
  });
  const save = form.submit(async (v) => {
    const guardian = compact({ name: v.guardian_name, relation: v.guardian_relation, email: v.guardian_email, phone: v.guardian_phone });
    await api("students/", {
      method: "POST",
      body: compact({
        name: v.name, admission_no: v.admission_no, dob: v.dob, gender: v.gender, section: v.section,
        roll_no: v.roll_no ? Number(v.roll_no) : undefined, email: v.email, phone: v.phone,
        guardian_list: v.guardian_name ? [{ ...guardian, is_primary: true }] : [],
      }),
    });
  }, onDone);
  const guardianError = form.errors.guardian_list;

  return (
    <Enter style={{ marginBottom: 18 }}>
      <Card title="New student" icon={UserPlus}>
        <Stack gap={14}>
          {form.error && <Alert>{form.error}</Alert>}
          <Grid cols={{ base: 1, sm: 2, lg: 3 }} gap={12}>
            <Field label="Full name" autoCapitalize="words" {...form.bind("name")} />
            <Field label="Admission number" autoCapitalize="characters" {...form.bind("admission_no")} />
            <DateField label="Date of birth" optional clearable value={form.values.dob} onChange={(v) => form.set("dob", v)} error={form.errors.dob} />
            <Select label="Gender" {...form.bind("gender")} options={GENDERS} />
            <Select label="Section" {...form.bind("section")} options={[{ value: "", label: "Assign later" }, ...sections.map((s) => ({ value: s.id, label: s.display_name }))]} />
            <Field label="Roll number" optional keyboardType="number-pad" {...form.bind("roll_no")} />
            <Field label="Student email" optional keyboardType="email-address" autoCapitalize="none" hint="Lets the student log in." {...form.bind("email")} />
            <Field label="Student phone" optional keyboardType="phone-pad" {...form.bind("phone")} />
          </Grid>
          <Divider />
          <Txt size="sm" weight="semibold">Parent</Txt>
          {guardianError && <Alert>{guardianError}</Alert>}
          <Grid cols={{ base: 1, sm: 2, lg: 4 }} gap={12}>
            <Field label="Parent name" autoCapitalize="words" {...form.bind("guardian_name")} />
            <Field label="Relation" placeholder="Mother" {...form.bind("guardian_relation")} />
            <Field label="Parent email" keyboardType="email-address" autoCapitalize="none" {...form.bind("guardian_email")} />
            <Field label="Parent phone" keyboardType="phone-pad" {...form.bind("guardian_phone")} />
          </Grid>
          <Txt size="xs" soft>If the parent is already registered (same email or phone), the child is added to their account.</Txt>
          <Row wrap gap={8}>
            <Button busy={form.busy} onPress={save}>Save and send invites</Button>
            <Button variant="secondary" onPress={onCancel}>Cancel</Button>
          </Row>
        </Stack>
      </Card>
    </Enter>
  );
}
