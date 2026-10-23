import { cx } from "@/components/ui";

// The SMS logo: three stacked tiles, read from the bottom up as the school,
// its people and their day-to-day records. The flat mark is an SVG that works
// at any size (and is drawn into the app icons); the 3D mark builds the same
// stack from real layers that float apart and turn slowly.

/** The flat logo mark. */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <defs>
        <linearGradient id="sms-top" x1="6" y1="6" x2="42" y2="26" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38bdf8" />
          <stop offset="1" stopColor="#2f5bea" />
        </linearGradient>
        <linearGradient id="sms-mid" x1="6" y1="14" x2="42" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6366f1" />
          <stop offset="1" stopColor="#4338ca" />
        </linearGradient>
        <linearGradient id="sms-low" x1="6" y1="22" x2="42" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor="#a855f7" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <path d="M24 23 42 32.5 24 42 6 32.5Z" fill="url(#sms-low)" />
      <path d="M24 14.5 42 24 24 33.5 6 24Z" fill="url(#sms-mid)" stroke="#fff" strokeOpacity=".55" strokeWidth=".8" strokeLinejoin="round" />
      <path d="M24 6 42 15.5 24 25 6 15.5Z" fill="url(#sms-top)" stroke="#fff" strokeOpacity=".7" strokeWidth=".8" strokeLinejoin="round" />
      <path d="M24 10.5 33.5 15.5 24 20.5 14.5 15.5Z" fill="#fff" fillOpacity=".9" />
    </svg>
  );
}

/** The mark with the "SMS" word beside it. */
export function Logo({ className, subtitle = true, invert }: { className?: string; subtitle?: boolean; invert?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-2.5", className)}>
      <LogoMark className="size-10 shrink-0 drop-shadow-[0_6px_12px_rgb(47_91_234/0.35)]" />
      <span className="leading-none">
        <span className={cx("block text-xl font-extrabold tracking-tight", invert ? "text-white" : "bg-gradient-to-r from-brand to-violet-500 bg-clip-text text-transparent")}>SMS</span>
        {subtitle && <span className={cx("mt-1 block text-[0.7rem] font-medium uppercase tracking-[0.14em]", invert ? "text-white/70" : "text-soft")}>School Management System</span>}
      </span>
    </span>
  );
}

const LAYERS = [
  { z: 0, face: "from-fuchsia-500 to-violet-700", edge: "bg-violet-900" },
  { z: 1, face: "from-indigo-400 to-indigo-700", edge: "bg-indigo-900" },
  { z: 2, face: "from-sky-400 to-brand", edge: "bg-blue-900" },
];

/** The logo as a real 3D stack: the tiles drift apart and back together while
 * the stack turns. It holds still when the device asks for reduced motion. */
export function Logo3D({ size = 220, className }: { size?: number; className?: string }) {
  const tile = size * 0.58;
  return (
    <div className={cx("logo3d pointer-events-none relative select-none", className)} style={{ width: size, height: size, perspective: size * 4 }} aria-hidden>
      <div className="absolute inset-x-[18%] bottom-[6%] h-[14%] rounded-[50%] bg-brand/30 blur-xl" />
      <div className="logo3d-spin absolute left-1/2 top-1/2" style={{ width: tile, height: tile, marginLeft: -tile / 2, marginTop: -tile / 2, transformStyle: "preserve-3d" }}>
        {LAYERS.map((l) => (
          <div
            key={l.z}
            className="logo3d-layer absolute inset-0"
            style={{ ["--z" as string]: `${l.z * tile * 0.2}px`, ["--lift" as string]: `${l.z * tile * 0.14}px`, transformStyle: "preserve-3d", animationDelay: `${l.z * -0.35}s` }}
          >
            <div className={cx("absolute inset-0 rounded-[22%] bg-gradient-to-br shadow-[inset_0_0_0_1px_rgb(255_255_255/0.35)]", l.face)} />
            {/* A thin edge under each tile gives it thickness. */}
            <div className={cx("absolute inset-0 rounded-[22%] opacity-80", l.edge)} style={{ transform: `translateZ(-${tile * 0.06}px)` }} />
            {l.z === 2 && (
              <div className="absolute inset-[24%] flex items-center justify-center rounded-[18%] bg-white/90 text-brand shadow-lg" style={{ transform: `translateZ(${tile * 0.02}px)` }}>
                <span className="font-extrabold tracking-tight" style={{ fontSize: tile * 0.16 }}>SMS</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
