"use client";

import { Clock, Play, Smartphone, Volume2 } from "lucide-react";
import { useRef, useState } from "react";
import { Reveal } from "@/components/motion";

const SRC = "/video/vidyalaya-os-promo.mp4";
const POSTER = "/video/promo-poster.jpg";

/** The 45-second promo, in a phone frame. Nothing loads until it is played. */
export function PromoVideo() {
  const video = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  const play = () => {
    setStarted(true);
    video.current?.play().catch(() => {});
  };

  return (
    <section id="video" className="scroll-mt-20 py-16 sm:py-20">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_auto] lg:gap-16">
        <Reveal className="max-w-xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand">Watch</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">See Vidyalaya OS in 45 seconds</h2>
          <p className="mt-3 text-lg text-soft">
            A quick tour of one school day: attendance in a few taps, homework and quizzes, report cards and fees, and what parents see on their phone.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-soft">
            {[
              { icon: Clock, text: "Under a minute, start to finish" },
              { icon: Volume2, text: "Narrated, so turn the sound on" },
              { icon: Smartphone, text: "Made for phones; plays full screen too" },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand"><Icon className="size-4" aria-hidden /></span>
                {text}
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={100} className="relative mx-auto w-full max-w-[19rem]">
          <div className="absolute -inset-6 rounded-[3rem] bg-gradient-to-br from-brand/30 via-violet-400/25 to-sky-300/25 blur-3xl" aria-hidden />
          <div className="relative rounded-[2.5rem] border border-line bg-ink/90 p-2.5 shadow-[var(--shadow-pop)] dark:bg-surface">
            <div className="relative aspect-[9/16] overflow-hidden rounded-[2rem] bg-black">
              <video
                ref={video}
                src={SRC}
                poster={POSTER}
                preload="none"
                playsInline
                controls={started}
                onPlay={() => setStarted(true)}
                className="size-full object-cover"
                aria-label="Vidyalaya OS promo video, 45 seconds"
              />
              {!started && (
                <button
                  type="button"
                  onClick={play}
                  className="group absolute inset-0 flex items-center justify-center bg-black/10 transition hover:bg-black/25"
                  aria-label="Play the Vidyalaya OS promo video"
                >
                  <span className="flex size-16 items-center justify-center rounded-full bg-white/90 text-brand shadow-xl ring-8 ring-white/20 transition duration-300 group-hover:scale-110">
                    <Play className="ml-1 size-7 fill-current" aria-hidden />
                  </span>
                  <span className="absolute bottom-4 rounded-full bg-black/50 px-3 py-1 text-xs font-semibold text-white backdrop-blur">0:45</span>
                </button>
              )}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
