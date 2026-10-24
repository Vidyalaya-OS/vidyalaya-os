import { useLocalSearchParams } from "expo-router";
import { FileDown, Printer } from "lucide-react-native";
import { useState } from "react";
import { Image, ScrollView, View } from "react-native";
import { useToast } from "@/components/toast";
import { Alert, Button, Enter, ErrorState, Facts, Grid, Loading, PageHeader, Row, Screen, Txt } from "@/components/ui";
import { esc, printHtml, printPage, sharePdf } from "@/lib/files";
import { formatDate, num, pct } from "@/lib/format";
import { absolute } from "@/lib/server";
import { useTheme } from "@/lib/theme";
import type { ReportCard } from "@/lib/types";
import { useApi } from "@/lib/useApi";

function cardHtml(c: ReportCard) {
  const rowsHtml = c.result.subjects.map((s) => `<tr><td>${esc(s.subject_name)}</td><td class="right">${s.is_absent ? "Absent" : esc(num(s.marks_obtained))}</td><td class="right">${esc(num(s.max_marks))}</td><td class="right">${esc(pct(s.percentage))}</td><td class="bold">${esc(s.grade ?? "-")}</td><td class="right">${esc(s.class_average ?? "-")}</td></tr>`).join("");
  return printPage(`Report card · ${c.student.name}`, `
    <div class="head"><div>${c.school.logo ? `<img src="${esc(absolute(c.school.logo))}" style="height:56px;float:left;margin-right:12px">` : ""}<h1>${esc(c.school.name)}</h1>${c.school.address ? `<div class="soft">${esc(c.school.address)}</div>` : ""}<div class="bold" style="margin-top:4px">Report card · ${esc(c.result.exam_term_name)} · ${esc(c.academic_year)}</div></div></div>
    <div class="grid">
      <div><div class="soft">Student</div><div class="bold">${esc(c.student.name)}</div></div>
      <div><div class="soft">Class</div><div class="bold">${esc(c.section_name ?? "-")}</div></div>
      <div><div class="soft">Roll no.</div><div class="bold">${esc(c.student.roll_no ?? "-")}</div></div>
      <div><div class="soft">Admission no.</div><div class="bold">${esc(c.student.admission_no)}</div></div>
    </div>
    <table><thead><tr><th>Subject</th><th class="right">Marks</th><th class="right">Out of</th><th class="right">%</th><th>Grade</th><th class="right">Class avg.</th></tr></thead>
    <tbody>${rowsHtml || `<tr><td colspan="6" class="soft">No marks yet.</td></tr>`}</tbody>
    <tfoot><tr class="bold"><td>Total</td><td class="right">${esc(num(c.result.total))}</td><td class="right">${esc(num(c.result.total_max))}</td><td class="right">${esc(pct(c.result.percentage))}</td><td>${esc(c.result.grade ?? "-")}</td><td></td></tr></tfoot></table>
    <div style="display:flex;gap:24px;margin-top:18px"><div style="flex:1"><h2>Attendance</h2>${esc(pct(c.attendance.percentage))} (${c.attendance.attended} of ${c.attendance.marked_days} days)</div><div style="flex:1"><h2>Remarks</h2><div style="white-space:pre-line">${esc(c.remarks || "-")}</div></div></div>
    <p class="soft" style="font-size:11px;margin-top:18px">Grades: ${esc(c.bands.map((b) => `${b.grade} ${b.min}%+`).join(" · "))}</p>
    <div style="display:flex;gap:40px;margin-top:56px;text-align:center;font-size:11px" class="soft"><div style="flex:1;border-top:1px solid #e1e6ef;padding-top:4px">Class teacher${c.class_teacher ? `: ${esc(c.class_teacher)}` : ""}</div><div style="flex:1;border-top:1px solid #e1e6ef;padding-top:4px">Principal</div></div>
    ${c.published_at ? `<p class="soft right" style="font-size:11px;margin-top:14px">Published ${esc(formatDate(c.published_at))}</p>` : ""}`);
}

