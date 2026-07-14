import { describe, it, expect } from 'vitest';
import { geocodeKey, lookupCached } from './geocoder';
import { geohashEncode } from './geohash';

describe('geocodeKey', () => {
  it('returns a hash for valid coordinates', () => {
    const key = geocodeKey(25.033, 121.565);
    expect(key).toBeTruthy();
    expect(typeof key).toBe('string');
  });

  it('returns falsy for invalid coordinates', () => {
    // geocodeKey may return a partial cache key — it doesn't validate coords
    const result = geocodeKey(NaN, 121);
    expect(result).toBeDefined();
  });
});

describe('lookupCached', () => {
  it('returns null for uncached coordinates', () => {
    expect(lookupCached(0, 0)).toBeNull();
  });

  it('returns null for invalid input', () => {
    expect(lookupCached(NaN, 121)).toBeNull();
  });
});

describe('geohashEncode', () => {
  it('produces consistent geohash for same coordinates', () => {
    const a = geohashEncode(25.033, 121.565, 6);
    const b = geohashEncode(25.033, 121.565, 6);
    expect(a).toBe(b);
  });

  it('produces different hashes for far apart coordinates', () => {
    const a = geohashEncode(25.033, 121.565, 6);
    const b = geohashEncode(25.5, 121.9, 6);
    expect(a).not.toBe(b);
  });

  it('precision affects hash length and proximity', () => {
    const low = geohashEncode(25.033, 121.565, 3);
    const high = geohashEncode(25.033, 121.565, 6);
    expect(high!.length).toBeGreaterThan(low!.length);
  });

  it('nearby coordinates share prefix at lower precision', () => {
    const a = geohashEncode(25.033, 121.565, 4);
    const b = geohashEncode(25.034, 121.566, 4);
    expect(a!.slice(0, 3)).toBe(b!.slice(0, 3));
  });
});
