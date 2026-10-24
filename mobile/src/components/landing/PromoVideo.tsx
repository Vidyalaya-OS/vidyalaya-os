import { useVideoPlayer, VideoView } from "expo-video";
import { Clock, Play, Smartphone, Volume2 } from "lucide-react-native";
import { useState } from "react";
import { Image, Pressable, View } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { useTheme } from "@/lib/theme";
import { Row, Stack, Txt, useLayout } from "../ui";
import { Reveal, SectionTitle } from "./parts";

const SRC = require("../../../assets/video/vidyalaya-os-promo.mp4");
const POSTER = require("../../../assets/video/promo-poster.jpg");

const POINTS = [
  { icon: Clock, text: "Under a minute, start to finish" },
  { icon: Volume2, text: "Narrated, so turn the sound on" },
  { icon: Smartphone, text: "Made for phones; plays full screen too" },
];

/** The 45-second promo in a phone frame, the same video as the web's. */
export function PromoVideo() {
  const { c, dark, lift } = useTheme();
  const { md } = useLayout();
  const [started, setStarted] = useState(false);
  const player = useVideoPlayer(SRC, (p) => {
    p.loop = false;
  });

  const play = () => {
    setStarted(true);
    player.play();
  };

  const width = md ? 280 : 250;

  const text = (
    <Reveal style={{ flex: md ? 1 : undefined }}>
      <SectionTitle eyebrow="Watch" title="See Vidyalaya OS in 45 seconds" />
      <Txt size="lg" soft style={{ marginTop: 10 }}>
        A quick tour of one school day: attendance in a few taps, homework and quizzes, report cards and fees, and what parents see on their phone.
      </Txt>
      <Stack gap={12} style={{ marginTop: 20 }}>
        {POINTS.map(({ icon: IconC, text: t }) => (
          <Row key={t} gap={12}>
            <View style={{ width: 32, height: 32, borderRadius: 11, backgroundColor: c.brandSoft, alignItems: "center", justifyContent: "center" }}>
              <IconC size={16} color={c.brand} />
            </View>
            <Txt size="sm" soft style={{ flex: 1 }}>{t}</Txt>
          </Row>
        ))}
      </Stack>
    </Reveal>
  );

  const phone = (
    <Reveal delay={100} style={{ alignSelf: "center", width, marginTop: md ? 0 : 32 }}>
      {/* A soft coloured glow behind the phone. */}
      <Svg pointerEvents="none" style={{ position: "absolute", left: -40, right: -40, top: -40, bottom: -40 }} width={width + 80} height={(width * 16) / 9 + 100}>
        <Defs>
          <RadialGradient id="promo-glow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#7c4ddb" stopOpacity={dark ? 0.45 : 0.3} />
            <Stop offset="0.6" stopColor="#2f5bea" stopOpacity={dark ? 0.2 : 0.14} />
            <Stop offset="1" stopColor="#0ea5e9" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={width + 80} height={(width * 16) / 9 + 100} fill="url(#promo-glow)" />
      </Svg>
      <View style={[{ borderRadius: 40, borderWidth: 1, borderColor: c.line, backgroundColor: dark ? c.surface : "rgba(17,24,39,0.92)", padding: 10 }, lift]}>
        <View style={{ aspectRatio: 9 / 16, borderRadius: 31, overflow: "hidden", backgroundColor: "#000" }}>
          <VideoView
            player={player}
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
            contentFit="cover"
            nativeControls={started}
            fullscreenOptions={{ enable: true }}
            accessibilityLabel="Vidyalaya OS promo video, 45 seconds"
          />
          {!started && (
            <Pressable onPress={play} accessibilityRole="button" accessibilityLabel="Play the Vidyalaya OS promo video"
              style={({ pressed }) => ({ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.9 : 1 })}>
              <Image source={POSTER} resizeMode="cover" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: undefined, height: undefined }} />
              <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.1)" }} />
              <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(255,255,255,0.92)", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } }}>
                  <Play size={28} color="#2f5bea" fill="#2f5bea" style={{ marginLeft: 4 }} />
                </View>
              </View>
              <View style={{ position: "absolute", bottom: 16, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 12, paddingVertical: 4 }}>
                <Txt size="xs" weight="semibold" color="#fff">0:45</Txt>
              </View>
            </Pressable>
          )}
        </View>
      </View>
    </Reveal>
  );

  return md ? <Row gap={48} align="center">{text}{phone}</Row> : <View>{text}{phone}</View>;
}
