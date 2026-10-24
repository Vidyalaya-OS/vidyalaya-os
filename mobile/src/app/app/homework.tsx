import * as DocumentPicker from "expo-document-picker";
import { BookOpen, CirclePlus, Paperclip, X } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { DateField } from "@/components/Calendar";
import { ChildSwitcher } from "@/components/Dashboards";
import { useDialog } from "@/components/dialog";
import { HomeworkList } from "@/components/HomeworkList";
import { useStaffSections } from "@/components/sections";
import { useToast } from "@/components/toast";
import { Alert, Button, Card, Empty, Field, Grid, IconButton, LinkText, PageHeader, Press, Row, Screen, Select, Span, Stack, Tabs, Txt } from "@/components/ui";
import { api, errorMessage, Page } from "@/lib/api";
import { useChildren } from "@/lib/children";
import { todayIso } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import type { Teacher } from "@/lib/types";
import { rows, useApi } from "@/lib/useApi";

export default function HomeworkPage() {
  const { hasRole } = useSession();
  return (
    <Screen>
      <PageHeader title="Homework" subtitle={hasRole("teacher") ? "Post homework to your classes and see who has done it." : "Homework, soonest due first."} />
      <Stack gap={16}>
        {hasRole("teacher") && <TeacherHomework />}
        {hasRole("student") && <Card title="Your homework" icon={BookOpen} description="Tick each one when you have finished it."><HomeworkList query="upcoming=true" canMarkDone /></Card>}
        {hasRole("parent") && <ParentHomework />}
        {hasRole("admin") && !hasRole("teacher") && <AdminHomework />}
      </Stack>
    </Screen>
  );
}

function TeacherHomework() {
  const { tone } = useTheme();
  const me = useApi<Page<Teacher>>("teachers/?mine=true");
  const pairs = rows(me.data)[0]?.teaches ?? [];
  const [tab, setTab] = useState<"upcoming" | "all">("upcoming");
  const [version, setVersion] = useState(0);
  const dialog = useDialog();
  const toast = useToast();
  return (
    <>
      <PostHomework pairs={pairs} loaded={Boolean(me.data)} onPosted={() => setVersion((v) => v + 1)} />
      <Card title="Your homework" icon={BookOpen}>
        <Tabs value={tab} onChange={setTab} tabs={[{ key: "upcoming", label: "Upcoming" }, { key: "all", label: "All" }]} />
        <HomeworkList key={`${tab}-${version}`} query={tab === "upcoming" ? "upcoming=true" : ""}
          actions={(h, reload) => (
            <LinkText color={tone.bad.solid} onPress={async () => {
              if (!(await dialog.confirm({ title: `Remove "${h.title}"?`, body: "Students and parents will no longer see it.", confirmLabel: "Remove", danger: true }))) return;
              try {
                await api(`homework/${h.id}/`, { method: "DELETE" });
                toast.success("Homework removed.");
              } catch (e) {
                toast.error(e);
              }
              reload();
            }}>Remove</LinkText>
          )} />
      </Card>
    </>
  );
}

type Picked = { uri: string; name: string; mimeType?: string | null; size?: number | null };

