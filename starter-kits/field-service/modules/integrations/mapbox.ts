import { environment } from "@zuplo/runtime";

/**
 * Mapbox integration.
 *
 * Used by `optimize_route_for_day` to compute realistic drive-times
 * between job sites and produce a sensible visit order. We use:
 *   - Geocoding API to turn site addresses into lon/lat coordinates
 *   - Directions Matrix API to get drive-time between every pair of stops
 *
 * Docs:
 *   https://docs.mapbox.com/api/search/geocoding/
 *   https://docs.mapbox.com/api/navigation/matrix/
 */

const MAPBOX_API = "https://api.mapbox.com";

function requireToken(): string {
  const token = environment.MAPBOX_ACCESS_TOKEN;
  if (!token) throw new Error("MAPBOX_ACCESS_TOKEN is not set");
  return token;
}

export interface GeocodedAddress {
  query: string;
  longitude: number;
  latitude: number;
  placeName: string | null;
}

/**
 * Forward-geocode a free-form address into coordinates.
 */
export async function geocodeMapboxAddress(
  query: string,
): Promise<GeocodedAddress | null> {
  const url = new URL(
    `${MAPBOX_API}/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`,
  );
  url.searchParams.set("access_token", requireToken());
  url.searchParams.set("limit", "1");

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(
      `Mapbox geocode failed: ${res.status} ${await res.text()}`,
    );
  }
  const data = (await res.json()) as {
    features?: Array<{
      center: [number, number];
      place_name?: string;
    }>;
  };
  const feature = data.features?.[0];
  if (!feature) return null;
  return {
    query,
    longitude: feature.center[0],
    latitude: feature.center[1],
    placeName: feature.place_name ?? null,
  };
}

export interface MapboxMatrixRequest {
  /** Coordinates in [lon, lat] order. */
  coordinates: Array<[number, number]>;
  /** Optional profile, defaults to "driving". */
  profile?: "driving" | "driving-traffic" | "walking" | "cycling";
}

export interface MapboxMatrixResponse {
  /** Square N×N matrix of drive-times in seconds (durations[from][to]). */
  durations: Array<Array<number | null>>;
  /** Square N×N matrix of distances in meters. */
  distances: Array<Array<number | null>>;
}

/**
 * Fetch a drive-time + distance matrix between every pair of stops.
 */
export async function getMapboxMatrix(
  req: MapboxMatrixRequest,
): Promise<MapboxMatrixResponse> {
  const profile = req.profile ?? "driving";
  if (req.coordinates.length < 2) {
    throw new Error("Mapbox matrix requires at least 2 coordinates");
  }
  if (req.coordinates.length > 25) {
    throw new Error("Mapbox matrix supports up to 25 coordinates per call");
  }
  const coords = req.coordinates.map((c) => `${c[0]},${c[1]}`).join(";");
  const url = new URL(`${MAPBOX_API}/directions-matrix/v1/mapbox/${profile}/${coords}`);
  url.searchParams.set("access_token", requireToken());
  url.searchParams.set("annotations", "duration,distance");

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(
      `Mapbox matrix failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as MapboxMatrixResponse;
}

/**
 * Greedy nearest-neighbor TSP solver. Returns an order of stop indices,
 * starting from `originIndex`, that minimizes total drive time.
 *
 * Mapbox has an Optimization v2 API but it requires shape input that's
 * trickier for arbitrary stop sets; nearest-neighbor on the matrix is
 * a defensible "smart enough" baseline that the LLM can reason over.
 */
export function greedyNearestNeighborOrder(
  durations: Array<Array<number | null>>,
  originIndex = 0,
): number[] {
  const n = durations.length;
  if (n === 0) return [];
  const visited = new Array<boolean>(n).fill(false);
  const order: number[] = [originIndex];
  visited[originIndex] = true;

  let current = originIndex;
  while (order.length < n) {
    let bestIdx = -1;
    let bestDur = Number.POSITIVE_INFINITY;
    const row = durations[current] ?? [];
    for (let i = 0; i < n; i++) {
      if (visited[i]) continue;
      const d = row[i];
      if (d == null) continue;
      if (d < bestDur) {
        bestDur = d;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) {
      // Disconnected — append remaining stops in declared order.
      for (let i = 0; i < n; i++) {
        if (!visited[i]) {
          order.push(i);
          visited[i] = true;
        }
      }
      break;
    }
    order.push(bestIdx);
    visited[bestIdx] = true;
    current = bestIdx;
  }
  return order;
}
