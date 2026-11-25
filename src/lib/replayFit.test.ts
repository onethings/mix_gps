import { describe, expect, it } from 'vitest';
import { routeFitKey } from './replayFit';

const coords: Array<[number, number]> = [[96.1, 21.9], [96.2, 21.95], [96.3, 22]];
const scope = '2826|2026-08-11';

describe('routeFitKey', () => {
  it('stays the same when only address labels are patched into the route', () => {
    const afterLabelPatch = coords.map((c) => [...c] as [number, number]);
    expect(routeFitKey(scope, afterLabelPatch)).toBe(routeFitKey(scope, coords));
  });

  it('changes when the route moves to another day', () => {
    const otherDay: Array<[number, number]> = [[96.4, 22.1], [96.5, 22.2]];
    expect(routeFitKey(scope, otherDay)).not.toBe(routeFitKey(scope, coords));
  });

  it('changes when the same scope gains points', () => {
    const extended: Array<[number, number]> = [...coords, [96.4, 22.1]];
    expect(routeFitKey(scope, extended)).not.toBe(routeFitKey(scope, coords));
  });

  it('is empty for an empty route', () => {
    expect(routeFitKey(scope, [])).toBe('');
  });
});
