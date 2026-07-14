import { describe, it, expect } from 'vitest';
import {
  geojsonToWkt,
  wktToGeoJson,
  validCoord,
  sanitizeWkt,
  circleToWkt,
  simplifyPolygon,
} from './geo';

describe('validCoord', () => {
  it('accepts valid [lng, lat]', () => {
    expect(validCoord([121.5, 25.0])).toBe(true);
  });

  it('rejects [0, 0]', () => {
    expect(validCoord([0, 0])).toBe(false);
  });

  it('rejects non-finite values', () => {
    expect(validCoord([NaN, 25])).toBe(false);
    expect(validCoord([121.5, Infinity])).toBe(false);
  });

  it('rejects out-of-range values', () => {
    expect(validCoord([200, 25])).toBe(false);
    expect(validCoord([121.5, 100])).toBe(false);
  });
});

describe('geojsonToWkt', () => {
  it('converts Polygon GeoJSON to WKT with lat lng order', () => {
    const geojson = {
      type: 'Polygon' as const,
      coordinates: [[
        [121.5, 25.0],
        [121.6, 25.0],
        [121.6, 25.1],
        [121.5, 25.1],
        [121.5, 25.0],
      ]],
    };
    const wkt = geojsonToWkt(geojson);
    expect(wkt).toMatch(/^POLYGON \(\(/);
    // GeoJSON [lng, lat] → WKT "lat lng" (toFixed may strip trailing zeros)
    expect(wkt).toMatch(/25 121[.]5/);
    expect(wkt).toMatch(/25 121[.]6/);
    expect(wkt).toMatch(/25[.]1 121[.]6/);
    expect(wkt).toMatch(/25[.]1 121[.]5/);
  });

  it('returns empty string for null/undefined', () => {
    expect(geojsonToWkt(null)).toBe('');
    expect(geojsonToWkt(undefined)).toBe('');
  });
});

describe('wktToGeoJson', () => {
  it('converts WKT to Polygon Feature with lng lat order', () => {
    const wkt = 'POLYGON ((25.0 121.5, 25.0 121.6, 25.1 121.6, 25.1 121.5, 25.0 121.5))';
    const feature = wktToGeoJson(wkt);
    expect(feature).not.toBeNull();
    expect(feature!.type).toBe('Feature');
    expect(feature!.geometry.type).toBe('Polygon');
    const coords = (feature!.geometry as GeoJSON.Polygon).coordinates[0];
    expect(coords[0]).toEqual([121.5, 25.0]);
  });

  it('handles swapped coordinate order (lng lat in WKT)', () => {
    const wkt = 'POLYGON ((121.5 25.0, 121.6 25.0, 121.6 25.1, 121.5 25.1, 121.5 25.0))';
    const feature = wktToGeoJson(wkt);
    expect(feature).not.toBeNull();
    const coords2 = (feature!.geometry as GeoJSON.Polygon).coordinates[0];
    expect(coords2[0]).toEqual([121.5, 25.0]); // Still correctly reversed
  });

  it('returns null for empty/null input', () => {
    expect(wktToGeoJson(null)).toBeNull();
    expect(wktToGeoJson('')).toBeNull();
  });
});

describe('circleToWkt', () => {
  it('generates a valid WKT polygon', () => {
    const wkt = circleToWkt([121.5, 25.0], 500);
    expect(wkt).toMatch(/^POLYGON \(\(/);
    expect(wkt).toContain('25.');
    expect(wkt).toContain('121.');
  });

  it('returns empty string for invalid input', () => {
    expect(circleToWkt([0, 0], 500)).toBe('');
    expect(circleToWkt([121.5, 25.0], -1)).toBe('');
  });
});

describe('sanitizeWkt', () => {
  it('detects and fixes swapped coordinate order in WKT', () => {
    // Input where lng=121.5 comes first, lat=25.0 second
    // sanitizeWkt detects lng≤180, lat≤90 → swaps to lat=25, lng=121.5
    const input = 'POLYGON ((121.5 25.0, 121.6 25.0))';
    const result = sanitizeWkt(input);
    expect(result).toBe('POLYGON ((25 121.5, 25 121.6))');
  });
});

describe('simplifyPolygon', () => {
  it('returns points as-is for small arrays', () => {
    const pts: [number, number][] = [[0, 0], [1, 0], [1, 1]];
    expect(simplifyPolygon(pts, 0.5)).toHaveLength(3);
  });

  it('reduces collinear points', () => {
    const pts: [number, number][] = [[0, 0], [0.25, 0], [0.5, 0], [1, 0], [1, 1], [0.5, 1], [0, 1]];
    const result = simplifyPolygon(pts, 0.3);
    expect(result.length).toBeLessThan(pts.length);
  });
});
