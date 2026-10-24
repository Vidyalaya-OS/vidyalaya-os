import * as DocumentPicker from "expo-document-picker";
import { Download, FileUp, GraduationCap, Users } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useToast } from "@/components/toast";
import { Alert, Button, Card, Grid, PageHeader, Press, Row, Screen, Stack, Txt } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { download } from "@/lib/files";
import type { Icon } from "@/lib/nav";
import { useTheme } from "@/lib/theme";

type RowError = { row: number; errors: Record<string, unknown> };
type Result = { valid: boolean; rows: number; saved: number };
type Picked = { uri: string; name: string; mimeType?: string | null; size?: number | null };

export default function ImportPage() {
  return (
    <Screen>
      <PageHeader title="Import from a spreadsheet" subtitle="Upload a CSV or Excel file. Every row is checked first; if any row has a problem, nothing is saved." />
      <Grid cols={{ base: 1, lg: 2 }} gap={18}>
        <Importer kind="students" icon={GraduationCap} title="Students" help="Columns: admission_no, name, class, section (required), plus roll_no, dob, gender, email, phone and the parent's name, relation, email and phone. Class and section must already exist for the current year." />
        <Importer kind="teachers" icon={Users} title="Teachers" help="Columns: name (required), email or phone, employee_no, qualification, joined_on." />
      </Grid>
    </Screen>
  );
}

const TYPES = ["text/csv", "text/comma-separated-values", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel", "application/octet-stream"];

function Importer({ kind, title, help, icon }: { kind: "students" | "teachers"; title: string; help: string; icon: Icon }) {
  const { c, tone } = useTheme();
  const toast = useToast();
  const [file, setFile] = useState<Picked | null>(null);
  const [busy, setBusy] = useState<"check" | "import" | null>(null);
  const [fetching, setFetching] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [rowErrors, setRowErrors] = useState<RowError[]>([]);
  const [error, setError] = useState<string | null>(null);

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: TYPES, copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const f = res.assets[0];
    if (!/\.(csv|xlsx)$/i.test(f.name)) {
      setError("Choose a .csv or .xlsx file.");
      return;
    }
    setFile(f);
    setResult(null);
    setRowErrors([]);
    setError(null);
  };

  const upload = async (dryRun: boolean) => {
    if (!file) return;
    setBusy(dryRun ? "check" : "import");
    setError(null);
    setRowErrors([]);
    setResult(null);
    const body = new FormData();
    const type = file.name.toLowerCase().endsWith(".csv") ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    // React Native's FormData takes a file as { uri, name, type }.
    body.append("file", { uri: file.uri, name: file.name, type } as unknown as Blob);
    try {
      const r = await api<Result>(`imports/${kind}${dryRun ? "?dry_run=true" : ""}`, { method: "POST", body });
      setResult(r);
      if (r.saved) toast.success(`Imported ${r.saved} ${kind}.`);
    } catch (e) {
      if (e instanceof ApiError && e.status) {
        const data = e.data as { errors?: RowError[]; detail?: string } | null;
        setError(data?.detail ?? e.message);
        setRowErrors(data?.errors ?? []);
      } else setError("Could not reach the server.");
    } finally {
      setBusy(null);
    }
  };

  const downloadTemplate = async () => {
    setFetching(true);
    try {
      await download(`imports/${kind}`, `${kind}.csv`);
    } catch {
      toast.error("Could not download the template. Try again.");
    } finally {
      setFetching(false);
    }
  };

  return (
    <Card title={title} icon={icon} actions={<Button variant="ghost" size="sm" icon={Download} busy={fetching} onPress={downloadTemplate}>Template</Button>}>
      <Txt size="sm" soft style={{ marginBottom: 14 }}>{help}</Txt>
      <Press onPress={pick} accessibilityLabel={`Choose ${title} file`} scale={0.98}
        style={{ alignItems: "center", gap: 6, borderRadius: 18, borderWidth: 2, borderStyle: "dashed", borderColor: file ? c.brand : c.line, backgroundColor: file ? c.brandSoft : "transparent", paddingHorizontal: 16, paddingVertical: 28 }}>
        <FileUp size={32} color={c.brand} />
        <Txt size="sm" weight="semibold" center>{file ? file.name : "Tap to choose a CSV or Excel file"}</Txt>
        <Txt size="xs" soft>{file?.size ? `${Math.ceil(file.size / 1024)} KB · tap to change` : ".csv or .xlsx"}</Txt>
      </Press>
      <Row wrap gap={8} style={{ marginTop: 14 }}>
        <Button variant="secondary" disabled={!file || busy !== null} busy={busy === "check"} onPress={() => upload(true)}>Check file</Button>
        <Button disabled={!file || busy !== null} busy={busy === "import"} onPress={() => upload(false)}>Import</Button>
      </Row>
      <Stack gap={8} style={{ marginTop: result || error || rowErrors.length ? 14 : 0 }}>
        {result && <Alert tone="success">{result.saved ? `Imported ${result.saved} rows. Invites are on their way.` : `All ${result.rows} rows look good. Press Import to save them.`}</Alert>}
        {error && <Alert>{error}</Alert>}
        {rowErrors.length > 0 && (
          <View style={{ maxHeight: 290, borderRadius: 12, borderWidth: 1, borderColor: tone.bad.border, backgroundColor: tone.bad.bg }}>
            <ScrollView nestedScrollEnabled>
              {rowErrors.map((r, i) => (
                <View key={r.row} style={{ paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: i < rowErrors.length - 1 ? 1 : 0, borderColor: tone.bad.border }}>
                  <Txt size="sm">
                    <Txt size="sm" weight="semibold">Row {r.row}: </Txt>
                    {Object.entries(r.errors).map(([field, msg]) => `${field.replaceAll("_", " ")}: ${Array.isArray(msg) ? msg.join(" ") : typeof msg === "object" ? JSON.stringify(msg) : String(msg)}`).join("; ")}
                  </Txt>
                </View>
              ))}
            </ScrollView>
          </View>
        )}
      </Stack>
    </Card>
  );
}
