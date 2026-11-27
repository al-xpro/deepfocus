import * as THREE from "three";
import { getSceneDate, sceneParams } from "./sceneParams";
import { applyWeather, blendWeather, CLEAR, type Weather } from "./weather";
import { getSceneSnapshot, type SceneSnapshot } from "./timeUtils";

// The scene's state for the current frame: computed once (SceneClock in
// OceanScene, first in the frame loop) and read by everything else, so a change
// of time reaches every part of the scene on the same frame.

let current: SceneSnapshot | null = null;

/** The weather on screen this frame: it fades toward sceneParams.weather over a few seconds. */
const weatherNow: Weather = { ...CLEAR };

export function getWeather(): Weather {
  return weatherNow;
}

/** A lightning flash, 0 … 1, set by the precipitation effect and read by the light and exposure. */
export const lightning = { flash: 0 };

export function updateFrameSnapshot(delta = 0) {
  blendWeather(weatherNow, sceneParams.weather, Math.min(delta, 0.1) * 0.6);
  current = applyWeather(getSceneSnapshot(getSceneDate(), sceneParams.location), weatherNow);
  return current;
}

export function getFrameSnapshot(): SceneSnapshot {
  return current ?? updateFrameSnapshot();
}

/** 0 at night to 1 by day, from the sun's height. */
/** How thick the haze is: clear air, or rain, snow and fog closing in. */
export function hazeDensity() {
  const w = weatherNow;
  return 0.00006 + w.cloud * 0.00002 + w.rain * 0.00018 + w.snow * 0.00028 + w.fog * 0.0009;
}

export function daylightOf(snapshot: SceneSnapshot) {
  return THREE.MathUtils.smoothstep(snapshot.sunElev, -2, 15);
}

/**
 * Where the view is looking, as a bearing on the water (radians, same
 * convention as `frontArcPosition`), and which way it's turning. Set by the
 * camera each frame; life that wants to be seen appears ahead of it.
 */
export const view = { bearing: 0, turning: 1 };

/**
 * `?life` in the URL brings the gulls on quickly (an episode within seconds,
 * one after another), for reviewing them without waiting.
 */
export const quickLife =
  typeof window !== "undefined" && new URLSearchParams(window.location.search).has("life");

const HAZE_DAY = new THREE.Color("#d3e2ec");
const HAZE_OVERCAST = new THREE.Color("#b3bcc3");
const HAZE_NIGHT = new THREE.Color("#060a13");
const HAZE_DUSK = new THREE.Color("#8a7f8c");
const scratch = new THREE.Color();

/**
 * The color of distant air at this moment. Its brightness follows the daylight
 * (from the sun's height), so it's as dark as the sky whenever the sky is dark,
 * through dusk, night and dawn; while the sun is low but still up it takes a
 * muted warm tint. The haze (fog) uses it, and so does anything far away that
 * should sit in the air, like the volcano's plume.
 */
export function hazeColor(snapshot: SceneSnapshot, target: THREE.Color) {
  const daylight = daylightOf(snapshot);
  target.copy(HAZE_NIGHT).lerp(scratch.copy(HAZE_DAY).lerp(HAZE_OVERCAST, weatherNow.cloud * 0.8), Math.pow(daylight, 0.7));
  const warm = snapshot.twilightFactor * daylight;
  scratch.setHex(snapshot.sunColorHex).lerp(HAZE_DUSK, 0.55).multiplyScalar(0.35 + 0.65 * daylight);
  return target.lerp(scratch, warm * 0.6);
}
