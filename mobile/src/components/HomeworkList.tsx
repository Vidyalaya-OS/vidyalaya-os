import * as Haptics from "expo-haptics";
import { BookOpen, Check, Paperclip } from "lucide-react-native";
import { View } from "react-native";
import { api, Page } from "@/lib/api";
import { download } from "@/lib/files";
import { formatDate, todayIso } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import type { Homework } from "@/lib/types";
import { rows, useApi } from "@/lib/useApi";
import { useToast } from "./toast";
import { Badge, Empty, ErrorState, Loading, Press, Row, Stagger, Txt } from "./ui";

export function HomeworkList({ query, canMarkDone, actions }: { query: string; canMarkDone?: boolean; actions?: (h: Homework, reload: () => void) => React.ReactNode }) {
  const { c, tone, card } = useTheme();
  const list = useApi<Page<Homework>>(`homework/?${query}`);
  const toast = useToast();
  const today = todayIso();

  const toggle = async (h: Homework) => {
    // Show the change at once; put it back if the server says no.
    const flip = (done: boolean) => list.setData(list.data ? { ...list.data, results: rows(list.data).map((x) => (x.id === h.id ? { ...x, done } : x)) } : null);
    flip(!h.done);
    Haptics.selectionAsync().catch(() => {});
    try {
      await api(`homework/${h.id}/done/`, { method: h.done ? "DELETE" : "POST" });
      if (!h.done) toast.success(`Marked "${h.title}" as done.`);
    } catch (e) {
      flip(Boolean(h.done));
      toast.error(e, "Could not update. Try again.");
    }
  };

  if (list.error && !list.data) return <ErrorState message={list.error} onRetry={list.reload} />;
  if (!list.data) return <Loading />;
  const items = rows(list.data);
  if (items.length === 0) return <Empty icon={BookOpen} title="No homework here">New homework shows up here as soon as a teacher posts it.</Empty>;
  return (
    <Stagger gap={10}>
      {items.map((h) => {
        const overdue = h.due_date < today && !h.done;
        return (
          <View key={h.id} style={[{ borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: h.done ? c.muted + "99" : c.surface, padding: 14, borderLeftWidth: overdue ? 4 : 1, borderLeftColor: overdue ? tone.bad.solid : c.line }, card]}>
            <Row justify="space-between" align="flex-start" gap={8} wrap>
              <View style={{ flex: 1, minWidth: 160 }}>
                <Txt weight="semibold" color={h.done ? c.soft : undefined} style={h.done ? { textDecorationLine: "line-through" } : undefined}>{h.title}</Txt>
                <Txt size="xs" soft>{h.subject_name} · {h.section_name}{h.teacher_name ? ` · ${h.teacher_name}` : ""}</Txt>
              </View>
              <Row gap={6} wrap>
                {h.done ? <Badge tone="good">Done</Badge> : overdue ? <Badge tone="bad">Overdue</Badge> : null}
                <Badge tone={h.due_date === today ? "warn" : "neutral"}>{`Due ${h.due_date === today ? "today" : formatDate(h.due_date)}`}</Badge>
              </Row>
            </Row>
            {h.instructions ? <Txt size="sm" style={{ marginTop: 8 }}>{h.instructions}</Txt> : null}
            {h.attachments.length > 0 && (
              <Row wrap gap={8} style={{ marginTop: 8 }}>
                {h.attachments.map((a) => (
                  <Press key={a.id} onPress={() => download(a.url, a.name).catch((e) => toast.error(e.message))}
                    style={{ minHeight: 36, flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, borderWidth: 1, borderColor: c.line, paddingHorizontal: 10 }}>
                    <Paperclip size={14} color={c.brand} />
                    <Txt size="xs" weight="medium" color={c.brand} numberOfLines={1} style={{ maxWidth: 200 }}>{a.name}</Txt>
                  </Press>
                ))}
              </Row>
            )}
            <Row wrap gap={10} style={{ marginTop: 12 }}>
              {h.done_count != null && <Txt size="sm" soft>{h.done_count} marked done</Txt>}
              {canMarkDone && (
                <Press onPress={() => toggle(h)} scale={0.94} accessibilityRole="checkbox" accessibilityState={{ checked: Boolean(h.done) }}
                  style={{ minHeight: 36, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, paddingHorizontal: 12, backgroundColor: h.done ? tone.good.bg : "transparent", borderWidth: h.done ? 0 : 1, borderColor: c.line }}>
                  <View style={{ width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, borderColor: h.done ? tone.good.solid : c.soft, backgroundColor: h.done ? tone.good.solid : "transparent", alignItems: "center", justifyContent: "center" }}>
                    {h.done && <Check size={12} color="#fff" strokeWidth={3} />}
                  </View>
                  <Txt size="sm" weight="medium" color={h.done ? tone.good.fg : c.ink}>{h.done ? "Done" : "Mark as done"}</Txt>
                </Press>
              )}
              {actions?.(h, list.reload)}
            </Row>
          </View>
        );
      })}
    </Stagger>
  );
}
