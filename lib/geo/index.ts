import type { TravelEstimate } from "@/lib/matching/types";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface GeoProvider {
  name: string;
  geocode(address: string): Promise<LatLng | null>;
  /** Travel estimates from one origin to many destinations (same order as input). */
  travelMatrix(origins: LatLng[], destination: LatLng): Promise<(TravelEstimate | null)[]>;
}

// ───────────── Fallback: straight-line with a road factor ─────────────

const ROAD_FACTOR = 1.3; // typical road distance / straight-line distance
const AVG_MPH = 32; // blended suburban average

export function haversineMiles(a: LatLng, b: LatLng): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function straightLineEstimate(a: LatLng, b: LatLng): TravelEstimate {
  const miles = haversineMiles(a, b) * ROAD_FACTOR;
  return {
    distanceMiles: Math.round(miles * 10) / 10,
    durationMinutes: Math.round((miles / AVG_MPH) * 60 + 5),
    source: "straight-line",
  };
}

export const fallbackProvider: GeoProvider = {
  name: "straight-line",
  async geocode() {
    return null; // no geocoding without an API key; staff can set coordinates in the admin UI
  },
  async travelMatrix(origins, destination) {
    return origins.map((o) => straightLineEstimate(o, destination));
  },
};

// ───────────── Google Maps Geocoding + Distance Matrix ─────────────

function googleProvider(apiKey: string): GeoProvider {
  return {
    name: "google",
    async geocode(address) {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Geocoding HTTP ${res.status}`);
      const data = (await res.json()) as { status: string; results: { geometry: { location: LatLng } }[] };
      if (data.status !== "OK" || !data.results.length) return null;
      return data.results[0].geometry.location;
    },
    async travelMatrix(origins, destination) {
      if (origins.length === 0) return [];
      const out: (TravelEstimate | null)[] = [];
      // Distance Matrix allows 25 origins per request.
      for (let i = 0; i < origins.length; i += 25) {
        const chunk = origins.slice(i, i + 25);
        const url =
          `https://maps.googleapis.com/maps/api/distancematrix/json?units=imperial` +
          `&origins=${encodeURIComponent(chunk.map((o) => `${o.lat},${o.lng}`).join("|"))}` +
          `&destinations=${encodeURIComponent(`${destination.lat},${destination.lng}`)}` +
          `&key=${apiKey}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Distance Matrix HTTP ${res.status}`);
        const data = (await res.json()) as {
          status: string;
          rows: { elements: { status: string; distance?: { value: number }; duration?: { value: number } }[] }[];
        };
        if (data.status !== "OK") throw new Error(`Distance Matrix status ${data.status}`);
        for (let j = 0; j < chunk.length; j++) {
          const el = data.rows[j]?.elements[0];
          if (!el || el.status !== "OK" || !el.distance || !el.duration) {
            out.push(straightLineEstimate(chunk[j], destination));
          } else {
            out.push({
              distanceMiles: Math.round((el.distance.value / 1609.344) * 10) / 10,
              durationMinutes: Math.round(el.duration.value / 60),
              source: "routing",
            });
          }
        }
      }
      return out;
    },
  };
}

let cached: GeoProvider | null = null;
export function getGeoProvider(): GeoProvider {
  if (cached) return cached;
  const key = process.env.GOOGLE_MAPS_API_KEY;
  cached = key ? googleProvider(key) : fallbackProvider;
  return cached;
}

/** Travel estimates for many musicians to one event location, resilient to provider failure. */
export async function estimateTravel(
  origins: { id: string; lat: number | null; lng: number | null }[],
  destination: LatLng | null,
): Promise<Record<string, TravelEstimate | undefined>> {
  const result: Record<string, TravelEstimate | undefined> = {};
  if (!destination) return result;
  const located = origins.filter((o): o is { id: string; lat: number; lng: number } => o.lat != null && o.lng != null);
  if (!located.length) return result;
  const provider = getGeoProvider();
  let estimates: (TravelEstimate | null)[];
  try {
    estimates = await provider.travelMatrix(located, destination);
  } catch {
    estimates = await fallbackProvider.travelMatrix(located, destination);
  }
  located.forEach((o, i) => {
    result[o.id] = estimates[i] ?? straightLineEstimate(o, destination);
  });
  return result;
}

export function formatAddress(parts: { addressLine1?: string | null; city?: string | null; state?: string | null; postalCode?: string | null }): string {
  return [parts.addressLine1, parts.city, parts.state, parts.postalCode].filter(Boolean).join(", ");
}
