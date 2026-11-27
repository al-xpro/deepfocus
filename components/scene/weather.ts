import * as THREE from "three";
import type { SceneSnapshot } from "./timeUtils";

// The weather model: a handful of intensities the scene draws from, whatever
// their source (live observations or a condition chosen to preview). Pure and
// tested: weather.test.ts.

export type Condition = "clear" | "partly-cloudy" | "cloudy" | "fog" | "rain" | "storm" | "snow";

export interface Weather {
  /** 0 clear sky … 1 overcast. */
  cloud: number;
  /** 0 … 1 heavy rain. */
  rain: number;
  /** 0 … 1 heavy snow. */
  snow: number;
  /** 0 … 1 thick fog. */
  fog: number;
  /** 0 calm … 1 gale. */
  wind: number;
  /** 0 … 1: lightning. */
  storm: number;
}

export const CONDITIONS: Condition[] = ["clear", "partly-cloudy", "cloudy", "fog", "rain", "storm", "snow"];

export const CONDITION_LABELS: Record<Condition, string> = {
  clear: "Clear",
  "partly-cloudy": "Partly cloudy",
  cloudy: "Cloudy",
  fog: "Fog",
  rain: "Rain",
  storm: "Storm",
  snow: "Snow",
};

/** A typical sky for each condition: what a preview shows. */
export const PRESETS: Record<Condition, Weather> = {
  clear: { cloud: 0, rain: 0, snow: 0, fog: 0, wind: 0.2, storm: 0 },
  "partly-cloudy": { cloud: 0.45, rain: 0, snow: 0, fog: 0, wind: 0.3, storm: 0 },
  cloudy: { cloud: 0.92, rain: 0, snow: 0, fog: 0.1, wind: 0.4, storm: 0 },
  fog: { cloud: 0.85, rain: 0, snow: 0, fog: 1, wind: 0.08, storm: 0 },
  rain: { cloud: 1, rain: 0.6, snow: 0, fog: 0.25, wind: 0.5, storm: 0 },
  storm: { cloud: 1, rain: 1, snow: 0, fog: 0.3, wind: 0.9, storm: 1 },
  snow: { cloud: 0.95, rain: 0, snow: 0.7, fog: 0.3, wind: 0.3, storm: 0 },
};

export const CLEAR = PRESETS.clear;

/** What a weather service reports for now. */
export interface Observation {
  /** WMO weather interpretation code (0 clear … 99 thunderstorm with hail). */
  code: number;
  /** Cloud cover, %. */
  cloudCover: number;
  /** Precipitation over the last interval, mm. */
  precipitation: number;
  /** Wind speed at 10 m, km/h. */
  windSpeed: number;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Rain intensity for each WMO code that means rain (drizzle, rain, freezing rain, showers). */
const RAIN: Record<number, number> = {
  51: 0.15, 53: 0.22, 55: 0.3, 56: 0.25, 57: 0.35,
  61: 0.35, 63: 0.6, 65: 0.9, 66: 0.45, 67: 0.8,
  80: 0.45, 81: 0.7, 82: 1,
  95: 0.8, 96: 0.9, 99: 1,
};
/** Snow intensity for each WMO code that means snow. */
const SNOW: Record<number, number> = { 71: 0.35, 73: 0.6, 75: 0.9, 77: 0.3, 85: 0.5, 86: 0.9 };

/** The scene's weather from an observation. */
export function weatherFrom(observation: Observation): Weather {
  const { code } = observation;
  const precipitation = clamp01(observation.precipitation / 4);
  let rain = RAIN[code] ?? 0;
  let snow = SNOW[code] ?? 0;
  if (rain > 0) rain = Math.max(rain, precipitation);
  if (snow > 0) snow = Math.max(snow, precipitation);
  const storm = code >= 95 ? 1 : 0;
  const fog = clamp01((code === 45 || code === 48 ? 1 : 0) + rain * 0.25 + snow * 0.3);
  const cloud = clamp01(Math.max(observation.cloudCover / 100, rain > 0 || snow > 0 ? 0.9 : 0, fog > 0.6 ? 0.6 : 0));
  return { cloud, rain, snow, fog, wind: clamp01(observation.windSpeed / 55), storm };
}

/** The condition a weather reads as, for its label. */
export function conditionOf(weather: Weather): Condition {
  if (weather.storm > 0.5) return "storm";
  if (weather.snow > 0.15) return "snow";
  if (weather.rain > 0.15) return "rain";
  if (weather.fog > 0.6) return "fog";
  if (weather.cloud > 0.75) return "cloudy";
  if (weather.cloud > 0.3) return "partly-cloudy";
  return "clear";
}

/** Moves one weather toward another (for fades between conditions); `rate` per second. */
export function blendWeather(current: Weather, target: Weather, step: number) {
  const k = 1 - Math.exp(-step);
  current.cloud += (target.cloud - current.cloud) * k;
  current.rain += (target.rain - current.rain) * k;
  current.snow += (target.snow - current.snow) * k;
  current.fog += (target.fog - current.fog) * k;
  current.wind += (target.wind - current.wind) * k;
  current.storm += (target.storm - current.storm) * k;
  return current;
}

const OVERCAST_WATER = new THREE.Color("#4a5a63");
const scratch = new THREE.Color();

/**
 * The weather's effect on the scene's state for this frame: clouds in the sky,
 * a greyer and dimmer sky under overcast, stars and moon hidden by cloud, a
 * rougher, faster, greyer sea in wind and rain.
 */
export function applyWeather(snapshot: SceneSnapshot, weather: Weather) {
  const { cloud, rain, snow, wind, storm } = weather;
  snapshot.cloudCoverage = THREE.MathUtils.lerp(snapshot.cloudCoverage, 0.98, cloud);
  snapshot.cloudDensity = THREE.MathUtils.lerp(snapshot.cloudDensity, 0.9, cloud);
  snapshot.cloudSpeed *= 1 + 3 * wind;
  snapshot.overcast = THREE.MathUtils.smoothstep(cloud, 0.5, 1) * 0.92;
  snapshot.turbidity += cloud * 6;
  snapshot.rayleigh *= 1 - 0.55 * cloud;
  snapshot.mieCoefficient *= 1 + cloud * 2;
  snapshot.exposure *= 1 - 0.28 * cloud - 0.12 * rain - 0.08 * snow - 0.15 * storm;
  snapshot.starsOpacity *= 1 - cloud;
  snapshot.moonOpacity *= 1 - 0.9 * cloud;
  snapshot.sunHaloOpacity *= 1 - cloud;
  snapshot.sunReflectionIntensity *= 1 - 0.85 * cloud;
  snapshot.waterDistortionScale *= 1 + 1.5 * wind + rain;
  snapshot.waterTimeScale *= 1 + 0.8 * wind;
  snapshot.waterColorHex = scratch.setHex(snapshot.waterColorHex).lerp(OVERCAST_WATER, 0.45 * cloud).getHex();
  return snapshot;
}
