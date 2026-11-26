"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import Dock from "./Dock";
import FocusBar, { stopSession, useSession } from "./FocusMode";
import CreditsPanel from "./CreditsPanel";
import LookHint from "./LookHint";
import WaitlistForm from "./WaitlistForm";
import { Logo } from "./Logo";
import SceneLoader from "./SceneLoader";
import { setTimePreference, useTimePreference } from "./timePreference";

const OceanCanvas = dynamic(() => import("@/components/OceanCanvas"), {
  ssr: false,
  loading: () => null,
});

export default function WaitlistPage() {
  const timeOverride = useTimePreference();
  const [focusMode, setFocusMode] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  // If a model never arrives, the page still opens.
  const [gaveUpWaiting, setGaveUpWaiting] = useState(false);
  const session = useSession();
  const inFocus = focusMode || session !== null;
  const focusButtonRef = useRef<HTMLButtonElement>(null);

  const enterFocus = useCallback(() => setFocusMode(true), []);
  const exitFocus = useCallback(() => {
    stopSession();
    setFocusMode(false);
    // Back to the control the visitor started from.
    requestAnimationFrame(() => focusButtonRef.current?.focus());
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setGaveUpWaiting(true), 20_000);
    return () => window.clearTimeout(timer);
  }, []);

  // F toggles focus mode, Escape leaves it. Typing in a field never triggers them.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      if (event.key === "f" || event.key === "F") {
        event.preventDefault();
        if (inFocus) exitFocus();
        else enterFocus();
      } else if (event.key === "Escape" && inFocus) {
        exitFocus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [inFocus, enterFocus, exitFocus]);

  return (
    // The scene fills this page: at least the viewport and 34rem, so a phone
    // held sideways scrolls a whole landscape instead of squashing it.
    <div className="relative min-h-[max(100dvh,34rem)]">
      <SceneLoader visible={!ready && !gaveUpWaiting} progress={progress} />
      <OceanCanvas
        timeOverrideHour={timeOverride}
        onProgressChange={setProgress}
        onReadyChange={setReady}
      />
      <div
        className={`ocean-veil pointer-events-none absolute inset-0 z-10 ${inFocus ? "opacity-30" : "opacity-100"}`}
      />

      <div
        inert={inFocus}
        className={`pointer-events-none relative z-20 flex min-h-[max(100dvh,34rem)] w-full flex-col transition-opacity duration-700 ${
          inFocus ? "opacity-0" : "opacity-100"
        }`}
      >
        <nav className="pointer-events-auto mx-auto flex w-full min-w-[320px] max-w-5xl items-center justify-between px-5 py-4 animate-fade-in sm:px-10 sm:py-8">
          <div className="flex select-none items-center gap-2.5 text-ocean-strong">
            <Logo className="h-8 w-8 text-accent drop-shadow-[0_1px_10px_rgb(0_0_0/0.55)]" />
            <span className="sr-only text-[1.0625rem] font-normal tracking-[-0.01em] sm:not-sr-only">
              DeepFocus
            </span>
          </div>
          <Dock
            timeOverride={timeOverride}
            onTimeChange={setTimePreference}
            onFocus={enterFocus}
            focusButtonRef={focusButtonRef}
          />
        </nav>

        <main className="mx-auto flex w-full min-w-[320px] max-w-5xl flex-1 select-none flex-col items-center justify-center px-6 pb-10 text-center">
          <p className="mb-6 flex items-center gap-2.5 text-xs font-normal uppercase tracking-[0.24em] text-ocean-strong animate-fade-up [animation-delay:300ms]">
            <span className="glow-dot h-1.5 w-1.5 rounded-full bg-accent animate-pulse-dot" aria-hidden="true" />
            Early access
          </p>
          <h1 className="max-w-4xl text-balance text-[clamp(2.5rem,6.4vw,4.75rem)] font-normal leading-[1.04] tracking-[-0.035em] text-ocean-strong animate-fade-up [animation-delay:450ms]">
            <em className="text-accent-adaptive italic">Deep work</em><br /> sets sail.
          </h1>
          <p className="mt-5 text-lg font-extralight text-muted text-ocean animate-fade-up [animation-delay:600ms] sm:text-xl">
            A quiet workspace for makers.
          </p>
          <div className="pointer-events-auto mt-10 w-full max-w-sm animate-fade-up [animation-delay:750ms]">
            <WaitlistForm id="email" />
            <p className="mt-4 text-[0.8125rem] font-light text-muted text-ocean">A concept. Nothing is sent.</p>
          </div>
        </main>

        <LookHint hidden={inFocus} />

        <footer className="pointer-events-auto mx-auto flex flex-wrap w-full min-w-[320px] max-w-5xl select-none items-center justify-between gap-x-5 px-5 py-5 text-[0.8125rem] font-light text-muted text-ocean animate-fade-in sm:px-10 sm:py-8">
          <span>© 2026 DeepFocus</span>
          <div className="flex items-center gap-5">
            <CreditsPanel />
            <a href="https://alxpro.com" target="_blank" rel="noreferrer" className="rounded-sm hover:text-text">
              AlxPro
            </a>
            <a href="/llms.txt" className="rounded-sm hover:text-text">
              For agents
            </a>
          </div>
        </footer>
      </div>

      {inFocus ? (
        <div className="fixed inset-x-0 bottom-8 z-30 flex justify-center px-4 animate-fade-in">
          <FocusBar onExit={exitFocus} onComplete={enterFocus} />
        </div>
      ) : null}

    </div>
  );
}
