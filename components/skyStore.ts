"use client";

import { useSyncExternalStore } from "react";
import { sceneParams } from "./scene/sceneParams";
import { CLEAR, PRESETS, weatherFrom, type Condition, type Observation, type Weather } from "./scene/weather";

// The visitor's sky: where they are, roughly, and the weather there, from our
// own /api/sky route (it asks the weather service; the page never calls a third
// party). The scene reads it through sceneParams; the time panel shows it and
// lets the visitor preview another condition or share a precise position. Only
// the chosen condition, and whether a position was shared, are remembered:
// never the position itself.

export type WeatherChoice = "live" | Condition;

export interface SkyPlace {
  latitude: number;
  longitude: number;
  city: string | null;
  source: "precise" | "ip" | "timezone";
}

export interface SkyState {
  place: SkyPlace | null;
  live: Weather | null;
  temperature: number | null;
  choice: WeatherChoice;
  status: "idle" | "loading" | "ready" | "unavailable";
  locating: boolean;
}

const CHOICE_KEY = "deepfocus:weather";
const SHARED_KEY = "deepfocus:precise";
const REFRESH_MS = 15 * 60_000;

const INITIAL: SkyState = { place: null, live: null, temperature: null, choice: "live", status: "idle", locating: false };
let state = INITIAL;
const listeners = new Set<() => void>();
let precise: { latitude: number; longitude: number } | null = null;
let started = false;

function update(next: Partial<SkyState>) {
  state = { ...state, ...next };
  sceneParams.location = state.place ? { latitude: state.place.latitude, longitude: state.place.longitude } : null;
  sceneParams.weather = state.choice === "live" ? { ...(state.live ?? CLEAR) } : { ...PRESETS[state.choice] };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSky(): SkyState {
  return useSyncExternalStore(subscribe, () => state, () => INITIAL);
}

async function fetchSky() {
  const query = new URLSearchParams();
  try {
    query.set("tz", Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    // No time zone: the server may still know the place from the connection.
  }
  if (precise) {
    query.set("lat", precise.latitude.toFixed(2));
    query.set("lon", precise.longitude.toFixed(2));
  }
  if (state.status !== "ready") update({ status: "loading" });
  try {
    const response = await fetch(`/api/sky?${query}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`sky ${response.status}`);
    const data = (await response.json()) as {
      place: SkyPlace | null;
      weather: (Observation & { temperature: number }) | null;
    };
    update({
      place: data.place,
      live: data.weather ? weatherFrom(data.weather) : null,
      temperature: data.weather ? data.weather.temperature : null,
      status: data.place ? "ready" : "unavailable",
    });
  } catch {
    update({ status: state.place ? "ready" : "unavailable" });
  }
}

/**
 * Starts the live sky, once: the approximate place first, then a precise one
 * if the visitor shared it before and the browser still allows it (no prompt).
 */
export function startSky() {
  if (started || typeof window === "undefined") return;
  started = true;
  const choice = localStorage.getItem(CHOICE_KEY);
  if (choice === "live" || (choice !== null && choice in PRESETS)) update({ choice: choice as WeatherChoice });
  void fetchSky();
  window.setInterval(() => void fetchSky(), REFRESH_MS);
  if (localStorage.getItem(SHARED_KEY) === "1" && navigator.permissions) {
    navigator.permissions
      .query({ name: "geolocation" })
      .then((permission) => {
        if (permission.state === "granted") locate();
      })
      .catch(() => {});
  }
}

/** Shares a precise position: the browser asks the visitor first. */
export function locate() {
  if (typeof navigator === "undefined" || !navigator.geolocation) return;
  update({ locating: true });
  navigator.geolocation.getCurrentPosition(
    (position) => {
      precise = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      localStorage.setItem(SHARED_KEY, "1");
      update({ locating: false });
      void fetchSky();
    },
    () => update({ locating: false }),
    { maximumAge: 30 * 60_000, timeout: 10_000 }
  );
}

export function chooseWeather(choice: WeatherChoice) {
  localStorage.setItem(CHOICE_KEY, choice);
  update({ choice });
}
