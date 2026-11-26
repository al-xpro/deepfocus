"use client";

import { useEffect, useState } from "react";

const KEY = "deepfocus:looked";

/**
 * "Drag to look around", once: it appears a few seconds in, and goes for good
 * after the first drag on the scene. It sits in the page's flow, above the
 * footer, with its space always reserved: it can't overlap the copy at any
 * height, and the layout doesn't move when it goes.
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
      className={`pointer-events-none flex h-6 shrink-0 select-none items-center justify-center gap-2 text-xs font-light tracking-[0.04em] text-muted text-ocean transition-opacity duration-700 ${
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
