import { describe, expect, it } from "vitest";
import { applyWeather, blendWeather, CLEAR, conditionOf, CONDITIONS, PRESETS, weatherFrom } from "./weather";
import { getSceneSnapshot } from "./timeUtils";

const observe = (code: number, cloudCover = 0, precipitation = 0, windSpeed = 10) =>
  weatherFrom({ code, cloudCover, precipitation, windSpeed });

describe("weather from an observation", () => {
  it("reads the WMO codes as the right condition", () => {
    expect(conditionOf(observe(0, 5))).toBe("clear");
    expect(conditionOf(observe(2, 50))).toBe("partly-cloudy");
    expect(conditionOf(observe(3, 100))).toBe("cloudy");
    expect(conditionOf(observe(45, 80))).toBe("fog");
    expect(conditionOf(observe(61, 100, 1))).toBe("rain");
    expect(conditionOf(observe(81, 90, 6))).toBe("rain");
    expect(conditionOf(observe(73, 100, 1))).toBe("snow");
    expect(conditionOf(observe(95, 100, 5))).toBe("storm");
  });

  it("covers the sky when it rains or snows, whatever the reported cover", () => {
    expect(observe(63, 20, 2).cloud).toBeGreaterThanOrEqual(0.9);
    expect(observe(75, 10, 2).cloud).toBeGreaterThanOrEqual(0.9);
  });

  it("rains harder with more precipitation, and keeps every value between 0 and 1", () => {
    expect(observe(61, 100, 4).rain).toBeGreaterThan(observe(61, 100, 0.5).rain);
    for (const code of [0, 1, 2, 3, 45, 48, 51, 55, 61, 65, 67, 71, 75, 80, 82, 85, 95, 99]) {
      const weather = observe(code, 100, 50, 200);
      for (const value of Object.values(weather)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it("reads each preset as its own condition", () => {
    for (const condition of CONDITIONS) expect(conditionOf(PRESETS[condition])).toBe(condition);
  });
});

describe("weather in the scene", () => {
  const noon = new Date(2026, 5, 21, 12, 0);
  const place = { latitude: 41.9, longitude: 12.5 };

  it("leaves a clear sky's clouds, stars and exposure close to the clock's", () => {
    const base = getSceneSnapshot(noon, place);
    const clear = applyWeather(getSceneSnapshot(noon, place), CLEAR);
    expect(clear.cloudCoverage).toBeCloseTo(base.cloudCoverage, 5);
    expect(clear.exposure).toBeCloseTo(base.exposure, 5);
  });

  it("covers the sky, dims it and hides the stars under overcast", () => {
    const night = new Date(2026, 5, 21, 1, 0);
    const clear = applyWeather(getSceneSnapshot(night, place), CLEAR);
    const overcast = applyWeather(getSceneSnapshot(night, place), PRESETS.cloudy);
    expect(overcast.cloudCoverage).toBeGreaterThan(0.85);
    expect(overcast.exposure).toBeLessThan(clear.exposure);
    expect(overcast.starsOpacity).toBeLessThan(clear.starsOpacity * 0.2);
  });

  it("fades from one weather to another without overshooting", () => {
    const current = { ...CLEAR };
    for (let i = 0; i < 600; i++) {
      blendWeather(current, PRESETS.storm, 1 / 60);
      expect(current.rain).toBeLessThanOrEqual(1);
    }
    expect(current.rain).toBeGreaterThan(0.99);
  });
});
