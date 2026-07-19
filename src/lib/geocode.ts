import { cacheGet, cacheSet } from './db';

// Rate limiter: max 1 request per 1500ms (Nominatim usage policy)
let lastRequestTime = 0;

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < 1500) {
    await new Promise((r) => setTimeout(r, 1500 - elapsed));
  }
  lastRequestTime = Date.now();
  return fetch(url);
}

/**
 * Reverse geocode lat/lng to a display address using Nominatim (OSM).
 * Results are cached in IndexedDB for 30 days.
 * Returns null on failure or when rate-limited.
 */
export async function reverseGeocode(
  lat: number | null | undefined,
  lng: number | null | undefined,
): Promise<string | null> {
  if (lat == null || lng == null) return null;
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null;

  const cacheKey = `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;

  // Check cache first
  const cached = await cacheGet<string>('geocode', cacheKey);
  if (cached != null) return cached;

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=0&zoom=16&accept-language=en`;
    const resp = await rateLimitedFetch(url);
    if (!resp.ok) return null;

    const data = await resp.json();
    const displayName: string | undefined = data?.display_name;

    if (displayName) {
      // Shorten: take first part before comma (usually the street/building name)
      const short = displayName.split(',')[0]?.trim() || displayName;
      // Cache for 30 days
      await cacheSet('geocode', cacheKey, short);
      return short;
    }

    return null;
  } catch {
    return null;
  }
}
