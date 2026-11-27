import type { NextRequest } from "next/server";
import { createRateLimit, resolvePlace, type Place } from "./place";

// The visitor's sky: their approximate place and the weather there now. The
// page calls only this route (our own origin); the server asks the weather
// service (Open-Meteo, credited in CREDITS.md), cached for ten minutes per
// ~11 km square. Nothing about the visitor is stored.

const allow = createRateLimit(30, 60_000);

interface Observed {
  code: number;
  cloudCover: number;
  precipitation: number;
  windSpeed: number;
  temperature: number;
}

async function fetchWeather(place: Place): Promise<Observed | null> {
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${place.latitude}&longitude=${place.longitude}` +
    "&current=temperature_2m,weather_code,cloud_cover,precipitation,wind_speed_10m&timezone=auto";
  try {
    const response = await fetch(url, { next: { revalidate: 600 }, signal: AbortSignal.timeout(4000) });
    if (!response.ok) return null;
    const data = (await response.json()) as { current?: Record<string, unknown> };
    const now = data.current;
    if (!now) return null;
    const number = (key: string) => (typeof now[key] === "number" ? (now[key] as number) : 0);
    return {
      code: number("weather_code"),
      cloudCover: number("cloud_cover"),
      precipitation: number("precipitation"),
      windSpeed: number("wind_speed_10m"),
      temperature: number("temperature_2m"),
    };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allow(client)) {
    return Response.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": "60" } });
  }
  const place = resolvePlace(request.nextUrl.searchParams, (name) => request.headers.get(name));
  const weather = place ? await fetchWeather(place) : null;
  return Response.json(
    { place, weather },
    { headers: { "Cache-Control": "private, max-age=300", Vary: "x-vercel-ip-latitude, x-vercel-ip-longitude" } }
  );
}
