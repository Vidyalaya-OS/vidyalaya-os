"use client";

import { cx } from "@/components/ui";

export type SceneKind = "cube" | "stack" | "bars" | "orbit";

type Icon = React.ComponentType<{ className?: string }>;

/** A small animated 3D picture for a section's guide, drawn with CSS 3D
 * transforms (no images or libraries). `hue` tints it; each kind suits a
 * different idea: a spinning cube for a tool, stacked layers for structure,
 * growing bars for numbers, and orbiting dots for people. Still on devices
 * that ask for reduced motion. */
export function Scene3D({ kind, icon: Icon, hue = 225, className }: { kind: SceneKind; icon: Icon; hue?: number; className?: string }) {
  return (
    <div className={cx("scene3d", className)} style={{ "--h": hue } as React.CSSProperties} aria-hidden>
      <div className="scene3d-glow" />
      {kind === "cube" && (
        <div className="scene3d-float">
          <div className="scene3d-cube">
            {["front", "back", "right", "left"].map((f) => (
              <div key={f} className={`scene3d-face scene3d-${f}`}><Icon className="size-8" /></div>
            ))}
            <div className="scene3d-face scene3d-top" />
            <div className="scene3d-face scene3d-bottom" />
          </div>
        </div>
      )}
      {kind === "stack" && (
        <div className="scene3d-iso">
          {[0, 1, 2].map((i) => (
            <div key={i} className="scene3d-tile" style={{ "--i": i } as React.CSSProperties}>
              {i === 2 && <span className="rotate-45"><Icon className="size-7" /></span>}
            </div>
          ))}
        </div>
      )}
      {kind === "bars" && (
        <div className="scene3d-iso">
          <div className="scene3d-plate" />
          {[0.55, 0.85, 0.4, 1].map((v, i) => (
            <div key={i} className="scene3d-bar" style={{ "--v": v, "--i": i } as React.CSSProperties}>
              <div className="scene3d-bar-top" />
              <div className="scene3d-bar-front" />
              <div className="scene3d-bar-side" />
            </div>
          ))}
        </div>
      )}
      {kind === "orbit" && (
        <>
          <div className="scene3d-ring">
            {[0, 1, 2].map((i) => <span key={i} className="scene3d-moon" style={{ "--i": i } as React.CSSProperties} />)}
          </div>
          <div className="scene3d-float">
            <div className="scene3d-sphere"><Icon className="size-8" /></div>
          </div>
        </>
      )}
    </div>
  );
}