/** A term report card, to read, print or save as a PDF. */
export default function ReportCardPage() {
  const { student, term } = useLocalSearchParams<{ student: string; term: string }>();
  const { c: col, lift } = useTheme();
  const card = useApi<ReportCard>(`report-cards/students/${student}/${term}`);
  const toast = useToast();
  const [busy, setBusy] = useState<"print" | "pdf" | null>(null);
  if (card.error && !card.data) return <Screen><ErrorState message={card.error} onRetry={card.reload} /></Screen>;
  if (!card.data) return <Screen><Loading variant="table" rows={6} /></Screen>;
  const c = card.data;
  const doIt = async (kind: "print" | "pdf") => {
    setBusy(kind);
    try {
      if (kind === "print") await printHtml(cardHtml(c));
      else await sharePdf(cardHtml(c), `Report card ${c.student.name} ${c.result.exam_term_name}`);
    } catch (e) {
      toast.error(e, "Could not prepare the report card.");
    } finally {
      setBusy(null);
    }
  };
  return (
    <Screen>
      <PageHeader back="Back" title="Report card" subtitle={`${c.student.name} · ${c.result.exam_term_name}`}
        actions={<><Button icon={Printer} busy={busy === "print"} onPress={() => doIt("print")}>Print</Button><Button variant="secondary" icon={FileDown} busy={busy === "pdf"} onPress={() => doIt("pdf")}>Save PDF</Button></>} />
      {!c.published_at && <Alert tone="info" style={{ marginBottom: 14 }}>Draft: students and parents can&apos;t see this until it is published.</Alert>}
      <Enter>
        <View style={[{ maxWidth: 760, width: "100%", alignSelf: "center", borderRadius: 18, borderWidth: 1, borderColor: col.line, backgroundColor: col.surface, padding: 20 }, lift]}>
          <Row gap={14} style={{ borderBottomWidth: 3, borderBottomColor: col.brand, paddingBottom: 14 }}>
            {c.school.logo ? <Image source={{ uri: absolute(c.school.logo) }} style={{ width: 56, height: 56 }} resizeMode="contain" /> : null}
            <View style={{ flex: 1 }}>
              <Txt size="xl" weight="semibold">{c.school.name}</Txt>
              {c.school.address ? <Txt size="sm" soft>{c.school.address}</Txt> : null}
              <Txt size="sm" weight="medium" style={{ marginTop: 4 }}>Report card · {c.result.exam_term_name} · {c.academic_year}</Txt>
            </View>
          </Row>
          <View style={{ paddingVertical: 14 }}>
            <Facts items={[
              { label: "Student", value: c.student.name },
              { label: "Class", value: c.section_name ?? "-" },
              { label: "Roll no.", value: String(c.student.roll_no ?? "-") },
              { label: "Admission no.", value: c.student.admission_no },
            ]} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ minWidth: 520, flex: 1 }}>
              <View style={{ flexDirection: "row", borderTopWidth: 1, borderBottomWidth: 1, borderColor: col.line, paddingVertical: 8 }}>
                {["Subject", "Marks", "Out of", "%", "Grade", "Class avg."].map((h, i) => <Txt key={h} size="xxs" weight="semibold" soft upper style={{ flex: i === 0 ? 2 : 1, textAlign: i === 0 || i === 4 ? "left" : "right", paddingRight: 8 }}>{h}</Txt>)}
              </View>
              {c.result.subjects.map((s) => (
                <View key={s.exam} style={{ flexDirection: "row", borderBottomWidth: 1, borderColor: col.line, paddingVertical: 9 }}>
                  <Txt size="sm" style={{ flex: 2, paddingRight: 8 }}>{s.subject_name}</Txt>
                  <Txt size="sm" tabular style={{ flex: 1, textAlign: "right", paddingRight: 8 }}>{s.is_absent ? "Absent" : num(s.marks_obtained)}</Txt>
                  <Txt size="sm" tabular style={{ flex: 1, textAlign: "right", paddingRight: 8 }}>{num(s.max_marks)}</Txt>
                  <Txt size="sm" tabular style={{ flex: 1, textAlign: "right", paddingRight: 8 }}>{pct(s.percentage)}</Txt>
                  <Txt size="sm" weight="medium" style={{ flex: 1, paddingRight: 8 }}>{s.grade ?? "-"}</Txt>
                  <Txt size="sm" tabular style={{ flex: 1, textAlign: "right", paddingRight: 8 }}>{String(s.class_average ?? "-")}</Txt>
                </View>
              ))}
              {c.result.subjects.length === 0 && <Txt size="sm" soft center style={{ paddingVertical: 14 }}>No marks yet.</Txt>}
              <View style={{ flexDirection: "row", paddingVertical: 9 }}>
                <Txt size="sm" weight="semibold" style={{ flex: 2 }}>Total</Txt>
                <Txt size="sm" weight="semibold" tabular style={{ flex: 1, textAlign: "right", paddingRight: 8 }}>{num(c.result.total)}</Txt>
                <Txt size="sm" weight="semibold" tabular style={{ flex: 1, textAlign: "right", paddingRight: 8 }}>{num(c.result.total_max)}</Txt>
                <Txt size="sm" weight="semibold" tabular style={{ flex: 1, textAlign: "right", paddingRight: 8 }}>{pct(c.result.percentage)}</Txt>
                <Txt size="sm" weight="semibold" style={{ flex: 1 }}>{c.result.grade ?? "-"}</Txt>
                <View style={{ flex: 1 }} />
              </View>
            </View>
          </ScrollView>
          <Grid cols={{ base: 1, md: 2 }} gap={16} style={{ marginTop: 14 }}>
            <View>
              <Txt weight="semibold">Attendance</Txt>
              <Txt size="sm">{pct(c.attendance.percentage)} ({c.attendance.attended} of {c.attendance.marked_days} days)</Txt>
            </View>
            <View>
              <Txt weight="semibold">Remarks</Txt>
              <Txt size="sm">{c.remarks || "-"}</Txt>
            </View>
          </Grid>
          <Txt size="xs" soft style={{ marginTop: 16 }}>Grades: {c.bands.map((b) => `${b.grade} ${b.min}%+`).join(" · ")}</Txt>
          <Row gap={30} style={{ marginTop: 36 }}>
            <View style={{ flex: 1, borderTopWidth: 1, borderTopColor: col.line, paddingTop: 4 }}><Txt size="xs" soft center>Class teacher{c.class_teacher ? `: ${c.class_teacher}` : ""}</Txt></View>
            <View style={{ flex: 1, borderTopWidth: 1, borderTopColor: col.line, paddingTop: 4 }}><Txt size="xs" soft center>Principal</Txt></View>
          </Row>
          {c.published_at && <Txt size="xs" soft style={{ marginTop: 14, textAlign: "right" }}>Published {formatDate(c.published_at)}</Txt>}
        </View>
      </Enter>
    </Screen>
  );
}
