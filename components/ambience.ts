"use client";

import { useSyncExternalStore } from "react";

// The ocean ambience: a CC0 field recording (see CREDITS.md), self-hosted and
// played through Web Audio so the 80-second loop is seamless and the fades work
// on iOS, where an audio element's volume can't be changed.
//
// Nothing is requested until the visitor turns the sound on.

export type AmbienceState = "off" | "loading" | "on";

const SRC = "/audio/ocean.m4a";
const LOOP_SECONDS = 80;
const VOLUME = 0.85;

let state: AmbienceState = "off";
let wanted = false;
let context: AudioContext | null = null;
let master: GainNode | null = null;
let source: AudioBufferSourceNode | null = null;
let buffer: Promise<AudioBuffer> | null = null;
const listeners = new Set<() => void>();

function setState(next: AmbienceState) {
  state = next;
  listeners.forEach((listener) => listener());
  if ("mediaSession" in navigator) {
    navigator.mediaSession.playbackState = next === "on" ? "playing" : "none";
  }
}

function getContext() {
  if (!context) {
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = 0;
    master.connect(context.destination);
  }
  return context;
}

/** Starts the ambience. Call it from a click: browsers only allow sound after a gesture. */
export async function startAmbience() {
  wanted = true;
  if (state !== "off") return;

  // Play through the iPhone's silent switch, like a media app (Safari 16.4+).
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (session) session.type = "playback";

  const ctx = getContext();
  const resumed = ctx.resume();
  setState("loading");

  try {
    buffer ??= fetch(SRC)
      .then((response) => response.arrayBuffer())
      .then((data) => ctx.decodeAudioData(data));
    const audio = await buffer;
    await resumed;
    if (!wanted || !master) {
      setState("off");
      return;
    }

    source = ctx.createBufferSource();
    source.buffer = audio;
    source.loop = true;
    // AAC adds a few milliseconds of encoder delay at the start: loop the last 80 s.
    source.loopStart = Math.max(0, audio.duration - LOOP_SECONDS);
    source.loopEnd = audio.duration;
    source.connect(master);
    source.start(0, source.loopStart);

    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
    master.gain.linearRampToValueAtTime(VOLUME, ctx.currentTime + 2.5);

    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: "Ocean", artist: "DeepFocus" });
    }
    setState("on");
  } catch {
    buffer = null;
    setState("off");
  }
}

/** Fades the ambience out and stops it. */
export function stopAmbience() {
  wanted = false;
  if (!context || !master || !source) {
    if (state !== "off") setState("off");
    return;
  }
  const now = context.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(master.gain.value, now);
  master.gain.linearRampToValueAtTime(0, now + 1.2);
  source.stop(now + 1.3);
  source = null;
  setState("off");
}

/**
 * A soft bell, like a singing bowl: a few sine partials with long decays,
 * synthesized, so there's no file to download. Only rings while the sound is on.
 */
export function ringBell() {
  if (state !== "on" || !context) return;
  const ctx = context;
  const now = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = 0.22;
  out.connect(ctx.destination);

  const partials: Array<[ratio: number, amplitude: number, decay: number]> = [
    [1, 1, 7],
    [1.007, 0.6, 7],
    [2.76, 0.45, 4.5],
    [5.4, 0.2, 2.6],
    [8.93, 0.08, 1.4],
  ];
  for (const [ratio, amplitude, decay] of partials) {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.frequency.value = 196 * ratio;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(amplitude, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
    oscillator.connect(gain).connect(out);
    oscillator.start(now);
    oscillator.stop(now + decay + 0.1);
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAmbience(): AmbienceState {
  return useSyncExternalStore(subscribe, () => state, () => "off");
}
