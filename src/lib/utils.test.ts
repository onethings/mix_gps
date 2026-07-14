import { describe, it, expect } from 'vitest';
import { cn, formatDistance, formatDuration, formatCurrency, initials, wktPolygonAreaKm2 } from './utils';

describe('cn', () => {
  it('merges tailwind classes', () => {
    expect(cn('px-4', 'px-2')).toBe('px-2');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('handles conditional classes', () => {
    expect(cn('base', 'visible')).toBe('base visible');
  });

  it('returns empty string for no args', () => {
    expect(cn()).toBe('');
  });
});

describe('formatDistance', () => {
  it('formats km as-is', () => {
    expect(formatDistance(42.5)).toBe('42.5 km');
  });

  it('formats thousands as k km', () => {
    expect(formatDistance(1500)).toBe('1.5k km');
  });

  it('returns em dash for null/undefined', () => {
    expect(formatDistance(null)).toBe('—');
    expect(formatDistance(undefined)).toBe('—');
  });
});

describe('formatDuration', () => {
  it('formats hours and minutes', () => {
    expect(formatDuration(125)).toBe('2h 5m');
  });

  it('formats only minutes when < 60', () => {
    expect(formatDuration(45)).toBe('45m');
  });

  it('returns em dash for null/undefined', () => {
    expect(formatDuration(null)).toBe('—');
  });
});

describe('formatCurrency', () => {
  it('formats with default USD', () => {
    const result = formatCurrency(50000);
    expect(result).toContain('50');
  });

  it('handles zero', () => {
    expect(formatCurrency(0)).toContain('0');
  });
});

describe('initials', () => {
  it('extracts initials from full name', () => {
    expect(initials('John Doe')).toBe('JD');
  });

  it('handles single name', () => {
    expect(initials('Alice')).toBe('A');
  });

  it('returns empty for empty string', () => {
    expect(initials('')).toBe('');
  });

  it('limits to two letters', () => {
    expect(initials('John Michael Doe')).toBe('JM');
  });
});

describe('wktPolygonAreaKm2', () => {
  it('computes area for a simple polygon WKT', () => {
    // A small square around Taipei (roughly 10km x 10km)
    const wkt = 'POLYGON ((25.0 121.5, 25.0 121.6, 25.1 121.6, 25.1 121.5, 25.0 121.5))';
    const area = wktPolygonAreaKm2(wkt);
    expect(area).not.toBeNull();
    expect(area!).toBeGreaterThan(50); // ~100 km²
    expect(area!).toBeLessThan(200);
  });

  it('returns null for null/undefined', () => {
    expect(wktPolygonAreaKm2(null)).toBeNull();
    expect(wktPolygonAreaKm2(undefined)).toBeNull();
  });

  it('returns null for invalid WKT', () => {
    expect(wktPolygonAreaKm2('INVALID')).toBeNull();
    expect(wktPolygonAreaKm2('POINT (1 2)')).toBeNull();
  });

  it('returns null for polygons with fewer than 3 points', () => {
    const wkt = 'POLYGON ((25.0 121.5, 25.0 121.6))';
    expect(wktPolygonAreaKm2(wkt)).toBeNull();
  });
});
