"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Whether a scroller has more to reach above and below, for edge shadows that
 * only show where there's somewhere to go. Attach `scrollRef` to the scroller.
 */
export function useScrollShadows<T extends HTMLElement = HTMLDivElement>() {
  const scrollRef = useRef<T | null>(null);
  const [edges, setEdges] = useState({ canScrollUp: false, canScrollDown: false });

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const canScrollUp = el.scrollTop > 1;
    const canScrollDown = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    setEdges((prev) =>
      prev.canScrollUp === canScrollUp && prev.canScrollDown === canScrollDown
        ? prev
        : { canScrollUp, canScrollDown }
    );
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    el.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, [measure]);

  return { scrollRef, ...edges };
}

/** A soft shadow over a scroll edge, shown only where there's more to reach. */
export function ScrollShadow({ edge, visible }: { edge: "top" | "bottom"; visible: boolean }) {
  return (
    <div
      aria-hidden="true"
      style={{ opacity: visible ? 1 : 0 }}
      className={`pointer-events-none absolute inset-x-0 z-10 h-8 transition-opacity duration-200 ${
        edge === "top"
          ? "top-0 bg-linear-to-b from-black/20 to-transparent"
          : "bottom-0 bg-linear-to-t from-black/20 to-transparent"
      }`}
    />
  );
}
