// Identity of a replay route's geometry, used to decide when the map may re-fit its camera.
// Address labels are patched into the route array after the points load, so the array identity
// changes while the geometry stays the same. Keying the fit on the geometry lets a user's own
// zoom survive those label patches.
export function routeFitKey(scope: string, coords: Array<[number, number]>): string {
  if (coords.length === 0) return '';
  const first = coords[0]!;
  const last = coords[coords.length - 1]!;
  return [scope, coords.length, first[0], first[1], last[0], last[1]].join('|');
}
