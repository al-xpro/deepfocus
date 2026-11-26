"use client";

import { useSyncExternalStore } from "react";

// The interface's clock: one tick per minute, shared by every reader, so only
// the components that show the time re-render.

const listeners = new Set<() => void>();
const SERVER_NOW = new Date(0);
let now = SERVER_NOW;
let timer: number | undefined;

function tick() {
  now = new Date();
  listeners.forEach((listener) => listener());
}

function schedule() {
  timer = window.setTimeout(() => {
    tick();
    schedule();
  }, 60_000 - (Date.now() % 60_000) + 50);
}

function onVisibilityChange() {
  if (document.visibilityState === "visible") tick();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    now = new Date();
    schedule();
    document.addEventListener("visibilitychange", onVisibilityChange);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  };
}

/** The current time, updated on the minute. `null` before the page has hydrated. */
export function useMinuteClock(): Date | null {
  const date = useSyncExternalStore(subscribe, () => now, () => SERVER_NOW);
  return date === SERVER_NOW ? null : date;
}

/** Minutes since midnight shown by the scene: the live time, or the chosen hour. */
export function sceneMinutes(override: number | null, now: Date | null): number | null {
  if (override !== null) return Math.round(override * 60) % 1440;
  if (!now) return null;
  return now.getHours() * 60 + now.getMinutes();
}

export function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
