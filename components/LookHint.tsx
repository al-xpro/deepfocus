"use client";

import { useEffect, useState } from "react";

const KEY = "deepfocus:looked";

/**
 * "Drag to look around", once: it appears a few seconds in, and goes for good
 * after the first drag on the scene.
 */
export default function LookHint({ hidden }: { hidden: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY)) return;
    } catch {
      return;
    }
    const show = window.setTimeout(() => setVisible(true), 4000);
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof HTMLCanvasElement)) return;
      window.clearTimeout(show);
      setVisible(false);
      try {
        localStorage.setItem(KEY, "1");
      } catch {
        // Private mode: the hint may show again next visit.
      }
      window.removeEventListener("pointerdown", onPointerDown);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.clearTimeout(show);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  return (
    <p
      aria-hidden="true"
      className={`pointer-events-none fixed inset-x-0 bottom-20 z-20 flex select-none items-center justify-center gap-2 text-xs font-light tracking-[0.04em] text-muted text-ocean transition-opacity duration-700 sm:bottom-24 [@media(max-height:640px)]:hidden ${
        visible && !hidden ? "opacity-100" : "opacity-0"
      }`}
    >
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 10h14M3 10l3-3M3 10l3 3M17 10l-3-3M17 10l-3 3" />
      </svg>
      Drag to look around
    </p>
  );
}
