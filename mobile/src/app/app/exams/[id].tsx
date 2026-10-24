import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { TextInput, View } from "react-native";
import { useDialog } from "@/components/dialog";
import { useToast } from "@/components/toast";
import { Alert, Badge, Button, Card, Checkbox, ErrorState, Loading, PageHeader, Progress, Row, Screen, Stagger, StickyBar, Txt } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { formatDate, num } from "@/lib/format";
import { useSession } from "@/lib/session";
import { FONTS, useTheme } from "@/lib/theme";
import type { Exam, MarkRow } from "@/lib/types";
import { useApi } from "@/lib/useApi";

type Sheet = { exam: Exam; locked: boolean; rows: MarkRow[]; class_average: number | null; highest: string | null };
type Draft = Record<string, { marks: string; absent: boolean; remark: string }>;

export default function MarksPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c, tone } = useTheme();
  const { hasRole } = useSession();
  const sheet = useApi<Sheet>(`exams/${id}/marks/`);
  const [draft, setDraft] = useState<Draft>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const inputs = useRef<(React.ComponentRef<typeof TextInput> | null)[]>([]);
  const toast = useToast();
  const dialog = useDialog();

  useEffect(() => {
    setDraft(Object.fromEntries((sheet.data?.rows ?? []).map((r) => [r.enrollment, { marks: r.marks_obtained == null ? "" : num(r.marks_obtained), absent: r.is_absent, remark: r.remark }])));
  }, [sheet.data]);

  if (sheet.error && !sheet.data) return <Screen><ErrorState message={sheet.error} onRetry={sheet.reload} /></Screen>;
  if (!sheet.data) return <Screen><Loading variant="table" rows={8} /></Screen>;
  const { exam, locked } = sheet.data;
  const max = Number(exam.max_marks);
  const entered = Object.values(draft).filter((d) => d.absent || d.marks !== "").length;

  const save = async () => {
    const bad = Object.entries(draft).filter(([, d]) => !d.absent && d.marks !== "" && (Number(d.marks) < 0 || Number(d.marks) > max || Number.isNaN(Number(d.marks))));
    if (bad.length) {
      setNotice(`${bad.length} mark${bad.length === 1 ? " is" : "s are"} outside 0 to ${num(exam.max_marks)}. They are shown in red.`);
      return;
    }
    setBusy(true);
    setNotice(null);
    setRowErrors({});
    try {
      const rows = Object.entries(draft).map(([enrollment, d]) => ({ enrollment, marks_obtained: d.absent || d.marks === "" ? null : d.marks, is_absent: d.absent, remark: d.remark }));
      sheet.setData(await api<Sheet>(`exams/${id}/marks/`, { method: "PUT", body: { rows } }));
      toast.success("Marks saved.");
    } catch (e) {
      if (e instanceof ApiError) {
        const rowsErr = (e.data as { rows?: Record<string, string> })?.rows;
        if (rowsErr && typeof rowsErr === "object" && !Array.isArray(rowsErr)) setRowErrors(rowsErr);
        if (rowsErr) setNotice("Some marks need fixing. They are shown in red.");
        else toast.error(e);
      } else toast.error("Could not save the marks.");
    } finally {
      setBusy(false);
    }
  };

  const publish = async (allow = false): Promise<void> => {
    try {
      await api(`exams/${id}/publish/`, { method: "POST", body: { allow_missing: allow } });
      sheet.reload();
      toast.success("Published. Students and parents can see these results now.");
    } catch (e) {
      const missing = e instanceof ApiError ? (e.data as { missing?: string[] })?.missing : undefined;
      if (missing) {
        const ok = await dialog.confirm({ title: "Some marks are missing", body: `${missing.length} mark${missing.length === 1 ? " is" : "s are"} not entered yet. Publish anyway?`, confirmLabel: "Publish anyway" });
        if (ok) return publish(true);
      } else toast.error(e, "Could not publish.");
    }
  };

  const set = (enrollment: string, patch: Partial<Draft[string]>) => setDraft((d) => ({ ...d, [enrollment]: { ...d[enrollment], ...patch } }));

  return (
    <Screen>
      <PageHeader back="Tests & marks" title={`${exam.subject_name} · ${exam.section_name}`}
        subtitle={`${exam.exam_term_name} · out of ${num(exam.max_marks)}${exam.pass_marks ? `, pass ${num(exam.pass_marks)}` : ""}${exam.date ? ` · ${formatDate(exam.date)}` : ""}`}
        actions={<Badge tone={locked ? "good" : "warn"}>{locked ? "Published, marks locked" : "Entering marks"}</Badge>} />
      {notice && <Alert style={{ marginBottom: 14 }}>{notice}</Alert>}
      <Card title="Marks" description={`${entered} of ${sheet.data.rows.length} entered`} actions={<Txt size="sm" soft>Class average {sheet.data.class_average ?? "-"} · Highest {num(sheet.data.highest)}</Txt>}>
        <Progress value={sheet.data.rows.length ? (entered / sheet.data.rows.length) * 100 : 0} style={{ marginBottom: 14 }} />
        <View style={{ borderRadius: 14, borderWidth: 1, borderColor: c.line, overflow: "hidden" }}>
          <Stagger gap={0}>
            {sheet.data.rows.map((r, i) => {
              const d = draft[r.enrollment] ?? { marks: "", absent: false, remark: "" };
              const over = d.marks !== "" && (Number(d.marks) > max || Number(d.marks) < 0);
              const problem = rowErrors[r.enrollment] ?? (over ? (Number(d.marks) < 0 ? "Can't be below 0" : `Above ${num(exam.max_marks)}`) : null);
              return (
                <Row key={r.enrollment} wrap gap={10} style={{ paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: c.line, backgroundColor: problem ? tone.bad.bg + "99" : "transparent" }}>
                  <View style={{ flex: 1, minWidth: 140 }}>
                    <Txt size="sm" weight="medium" numberOfLines={1}>{r.roll_no ? `${r.roll_no}. ` : ""}{r.name}</Txt>
                    {problem && <Txt size="xs" weight="medium" color={tone.bad.fg}>{problem}</Txt>}
                  </View>
                  <TextInput
                    ref={(el) => { inputs.current[i] = el; }}
                    keyboardType="decimal-pad"
                    returnKeyType="next"
                    editable={!locked && !d.absent}
                    value={d.absent ? "" : d.marks}
                    onChangeText={(t) => set(r.enrollment, { marks: t.replace(/[^\d.]/g, "") })}
                    onSubmitEditing={() => inputs.current.slice(i + 1).find(Boolean)?.focus()}
                    accessibilityLabel={`Marks for ${r.name}`}
                    placeholder={d.absent ? "Absent" : "-"}
                    placeholderTextColor={c.soft + "99"}
                    style={{ height: 44, width: 88, borderRadius: 12, borderWidth: 1, borderColor: problem ? tone.bad.solid : c.line, backgroundColor: locked || d.absent ? c.muted : c.surface, paddingHorizontal: 12, textAlign: "right", fontFamily: FONTS.semibold, fontSize: 16, color: c.ink, fontVariant: ["tabular-nums"] }}
                  />
                  <Checkbox label="Absent" checked={d.absent} disabled={locked} onChange={(v) => set(r.enrollment, { absent: v })} />
                </Row>
              );
            })}
          </Stagger>
        </View>
        {!locked && (
          <StickyBar>
            <Button busy={busy} onPress={save}>Save marks</Button>
            {hasRole("admin") && <Button variant="secondary" onPress={() => publish()}>Publish results</Button>}
          </StickyBar>
        )}
      </Card>
    </Screen>
  );
}
