import type { SceneSnapshot } from "./timeUtils";

// Publishes the scene's light to the page, so the interface stays in sync with
// the sky that's on screen (see "The scene's light" in app/globals.css):
//
//   --sky-light   0 at night to 1 by day
//   --scene-tint  the scene's light color
//   data-glass    "light" by day, "dark" at dawn, dusk and night
//
// Called from the frame loop; it only touches the DOM when a value changes.

const GLASS_LIGHT_ABOVE = 10; // sun elevation, degrees

let last = "";

export function publishSceneTone(snapshot: SceneSnapshot) {
  const t = Math.min(1, Math.max(0, (snapshot.sunElev + 6) / 10));
  const skyLight = (t * t * (3 - 2 * t)).toFixed(2);
  const tint = `#${snapshot.lightColorHex.toString(16).padStart(6, "0")}`;
  const glass = snapshot.sunElev > GLASS_LIGHT_ABOVE ? "light" : "dark";

  const key = `${skyLight}|${tint}|${glass}`;
  if (key === last) return;
  last = key;

  const root = document.documentElement;
  root.style.setProperty("--sky-light", skyLight);
  root.style.setProperty("--scene-tint", tint);
  root.dataset.glass = glass;
}
