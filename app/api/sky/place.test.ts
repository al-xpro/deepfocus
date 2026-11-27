import { describe, expect, it } from "vitest";
import { createRateLimit, parseCoordinate, placeFromTimeZone, resolvePlace } from "./place";

const headers = (values: Record<string, string>) => (name: string) => values[name] ?? null;

describe("the visitor's place", () => {
  it("prefers a shared position, rounded to about 11 km", () => {
    const place = resolvePlace(new URLSearchParams("lat=41.90278&lon=12.49636&tz=Europe/London"), headers({}));
    expect(place).toEqual({ latitude: 41.9, longitude: 12.5, city: null, source: "precise" });
  });

  it("then the connection's city, without asking", () => {
    const place = resolvePlace(
      new URLSearchParams("tz=Europe/London"),
      headers({ "x-vercel-ip-latitude": "45.4642", "x-vercel-ip-longitude": "9.19", "x-vercel-ip-city": "Milan%20" })
    );
    expect(place?.source).toBe("ip");
    expect(place?.latitude).toBe(45.5);
    expect(place?.city).toBe("Milan ");
  });

  it("then the time zone", () => {
    expect(resolvePlace(new URLSearchParams("tz=Asia/Tokyo"), headers({}))?.city).toBe("Tokyo");
    expect(resolvePlace(new URLSearchParams("tz=Mars/Olympus"), headers({}))).toBeNull();
  });

  it("rejects anything that isn't a plain coordinate or time zone", () => {
    for (const bad of ["91", "-180.5", "1e3", "12;drop", "", " 12", "NaN", "12.5.5", "1".repeat(20)]) {
      expect(parseCoordinate(bad, 90)).toBeNull();
    }
    expect(parseCoordinate("-33.87", 90)).toBe(-33.87);
    expect(placeFromTimeZone("../etc/passwd")).toBeNull();
    expect(placeFromTimeZone("Europe/Rome<script>")).toBeNull();
    expect(resolvePlace(new URLSearchParams("lat=200&lon=10"), headers({}))).toBeNull();
  });
});

describe("the rate limit", () => {
  it("lets a client through up to the limit, then again after the window", () => {
    const allow = createRateLimit(3, 1000);
    expect([allow("a", 0), allow("a", 1), allow("a", 2), allow("a", 3)]).toEqual([true, true, true, false]);
    expect(allow("b", 3)).toBe(true);
    expect(allow("a", 1001)).toBe(true);
  });
});