function PostHomework({ pairs, loaded, onPosted }: { pairs: Teacher["teaches"]; loaded: boolean; onPosted: () => void }) {
  const { c } = useTheme();
  const [pair, setPair] = useState("");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [due, setDue] = useState("");
  const [files, setFiles] = useState<Picked[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
    if (res.canceled) return;
    const big = res.assets.find((a) => (a.size ?? 0) > 10 * 1024 * 1024);
    if (big) toast.error(`${big.name} is larger than 10 MB.`);
    setFiles((f) => [...f, ...res.assets.filter((a) => (a.size ?? 0) <= 10 * 1024 * 1024)]);
  };

  const submit = async () => {
    if (!pair || !title.trim() || !due) return setError("Choose the class and subject, a due date and a title.");
    const [section, subject] = pair.split("|");
    const body = new FormData();
    Object.entries({ section, subject, title, instructions, due_date: due }).forEach(([k, v]) => body.append(k, v));
    // React Native's FormData takes a file as { uri, name, type }.
    for (const f of files) body.append("files", { uri: f.uri, name: f.name, type: f.mimeType ?? "application/octet-stream" } as unknown as Blob);
    setBusy(true);
    setError(null);
    try {
      await api("homework/", { method: "POST", body });
      setTitle(""); setInstructions(""); setDue(""); setFiles([]);
      toast.success("Posted. Students and parents can see it now.");
      onPosted();
    } catch (err) {
      setError(errorMessage(err, "Could not post."));
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return null;
  if (pairs.length === 0) return <Alert tone="info">You are not assigned to teach any subject yet, so you can&apos;t post homework.</Alert>;
  return (
    <Card title="Post homework" icon={CirclePlus}>
      <Grid cols={{ base: 1, md: 2 }} gap={12}>
        {error && <Span span={2}><Alert>{error}</Alert></Span>}
        <Select label="Class and subject" value={pair} onChange={setPair} options={pairs.map((p) => ({ value: `${p.section}|${p.subject}`, label: `${p.section_name} · ${p.subject_name}` }))} />
        <DateField label="Due date" value={due} min={todayIso()} onChange={setDue} />
        <Span span={2}><Field label="Title" value={title} onChangeText={setTitle} /></Span>
        <Span span={2}><Field label="Instructions" multiline value={instructions} onChangeText={setInstructions} /></Span>
        <Span span={2}>
          <Press onPress={pick} scale={0.98} style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 2, borderStyle: "dashed", borderColor: c.line, paddingHorizontal: 16, paddingVertical: 12 }}>
            <Paperclip size={20} color={c.brand} />
            <View style={{ flex: 1 }}>
              <Txt size="sm" weight="medium">{files.length ? `${files.length} file${files.length === 1 ? "" : "s"} attached` : "Attach files"}</Txt>
              <Txt size="xs" soft numberOfLines={1}>{files.length ? "Tap to add more" : "Optional, up to 10 MB each"}</Txt>
            </View>
          </Press>
          {files.length > 0 && (
            <Row wrap gap={6} style={{ marginTop: 8 }}>
              {files.map((f, i) => (
                <Row key={`${f.uri}${i}`} gap={2} style={{ borderRadius: 10, borderWidth: 1, borderColor: c.line, paddingLeft: 10 }}>
                  <Txt size="xs" numberOfLines={1} style={{ maxWidth: 180 }}>{f.name}</Txt>
                  <IconButton icon={X} label={`Remove ${f.name}`} size={30} onPress={() => setFiles((x) => x.filter((_, j) => j !== i))} />
                </Row>
              ))}
            </Row>
          )}
        </Span>
        <Button busy={busy} onPress={submit}>Post homework</Button>
      </Grid>
    </Card>
  );
}

function ParentHomework() {
  const { list, chosen, choose, loading } = useChildren();
  if (loading) return null;
  if (!chosen) return <Empty title="No children linked yet">Ask the school office to link your child to your account.</Empty>;
  return (
    <>
      <ChildSwitcher items={list.map((x) => ({ id: x.id, name: x.name, detail: x.current_enrollment?.section_name }))} value={chosen.id} onChange={choose} />
      <Card title={`${chosen.name}'s homework`} icon={BookOpen}>
        <HomeworkList key={chosen.id} query={`student=${chosen.id}&upcoming=true`} />
      </Card>
    </>
  );
}

function AdminHomework() {
  const sections = useStaffSections();
  const [section, setSection] = useState("");
  return (
    <Card title="All homework" icon={BookOpen}>
      <Select label="Section" value={section} onChange={setSection} style={{ marginBottom: 14, maxWidth: 360 }} options={[{ value: "", label: "All sections" }, ...sections.map((s) => ({ value: s.id, label: s.name }))]} />
      <HomeworkList key={section} query={section ? `section=${section}` : "upcoming=true"} />
    </Card>
  );
}
