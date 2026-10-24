import { useEffect, useState } from "react";
import { View } from "react-native";
import { shortTime } from "@/lib/format";
import { hashIndex, useTheme } from "@/lib/theme";
import { Ping, Row, Stagger, Txt } from "./ui";

/** A colour that stays the same for a subject everywhere it is shown. */
export function useSubjectColor() {
  const { hues } = useTheme();
  return (name: string) => hues[hashIndex(name, hues.length)];
}

function nowHm() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** The current time as HH:MM, refreshed every minute. */
export function useNow() {
  const [now, setNow] = useState<string>(nowHm);
  useEffect(() => {
    const t = setInterval(() => setNow(nowHm()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export type Slot = { id: string; start: string; end: string; title: string; detail?: string };

/** Today's classes as a timeline, with the class going on now marked. */
export function Schedule({ slots, live = true }: { slots: Slot[]; live?: boolean }) {
  const now = useNow();
  const color = useSubjectColor();
  const { c } = useTheme();
  return (
    <Stagger gap={8}>
      {slots.map((s) => {
        const start = shortTime(s.start);
        const end = shortTime(s.end);
        const current = live && now >= start && now < end;
        const past = live && now >= end;
        const h = color(s.title);
        return (
          <View key={s.id} style={{ flexDirection: "row", gap: 12, opacity: past ? 0.55 : 1 }}>
            <View style={{ width: 52, paddingTop: 8, alignItems: "flex-end" }}>
              <Txt size="xs" weight="semibold" tabular>{start}</Txt>
              <Txt size="xs" soft tabular>{end}</Txt>
            </View>
            <View style={{ flex: 1, borderRadius: 12, borderLeftWidth: 4, borderLeftColor: h.bar, backgroundColor: h.tint, paddingHorizontal: 12, paddingVertical: 10, borderWidth: current ? 2 : 0, borderColor: c.brand }}>
              <Row justify="space-between" gap={8}>
                <Txt weight="semibold" numberOfLines={1} style={{ flex: 1 }}>{s.title}</Txt>
                {current && <Row gap={6}><Ping color={c.brand} size={8} /><Txt size="xs" weight="semibold" color={c.brand}>Now</Txt></Row>}
              </Row>
              {s.detail ? <Txt size="xs" soft numberOfLines={1}>{s.detail}</Txt> : null}
            </View>
          </View>
        );
      })}
    </Stagger>
  );
}
