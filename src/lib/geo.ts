/**
 * Geo utilities: OSM search, Douglas-Peucker simplification, WKT conversion
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';

export interface OsmResult {
  display_name: string;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  boundingbox: string[];
  geojson_url?: string;
  geojson?: GeoJSON.GeoJsonObject;
}

export async function searchOsm(query: string): Promise<OsmResult[]> {
  if (!query || !query.trim()) return [];
  const params = new URLSearchParams({
    q: query.trim(),
    format: 'json',
    limit: '10',
    polygon_geojson: '0',
    addressdetails: '1',
  });
  const res = await fetch(`${NOMINATIM_URL}/search?${params}`, {
    headers: { 'Accept-Language': 'zh,en' },
  });
  if (!res.ok) throw new Error(`Nominatim search failed: ${res.status}`);
  return res.json();
}

export async function fetchOsmGeometry(osmType: string, osmId: string | number): Promise<GeoJSON.GeoJsonObject | null> {
  const firstChar = osmType.charAt(0).toUpperCase();
  const url = `${NOMINATIM_URL}/lookup?osm_ids=${firstChar}${osmId}&format=json&polygon_geojson=1`;
  const res = await fetch(url, {
    headers: { 'Accept-Language': 'zh,en' },
  });
  if (!res.ok) throw new Error(`OSM lookup failed: ${res.status}`);
  const data = await res.json();
  const item = Array.isArray(data) ? data[0] : data;
  return item?.geojson || null;
}

type Coord = [number, number];

function perpendicularDistance(point: Coord, lineStart: Coord, lineEnd: Coord): number {
  const [x, y] = point;
  const [x1, y1] = lineStart;
  const [x2, y2] = lineEnd;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return Math.sqrt((x - x1) ** 2 + (y - y1) ** 2);
  return Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / len;
}

export function simplifyPolygon(points: Coord[], tolerance = 0.0005): Coord[] {
  if (points.length <= 3) return points.filter((p): p is Coord => p !== undefined);

  let maxDist = 0;
  let maxIdx = 0;
  const first = points[0]!;
  const last = points[points.length - 1]!;

  for (let i = 1; i < points.length - 1; i++) {
    const pt = points[i];
    if (!pt) continue;
    const dist = perpendicularDistance(pt, first, last);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > tolerance) {
    const left = simplifyPolygon(points.slice(0, maxIdx + 1), tolerance);
    const right = simplifyPolygon(points.slice(maxIdx), tolerance);
    return [...left.slice(0, -1), ...right];
  }

  return [first, last];
}

export function simplifyGeoJson(geojson: GeoJSON.GeoJsonObject | null | undefined, tolerance = 0.0005): GeoJSON.GeoJsonObject | null | undefined {
  if (!geojson) return geojson;

  if (geojson.type === 'Polygon') {
    const poly = geojson as GeoJSON.Polygon;
    const newCoords: number[][][] = poly.coordinates.map((ring) => {
      const simplified = simplifyPolygon(
        ring.map((c): Coord => [c[0]!, c[1]!]),
        tolerance,
      );
      const first = simplified[0];
      const last = simplified[simplified.length - 1];
      if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
        simplified.push([...first]);
      }
      return simplified;
    });
    return { type: 'Polygon' as const, coordinates: newCoords } as GeoJSON.GeoJsonObject;
  }

  if (geojson.type === 'MultiPolygon') {
    const multi = geojson as GeoJSON.MultiPolygon;
    const newCoords: number[][][][] = multi.coordinates.map((poly) =>
      poly.map((ring) => {
        const simplified = simplifyPolygon(
          ring.map((c): Coord => [c[0]!, c[1]!]),
          tolerance,
        );
        const first = simplified[0];
        const last = simplified[simplified.length - 1];
        if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
          simplified.push([...first]);
        }
        return simplified;
      }),
    );
    return { type: 'MultiPolygon' as const, coordinates: newCoords } as GeoJSON.GeoJsonObject;
  }

  return geojson;
}

export function validCoord(c: unknown): c is [number, number] {
  return (
    Array.isArray(c) && c.length >= 2 &&
    Number.isFinite(c[0]) && Number.isFinite(c[1]) &&
    Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90 &&
    !(c[0] === 0 && c[1] === 0)
  );
}

export function sanitizeWkt(wkt: string): string {
  if (!wkt) return '';
  return wkt.replace(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?\s+[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/g, (match) => {
    const parts = match.split(/\s+/).map(Number);
    const a = parts[0];
    const b = parts[1];
    if (a != null && b != null && Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180) return match;
    if (a != null && b != null && Number.isFinite(a) && Number.isFinite(b) && Math.abs(b) <= 90 && Math.abs(a) <= 180) return `${b} ${a}`;
    return '0 0';
  });
}

export function geojsonToWkt(geojson: GeoJSON.GeoJsonObject | null | undefined): string {
  if (!geojson) return '';

  function coordStr(c: unknown): string | null {
    if (!validCoord(c)) return null;
    // GeoJSON [lng, lat] → Traccar WKT "lat lng"
    return `${c[1]} ${c[0]}`;
  }

  function ringStr(ring: number[][]): string {
    const parts = ring.map((c) => coordStr(c)).filter(Boolean) as string[];
    if (parts.length < 3) return '';
    // Ensure closed ring
    const firstCoord = ring[0];
    const lastCoord = ring[ring.length - 1];
    if (firstCoord && lastCoord && (firstCoord[0] !== lastCoord[0] || firstCoord[1] !== lastCoord[1])) {
      const closed = coordStr(firstCoord);
      if (closed) parts.push(closed);
    }
    return parts.join(', ');
  }

  if (geojson.type === 'Polygon') {
    const poly = geojson as GeoJSON.Polygon;
    const rings = poly.coordinates.map(ringStr).filter(Boolean);
    if (rings.length === 0) return '';
    return `POLYGON ((${rings[0]}))`;
  }

  if (geojson.type === 'MultiPolygon') {
    const multi = geojson as GeoJSON.MultiPolygon;
    const polygons = multi.coordinates.map((poly) => {
      const rings = poly.map(ringStr).filter(Boolean);
      return rings.length > 0 ? `(${rings[0]})` : '';
    }).filter(Boolean);
    if (polygons.length === 0) return '';
    return `MULTIPOLYGON (${polygons.join(', ')})`;
  }

  return '';
}

export function wktToGeoJson(wkt: string | null | undefined): GeoJSON.Feature | null {
  if (!wkt || typeof wkt !== 'string') return null;
  const trimmed = wkt.trim();

  const polyMatch = trimmed.match(/^POLYGON\s*\(\(([^)]+)\)\)\s*$/i);
  if (polyMatch) {
    const matched = polyMatch[1];
    if (!matched) return null;
    const coords: number[][] = matched.split(',').map((pt) => {
      const parts = pt.trim().split(/\s+/).map(Number);
      const a = parts[0]!;
      const b = parts[1]!;
      if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180) return [b, a];
      if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 180 && Math.abs(b) <= 90) return [a, b];
      return [b, a];
    });
    const firstCoord = coords[0];
    const lastCoord = coords[coords.length - 1];
    if (firstCoord && lastCoord && (firstCoord[0] !== lastCoord[0] || firstCoord[1] !== lastCoord[1])) {
      coords.push([...firstCoord]);
    }
    return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } };
  }

  return null;
}

/**
 * Convert a circle (center + radius in meters) to a WKT polygon (Traccar format).
 * Traccar WKT uses "lat lng" order.
 * Uses 48 points for a smooth circle.
 */
export function circleToWkt(center: [number, number], radiusMeters: number): string {
  if (!validCoord(center) || !Number.isFinite(radiusMeters) || radiusMeters <= 0) return '';
  const [lng, lat] = center;
  const segments = 48;
  const points: string[] = [];
  const latRad = (lat * Math.PI) / 180;
  const lngPerM = (1 / (111320 * Math.cos(latRad))) || 0.00000899;
  const latPerM = 1 / 110540;

  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * 2 * Math.PI;
    const dlng = Math.cos(angle) * radiusMeters * lngPerM;
    const dlat = Math.sin(angle) * radiusMeters * latPerM;
    // Traccar WKT: "lat lng" order
    points.push(`${(lat + dlat).toFixed(6)} ${(lng + dlng).toFixed(6)}`);
  }
  return `POLYGON ((${points.join(', ')}))`;
}
