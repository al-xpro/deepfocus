"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

const FADE = "28px";

/**
 * Fades a scroller's content at whichever edge still has more to reach, and
 * only there: no shadow, the text itself dissolves. Attach `scrollRef` to the
 * scroller and spread `fadeStyle` on it.
 */
export function useScrollFade<T extends HTMLElement = HTMLDivElement>() {
  const scrollRef = useRef<T | null>(null);
  const [edges, setEdges] = useState({ up: false, down: false });

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const up = el.scrollTop > 1;
    const down = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    setEdges((prev) => (prev.up === up && prev.down === down ? prev : { up, down }));
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

  const mask = `linear-gradient(to bottom, ${edges.up ? "transparent" : "#000"} 0, #000 ${FADE}, #000 calc(100% - ${FADE}), ${
    edges.down ? "transparent" : "#000"
  } 100%)`;
  const fadeStyle: CSSProperties = { maskImage: mask, WebkitMaskImage: mask };

  return { scrollRef, fadeStyle };
}
