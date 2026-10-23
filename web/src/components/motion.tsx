"use client";

import { useEffect, useRef } from "react";
import { cx } from "@/components/ui";

function prefersStill() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** A card that leans toward a mouse pointer in 3D, with a soft glare. Touch
 * and reduced-motion devices get a plain card. */
export function Tilt({ children, className, max = 7, as: Tag = "div" }: { children: React.ReactNode; className?: string; max?: number; as?: "div" | "li" | "article" }) {
  const ref = useRef<HTMLElement>(null);
  const move = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse" || prefersStill()) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--ry", `${(x - 0.5) * 2 * max}deg`);
    el.style.setProperty("--rx", `${(0.5 - y) * 2 * max}deg`);
    el.style.setProperty("--gx", `${x * 100}%`);
    el.style.setProperty("--gy", `${y * 100}%`);
    el.dataset.active = "";
  };
  const leave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.removeProperty("--rx");
    el.style.removeProperty("--ry");
    delete el.dataset.active;
  };
  return (
    <Tag ref={ref as React.Ref<never>} onPointerMove={move} onPointerLeave={leave} className={cx("tilt relative", className)}>
      {children}
      <span className="tilt-glare pointer-events-none absolute inset-0 rounded-[inherit]" aria-hidden />
    </Tag>
  );
}

/** Fades and lifts its content in the first time it scrolls into view. */
export function Reveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersStill() || !("IntersectionObserver" in window)) {
      el.dataset.shown = "";
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.dataset.shown = "";
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={cx("reveal", className)} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </div>
  );
}
