import { Award } from "lucide-react-native";
import { useEffect, useState } from "react";
import { TextInput, View } from "react-native";
import { useDialog } from "@/components/dialog";
import { useStaffSections } from "@/components/sections";
import { useToast } from "@/components/toast";
import { Avatar, Badge, Button, Card, Empty, ErrorState, Grid, LinkText, Loading, PageHeader, Row, Screen, Select, Stagger, StickyBar, Txt, useLayout } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { num, pct } from "@/lib/format";
import { useSession } from "@/lib/session";
import { FONTS, useTheme } from "@/lib/theme";
import type { Exam, ExamTerm } from "@/lib/types";
import { useApi } from "@/lib/useApi";

type RowT = { student: string; name: string; roll_no: number | null; total: string; total_max: string; percentage: number | null; grade: string | null; attendance: number | null; remarks: string; published_at: string | null };
type SectionCards = { exam_term: string; exam_term_name: string; section_name: string; rows: RowT[]; exams: Exam[]; published: boolean };

export default function ReportCardsPage() {
  const { c } = useTheme();
  const { md } = useLayout();
  const { hasRole } = useSession();
  const isAdmin = hasRole("admin");
  const terms = useApi<ExamTerm[]>("exam-terms/");
  const sections = useStaffSections();
  const [term, setTerm] = useState("");
  const [section, setSection] = useState("");
  const t = term || terms.data?.[0]?.id || "";
  const s = section || sections[0]?.id || "";
  const cards = useApi<SectionCards>(t && s ? `report-cards/section?exam_term=${t}&section=${s}` : null);
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const toast = useToast();
  const dialog = useDialog();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRemarks(Object.fromEntries((cards.data?.rows ?? []).map((r) => [r.student, r.remarks])));
  }, [cards.data]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      cards.reload();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };

  const saveRemarks = () => run(() => api("report-cards/remarks", { method: "PUT", body: { exam_term: t, section: s, rows: Object.entries(remarks).map(([student, r]) => ({ student, remarks: r })) } }), "Remarks saved.");

  const publish = async () => {
    try {
      setBusy(true);
      await api("report-cards/publish", { method: "POST", body: { exam_term: t, section: s } });
      toast.success("Published. Students and parents can see and print their report cards.");
      cards.reload();
    } catch (e) {
      const missing = e instanceof ApiError ? (e.data as { missing?: string[] })?.missing : undefined;
      if (missing) {
        const ok = await dialog.confirm({ title: "Some marks are missing", body: `${missing.length} mark${missing.length === 1 ? " is" : "s are"} not entered yet. Publish the report cards anyway?`, confirmLabel: "Publish anyway" });
        if (ok) await run(() => api("report-cards/publish", { method: "POST", body: { exam_term: t, section: s, allow_missing: true } }), "Report cards published.");
      } else toast.error(e, "Could not publish.");
    } finally {
      setBusy(false);
    }
  };

  const data = cards.data;
  const locked = Boolean(data?.rows.some((r) => r.published_at));

  return (
    <Screen>
      <PageHeader title="Report cards" subtitle="A term's marks, attendance and remarks. Students and parents see them once published." />
      <Card title="Section report cards" icon={Award}>
        <Grid cols={{ base: 1, md: 3 }} gap={12} style={{ marginBottom: 14 }}>
          <Select label="Term" value={t} onChange={setTerm} options={(terms.data ?? []).map((x) => ({ value: x.id, label: x.name }))} />
          <Select label="Section" value={s} onChange={setSection} options={sections.map((x) => ({ value: x.id, label: x.name }))} />
          <View style={{ justifyContent: "flex-end" }}>{data && <Badge tone={data.published ? "good" : "warn"}>{data.published ? "Published" : "Not published"}</Badge>}</View>
        </Grid>
        {terms.data?.length === 0 ? <Empty>Add an exam term under Tests &amp; marks first.</Empty> : !data ? (cards.error ? <ErrorState message={cards.error} onRetry={cards.reload} /> : <Loading rows={5} />) : (
          <>
            <Txt size="sm" soft style={{ marginBottom: 10 }}>
              Tests: {data.exams.length === 0 ? "none yet" : data.exams.map((e) => `${e.subject_name} (${e.marks_entered}/${e.students}${e.status === "published" ? ", published" : ""})`).join(", ")}
            </Txt>
            {data.rows.length === 0 ? <Empty>No students in this section.</Empty> : (
              <View style={{ borderRadius: 14, borderWidth: 1, borderColor: c.line, overflow: "hidden" }}>
                <Stagger gap={0}>
                  {data.rows.map((r, i) => (
                    <View key={r.student} style={{ flexDirection: md ? "row" : "column", gap: 12, paddingHorizontal: 12, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
                      <Row gap={10} align="flex-start" style={{ flex: 1 }}>
                        <Avatar name={r.name} size="sm" />
                        <View style={{ flex: 1 }}>
                          <LinkText href={`/app/report-cards/${r.student}/${t}`}>{`${r.roll_no ? `${r.roll_no}. ` : ""}${r.name}`}</LinkText>
                          <Txt size="sm" soft>{num(r.total)} / {num(r.total_max)} · {pct(r.percentage)} {r.grade ? `· ${r.grade}` : ""}</Txt>
                          <Txt size="sm" soft>Attendance {pct(r.attendance)}</Txt>
                        </View>
                      </Row>
                      <TextInput multiline textAlignVertical="top" placeholder="Teacher's remarks" placeholderTextColor={c.soft + "99"} value={remarks[r.student] ?? ""} editable={!locked}
                        onChangeText={(v) => setRemarks((m) => ({ ...m, [r.student]: v }))} accessibilityLabel={`Remarks for ${r.name}`}
                        style={{ flex: md ? 2 : undefined, minHeight: 76, borderRadius: 12, borderWidth: 1, borderColor: c.line, backgroundColor: locked ? c.muted : c.surface, paddingHorizontal: 12, paddingVertical: 10, fontFamily: FONTS.regular, fontSize: 15, color: c.ink, opacity: locked ? 0.7 : 1 }} />
                    </View>
                  ))}
                </Stagger>
              </View>
            )}
            {(!locked || isAdmin) && (
              <StickyBar>
                {!locked && <Button onPress={saveRemarks} busy={busy} variant="secondary">Save remarks</Button>}
                {isAdmin && !data.published && <Button onPress={publish} busy={busy}>Publish report cards</Button>}
                {isAdmin && locked && (
                  <Button variant="danger" busy={busy} onPress={async () => {
                    if (await dialog.confirm({ title: "Unpublish these report cards?", body: "Students and parents stop seeing them until you publish again.", confirmLabel: "Unpublish", danger: true })) {
                      run(() => api("report-cards/publish", { method: "DELETE", body: { exam_term: t, section: s } }), "Unpublished. Remarks can be edited again.");
                    }
                  }}>Unpublish</Button>
                )}
              </StickyBar>
            )}
          </>
        )}
      </Card>
    </Screen>
  );
}
