"use client";

import { Logo } from "./Logo";

/**
 * The loading panel: ink over everything until every model has arrived, so the
 * scene is only ever seen whole. The mark and a thin line that fills with the
 * download; it fades away when the scene is ready.
 */
export default function SceneLoader({ visible, progress }: { visible: boolean; progress: number }) {
  return (
    <div
      aria-hidden={!visible}
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-ink transition-opacity duration-700 ease-(--ease-glass) ${
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <Logo className="h-10 w-10 text-accent animate-pulse-dot" />
      <div
        role="progressbar"
        aria-label="Loading the ocean"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
        className="h-px w-40 overflow-hidden rounded-full bg-white/10"
      >
        <div
          className="h-full origin-left bg-accent transition-transform duration-500 ease-(--ease-glass)"
          style={{ transform: `scaleX(${progress / 100})` }}
        />
      </div>
    </div>
  );
}
