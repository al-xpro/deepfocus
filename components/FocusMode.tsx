"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ringBell } from "./ambience";
import Digits from "./Digits";

// Focus sessions: a length, an end time, kept in localStorage so a session
// survives a reload. Nothing leaves the browser.

const KEY = "deepfocus:session";
const LENGTHS = [15, 30, 60];

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

const COUNTDOWN_FADES_AFTER = 3500; // ms

/**
 * The focus bar, bottom center in focus mode: pick a length and start a
 * session, then just a progress bar. The countdown shows for a moment when a
 * session starts, then fades; hovering the bar brings it back. Screen readers
 * get the time left from the progress bar's value.
 */
export default function FocusBar({ onExit, onComplete }: { onExit: () => void; onComplete: () => void }) {
  const session = useSession();
  const [length, setLength] = useState(30);
  const [now, setNow] = useState(0);
  const [done, setDone] = useState(false);
  const [countdownShown, setCountdownShown] = useState(true);
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
    const fade = window.setTimeout(() => setCountdownShown(false), COUNTDOWN_FADES_AFTER);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
      window.clearTimeout(fade);
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
    setCountdownShown(true);
    setLength(minutes);
    writeSession({ endsAt: Date.now() + minutes * 60_000, minutes });
  };

  const remaining = session ? (now ? session.endsAt - now : session.minutes * 60_000) : 0;
  const progress = session && now ? Math.min(1, Math.max(0, 1 - remaining / (session.minutes * 60_000))) : 0;
  const pill = "h-10 cursor-pointer rounded-full px-4 text-sm font-normal transition-colors duration-(--duration-fast)";
  const fade = "transition-opacity duration-700 ease-(--ease-glass)";

  return (
    <div
      className={`group glass flex items-center gap-1 rounded-full p-1 ${done ? "animate-[sessionPulse_1.8s_ease-out_3]" : ""}`}
      role="group"
      aria-label="Focus session"
    >
      {session ? (
        <>
          {/* One fixed slot: the countdown and the progress bar cross-fade in it. */}
          <div
            className="relative flex h-10 w-32 items-center justify-center"
            role="progressbar"
            aria-label="Session progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            aria-valuetext={`${formatRemaining(remaining)} left`}
          >
            <span
              className={`absolute inset-x-4 top-1/2 h-0.5 -translate-y-1/2 overflow-hidden rounded-full bg-current/15 ${fade} ${
                countdownShown ? "opacity-0" : "opacity-100 group-hover:opacity-0"
              }`}
            >
              <span
                className="block h-full origin-left rounded-full bg-accent transition-transform duration-1000 ease-linear"
                style={{ transform: `scaleX(${progress})` }}
              />
            </span>
            <span
              className={`select-none text-sm font-light ${fade} ${
                countdownShown ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              }`}
            >
              <Digits value={formatRemaining(remaining)} />
            </span>
          </div>
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
                className={`h-10 w-11 cursor-pointer rounded-full text-sm font-light transition-colors duration-(--duration-fast) ${
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
  );
}
