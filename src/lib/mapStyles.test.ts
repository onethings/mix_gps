import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_STYLE_ID, MAP_STYLES, getMapStyleDef, resolveMapStyle } from './mapStyles';

describe('map styles', () => {
  it('resolves every registered style to a usable maplibre style', () => {
    for (const def of MAP_STYLES) {
      const style = resolveMapStyle(def.id);
      if (def.id === DEFAULT_MAP_STYLE_ID) {
        expect(style).toBe('/custom/liberty.json');
        continue;
      }
      expect(typeof style).toBe('object');
      const spec = style as Record<string, unknown>;
      expect(spec.version).toBe(8);
      expect(Object.keys(spec.sources as object).length).toBeGreaterThan(0);
      expect((spec.layers as unknown[]).length).toBeGreaterThan(0);
      expect(def.tiles && def.tiles.length).toBeGreaterThan(0);
      expect((spec.sources as Record<string, { type: string }>).raster.type).toBe('raster');
    }
  });

  it('falls back to the default road style for unknown ids', () => {
    expect(resolveMapStyle('does-not-exist')).toBe(resolveMapStyle(DEFAULT_MAP_STYLE_ID));
    expect(getMapStyleDef('does-not-exist').id).toBe(DEFAULT_MAP_STYLE_ID);
  });
});
