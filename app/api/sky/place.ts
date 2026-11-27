// Where the visitor is, roughly, for their sky. In order: a precise position
// they chose to share (rounded to ~11 km), the city their connection comes
// from (Vercel's IP location headers, no prompt), or the time zone their
// browser reports. Nothing is stored.

export interface Place {
  latitude: number;
  longitude: number;
  /** A city name to show, when known. */
  city: string | null;
  source: "precise" | "ip" | "timezone";
}

/** Rounds to a tenth of a degree (~11 km): enough for the weather, no more. */
const coarse = (value: number) => Math.round(value * 10) / 10;

export function parseCoordinate(raw: string | null, limit: number): number | null {
  if (raw === null || raw.length > 12 || !/^-?\d{1,3}(\.\d+)?$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isFinite(value) && Math.abs(value) <= limit ? value : null;
}

const TIME_ZONE = /^[A-Za-z]+(?:\/[A-Za-z0-9_+-]+){0,2}$/;

/** A capital or large city for common time zones: [latitude, longitude, city]. */
const ZONES: Record<string, [number, number, string]> = {
  "Europe/London": [51.5, -0.1, "London"],
  "Europe/Dublin": [53.3, -6.3, "Dublin"],
  "Europe/Lisbon": [38.7, -9.1, "Lisbon"],
  "Europe/Madrid": [40.4, -3.7, "Madrid"],
  "Europe/Paris": [48.9, 2.4, "Paris"],
  "Europe/Brussels": [50.8, 4.4, "Brussels"],
  "Europe/Amsterdam": [52.4, 4.9, "Amsterdam"],
  "Europe/Berlin": [52.5, 13.4, "Berlin"],
  "Europe/Zurich": [47.4, 8.5, "Zurich"],
  "Europe/Vienna": [48.2, 16.4, "Vienna"],
  "Europe/Rome": [41.9, 12.5, "Rome"],
  "Europe/Prague": [50.1, 14.4, "Prague"],
  "Europe/Warsaw": [52.2, 21.0, "Warsaw"],
  "Europe/Stockholm": [59.3, 18.1, "Stockholm"],
  "Europe/Oslo": [59.9, 10.8, "Oslo"],
  "Europe/Copenhagen": [55.7, 12.6, "Copenhagen"],
  "Europe/Helsinki": [60.2, 24.9, "Helsinki"],
  "Europe/Athens": [38.0, 23.7, "Athens"],
  "Europe/Bucharest": [44.4, 26.1, "Bucharest"],
  "Europe/Istanbul": [41.0, 29.0, "Istanbul"],
  "Europe/Kyiv": [50.5, 30.5, "Kyiv"],
  "Europe/Moscow": [55.8, 37.6, "Moscow"],
  "Atlantic/Reykjavik": [64.1, -21.9, "Reykjavík"],
  "Atlantic/Canary": [28.1, -15.4, "Las Palmas"],
  "Africa/Casablanca": [33.6, -7.6, "Casablanca"],
  "Africa/Lagos": [6.5, 3.4, "Lagos"],
  "Africa/Cairo": [30.0, 31.2, "Cairo"],
  "Africa/Nairobi": [-1.3, 36.8, "Nairobi"],
  "Africa/Johannesburg": [-26.2, 28.0, "Johannesburg"],
  "Asia/Dubai": [25.2, 55.3, "Dubai"],
  "Asia/Jerusalem": [31.8, 35.2, "Jerusalem"],
  "Asia/Riyadh": [24.7, 46.7, "Riyadh"],
  "Asia/Tehran": [35.7, 51.4, "Tehran"],
  "Asia/Karachi": [24.9, 67.0, "Karachi"],
  "Asia/Kolkata": [19.1, 72.9, "Mumbai"],
  "Asia/Dhaka": [23.8, 90.4, "Dhaka"],
  "Asia/Bangkok": [13.8, 100.5, "Bangkok"],
  "Asia/Jakarta": [-6.2, 106.8, "Jakarta"],
  "Asia/Singapore": [1.35, 103.8, "Singapore"],
  "Asia/Kuala_Lumpur": [3.1, 101.7, "Kuala Lumpur"],
  "Asia/Manila": [14.6, 121.0, "Manila"],
  "Asia/Hong_Kong": [22.3, 114.2, "Hong Kong"],
  "Asia/Shanghai": [31.2, 121.5, "Shanghai"],
  "Asia/Taipei": [25.0, 121.6, "Taipei"],
  "Asia/Seoul": [37.6, 127.0, "Seoul"],
  "Asia/Tokyo": [35.7, 139.7, "Tokyo"],
  "Australia/Perth": [-31.95, 115.9, "Perth"],
  "Australia/Adelaide": [-34.9, 138.6, "Adelaide"],
  "Australia/Brisbane": [-27.5, 153.0, "Brisbane"],
  "Australia/Sydney": [-33.9, 151.2, "Sydney"],
  "Australia/Melbourne": [-37.8, 145.0, "Melbourne"],
  "Pacific/Auckland": [-36.85, 174.8, "Auckland"],
  "Pacific/Honolulu": [21.3, -157.9, "Honolulu"],
  "America/Anchorage": [61.2, -149.9, "Anchorage"],
  "America/Los_Angeles": [34.05, -118.25, "Los Angeles"],
  "America/Vancouver": [49.3, -123.1, "Vancouver"],
  "America/Phoenix": [33.45, -112.1, "Phoenix"],
  "America/Denver": [39.7, -105.0, "Denver"],
  "America/Chicago": [41.9, -87.6, "Chicago"],
  "America/Mexico_City": [19.4, -99.1, "Mexico City"],
  "America/Toronto": [43.7, -79.4, "Toronto"],
  "America/New_York": [40.7, -74.0, "New York"],
  "America/Halifax": [44.6, -63.6, "Halifax"],
  "America/Bogota": [4.7, -74.1, "Bogotá"],
  "America/Lima": [-12.05, -77.0, "Lima"],
  "America/Santiago": [-33.45, -70.7, "Santiago"],
  "America/Argentina/Buenos_Aires": [-34.6, -58.4, "Buenos Aires"],
  "America/Sao_Paulo": [-23.55, -46.6, "São Paulo"],
};

/** A place for a time zone, if it's one we know. */
export function placeFromTimeZone(raw: string | null): Place | null {
  if (!raw || raw.length > 64 || !TIME_ZONE.test(raw)) return null;
  const zone = ZONES[raw];
  return zone ? { latitude: zone[0], longitude: zone[1], city: zone[2], source: "timezone" } : null;
}

/** Resolves the visitor's place from the request's query and headers. */
export function resolvePlace(query: URLSearchParams, header: (name: string) => string | null): Place | null {
  const latitude = parseCoordinate(query.get("lat"), 90);
  const longitude = parseCoordinate(query.get("lon"), 180);
  if (latitude !== null && longitude !== null) {
    return { latitude: coarse(latitude), longitude: coarse(longitude), city: null, source: "precise" };
  }
  const ipLatitude = parseCoordinate(header("x-vercel-ip-latitude"), 90);
  const ipLongitude = parseCoordinate(header("x-vercel-ip-longitude"), 180);
  if (ipLatitude !== null && ipLongitude !== null) {
    let city: string | null = null;
    try {
      city = header("x-vercel-ip-city") ? decodeURIComponent(header("x-vercel-ip-city") as string).slice(0, 60) : null;
    } catch {
      city = null;
    }
    return { latitude: coarse(ipLatitude), longitude: coarse(ipLongitude), city, source: "ip" };
  }
  return placeFromTimeZone(query.get("tz"));
}

/**
 * A small rate limit per client (best effort: per server instance). The
 * weather itself is cached, so a visitor needs a request every few minutes.
 */
export function createRateLimit(limit: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return function allow(client: string, now = Date.now()) {
    if (hits.size > 5000) {
      for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
    }
    const entry = hits.get(client);
    if (!entry || entry.resetAt <= now) {
      hits.set(client, { count: 1, resetAt: now + windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= limit;
  };
}
