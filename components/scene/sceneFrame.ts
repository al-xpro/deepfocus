import * as THREE from "three";
import { getSceneDate, sceneParams } from "./sceneParams";
import { getSceneSnapshot, type SceneSnapshot } from "./timeUtils";

// The scene's state for the current frame: computed once (SceneClock in
// OceanScene, first in the frame loop) and read by everything else, so a change
// of time reaches every part of the scene on the same frame.

let current: SceneSnapshot | null = null;

export function updateFrameSnapshot() {
  current = getSceneSnapshot(getSceneDate(), sceneParams.location);
  return current;
}

export function getFrameSnapshot(): SceneSnapshot {
  return current ?? updateFrameSnapshot();
}

/** 0 at night to 1 by day, from the sun's height. */
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
 * `?life` in the URL brings the rare life on quickly (a fish school within
 * seconds, the whale within ten), for reviewing it without a five-minute wait.
 */
export const quickLife =
  typeof window !== "undefined" && new URLSearchParams(window.location.search).has("life");
