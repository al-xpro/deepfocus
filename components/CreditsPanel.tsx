"use client";

import { useState } from "react";
import { useScrollFade } from "./useScrollFade";
import GlassPanel from "./GlassPanel";
import { CREDITS } from "./credits";

const link = "underline decoration-current/30 underline-offset-2 hover:decoration-current";

/** The list scrolls inside a short window; the text fades where there's more. */
function ScrollArea({ children }: { children: React.ReactNode }) {
  const { scrollRef, fadeStyle } = useScrollFade();
  return (
    <div ref={scrollRef} style={fadeStyle} className="max-h-[min(38vh,15rem)] overflow-y-auto overscroll-contain">
      {children}
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
