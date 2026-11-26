"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ringBell } from "./ambience";

// Focus sessions: a length, an end time, kept in localStorage so a session
// survives a reload. Nothing leaves the browser.

const KEY = "deepfocus:session";
const LENGTHS = [15, 25, 50];

interface Session {
  endsAt: number;
  minutes: number;
}

let raw: string | null | undefined;
const listeners = new Set<() => void>();

function readSession() {
  if (raw === undefined) {
    try {
      raw = localStorage.getItem(KEY);
      // A session that ended while the page was closed is over.
      const stored = raw ? (JSON.parse(raw) as Session) : null;
      if (stored && !(stored.endsAt > Date.now())) {
        localStorage.removeItem(KEY);
        raw = null;
      }
    } catch {
      raw = null;
    }
  }
  return raw;
}

function writeSession(session: Session | null) {
  raw = session ? JSON.stringify(session) : null;
  try {
    if (raw) localStorage.setItem(KEY, raw);
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode: the session still runs, it just won't survive a reload.
  }
  listeners.forEach((listener) => listener());
}

function subscribeSession(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The running session, or null. */
export function useSession(): Session | null {
  const value = useSyncExternalStore(subscribeSession, readSession, () => null);
  return useMemo(() => {
    if (!value) return null;
    try {
      return JSON.parse(value) as Session;
    } catch {
      return null;
    }
  }, [value]);
}

export function stopSession() {
  writeSession(null);
}

function formatRemaining(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * The focus bar, bottom center in focus mode: pick a length and start a
 * session, watch it count down, or leave. A thin line along the top of the
 * screen shows the session's progress.
 */
export default function FocusBar({ onExit, onComplete }: { onExit: () => void; onComplete: () => void }) {
  const session = useSession();
  const [length, setLength] = useState(25);
  const [now, setNow] = useState(0);
  const [done, setDone] = useState(false);
  const primaryRef = useRef<HTMLButtonElement>(null);

  // Keyboard focus moves into the bar when focus mode starts.
  useEffect(() => {
    primaryRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!session) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (t >= session.endsAt) {
        onComplete();
        stopSession();
        setDone(true);
        ringBell();
      }
    };
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [session, onComplete]);

  // The tab title says when a session is done, for a visitor in another tab.
  useEffect(() => {
    if (!done) return;
    const previous = document.title;
    document.title = "Session done · DeepFocus";
    return () => {
      document.title = previous;
    };
  }, [done]);

  const start = (minutes: number) => {
    setDone(false);
    setLength(minutes);
    writeSession({ endsAt: Date.now() + minutes * 60_000, minutes });
  };

  const progress = session && now ? 1 - (session.endsAt - now) / (session.minutes * 60_000) : 0;

  const pill = "h-10 cursor-pointer rounded-full px-4 text-sm font-normal transition-colors duration-(--duration-fast)";

  return (
    <>
      {session ? (
        <div
          className="pointer-events-none fixed inset-x-0 top-0 z-40 h-0.5 origin-left bg-accent/80 transition-transform duration-1000 ease-linear"
          style={{ transform: `scaleX(${Math.min(1, Math.max(0, progress))})` }}
          role="progressbar"
          aria-label="Session progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        />
      ) : null}

      <div
        className={`glass flex items-center gap-1 rounded-full p-1 ${done ? "animate-[sessionPulse_1.8s_ease-out_3]" : ""}`}
        role="group"
        aria-label="Focus session"
      >
        {session ? (
          <>
            <span className="select-none px-3 text-sm font-light tabular-nums" aria-live="off">
              {now ? formatRemaining(session.endsAt - now) : formatRemaining(session.minutes * 60_000)}
            </span>
            <button ref={primaryRef} type="button" onClick={stopSession} className={`${pill} glass-control`}>
              Stop
            </button>
          </>
        ) : done ? (
          <>
            <span className="select-none px-3 text-sm font-light" role="status">
              Session done
            </span>
            <button ref={primaryRef} type="button" onClick={() => start(length)} className={`${pill} glass-selected`}>
              Again
            </button>
          </>
        ) : (
          <>
            <div role="group" aria-label="Session length" className="flex gap-0.5">
              {LENGTHS.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  aria-pressed={length === minutes}
                  onClick={() => setLength(minutes)}
                  className={`h-10 w-11 cursor-pointer rounded-full text-sm font-light tabular-nums transition-colors duration-(--duration-fast) ${
                    length === minutes ? "bg-(--glass-well) font-normal" : "glass-control text-on-glass-muted"
                  }`}
                >
                  {minutes}
                  <span className="sr-only"> minutes</span>
                </button>
              ))}
            </div>
            <button ref={primaryRef} type="button" onClick={() => start(length)} className={`${pill} glass-selected`}>
              Start
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onExit}
          aria-label="Leave focus mode"
          aria-keyshortcuts="Escape"
          className="glass-control flex h-10 w-10 cursor-pointer items-center justify-center"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
    </>
  );
}
