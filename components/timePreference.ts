"use client";

import { useSyncExternalStore } from "react";

// The visitor's time choice: live (null) or a chosen hour, kept in localStorage
// so every page (the 404 too) shows the sky they picked.

const KEY = "deepfocus:time";
const listeners = new Set<() => void>();
let cached: string | null | undefined;

function read() {
  if (cached === undefined) {
    try {
      cached = localStorage.getItem(KEY);
    } catch {
      cached = null;
    }
  }
  return cached;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The chosen hour (0–24, with minutes as a fraction), or null for the live time. */
export function useTimePreference(): number | null {
  const value = useSyncExternalStore(subscribe, read, () => null);
  if (value === null) return null;
  const hour = Number(value);
  return Number.isFinite(hour) && hour >= 0 && hour < 24 ? hour : null;
}

export function setTimePreference(hour: number | null) {
  cached = hour === null ? null : String(hour);
  try {
    if (cached === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, cached);
  } catch {
    // Private mode: the choice holds for this page only.
  }
  listeners.forEach((listener) => listener());
}
