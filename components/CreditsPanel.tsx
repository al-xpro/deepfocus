"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import GlassPanel from "./GlassPanel";
import { CREDITS } from "./credits";

const link = "underline decoration-current/30 underline-offset-2 hover:decoration-current";

/**
 * A scrolling list with a soft shadow at the top and the bottom, each shown only
 * when there's more to scroll that way.
 */
function ScrollArea({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const top = el.scrollTop > 1;
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    setEdges((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  const shadow = "pointer-events-none absolute inset-x-0 h-8 transition-opacity duration-300";

  return (
    <div className="relative -mx-5">
      <div ref={ref} onScroll={measure} className="max-h-[min(60vh,28rem)] overflow-y-auto px-5">
        {children}
      </div>
      <div
        aria-hidden="true"
        className={`${shadow} top-0 bg-linear-to-b from-black/20 to-transparent ${edges.top ? "opacity-100" : "opacity-0"}`}
      />
      <div
        aria-hidden="true"
        className={`${shadow} bottom-0 bg-linear-to-t from-black/20 to-transparent ${edges.bottom ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}

/** "Credits" in the footer: every third-party model, sound, texture and font, with its license. */
export default function CreditsPanel() {
  const [open, setOpen] = useState(false);

  return (
    <GlassPanel
      title="Credits"
      open={open}
      onOpenChange={setOpen}
      side="top"
      align="end"
      trigger={
        <button type="button" className="cursor-pointer rounded-sm font-light hover:text-text">
          Credits
        </button>
      }
    >
      <ScrollArea>
        <div className="flex flex-col gap-6 pb-1 text-[0.8125rem] font-light leading-snug">
          {CREDITS.map(({ group, items }) => (
            <section key={group} className="flex flex-col gap-3">
              <h3 className="text-[0.6875rem] uppercase tracking-[0.18em] text-on-glass-muted">{group}</h3>
              <ul className="flex flex-col gap-3">
                {items.map((item) => (
                  <li key={item.title}>
                    <a href={item.source} target="_blank" rel="noreferrer" className={`font-normal ${link}`}>
                      {item.title}
                    </a>
                    <span className="block text-on-glass-muted">
                      {item.author} ·{" "}
                      {item.licenseUrl ? (
                        <a href={item.licenseUrl} target="_blank" rel="noreferrer" className={link}>
                          {item.license}
                        </a>
                      ) : (
                        item.license
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </ScrollArea>
    </GlassPanel>
  );
}
