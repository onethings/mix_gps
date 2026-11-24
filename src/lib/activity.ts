import type { TraccarEvent } from '@/types';

export type ActivityRange = 'today' | '24h';

export interface ActivityEvent {
  id: number;
  type: string;
  eventTime: number; // epoch ms, 0 when unknown
  geofenceId?: number;
  attributes?: Record<string, unknown>;
}

export interface ActivityStats {
  distanceKm: number;
  engineHours: number;
  maxSpeedKmh: number;
  averageSpeedKmh: number;
}

export interface DeviceActivity {
  range: ActivityRange;
  fromMs: number;
  toMs: number;
  stats: ActivityStats | null;
  events: ActivityEvent[];
}

export const MAX_ACTIVITY_EVENTS = 40;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const KNOT_TO_KMH = 1.852;
// Anything at or above this is already epoch milliseconds; below it is treated as epoch seconds.
const EPOCH_SECONDS_CEILING = 1e12;

export function activityWindow(range: ActivityRange, now: number = Date.now()): { fromMs: number; toMs: number } {
  if (range === '24h') return { fromMs: now - DAY_MS, toMs: now };
  const d = new Date(now);
  return { fromMs: new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(), toMs: now };
}

export function activityWindowKey(range: ActivityRange, fromMs: number): string {
  if (range === '24h') return '';
  const d = new Date(fromMs);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function secondsOrMs(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < EPOCH_SECONDS_CEILING ? value * 1000 : value;
}

function epochMs(value: unknown): number {
  if (typeof value === 'number') return secondsOrMs(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) return secondsOrMs(numeric);
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeEvent(raw: unknown): ActivityEvent | null {
  if (!isPlainObject(raw)) return null;
  const id = Number(raw.id);
  if (raw.id == null || !Number.isFinite(id)) return null;

  const geofenceId = raw.geofenceId == null ? NaN : Number(raw.geofenceId);

  return {
    id,
    type: typeof raw.type === 'string' ? raw.type : '',
    eventTime: epochMs(raw.eventTime ?? raw.serverTime ?? raw.fixTime),
    geofenceId: Number.isFinite(geofenceId) ? geofenceId : undefined,
    attributes: isPlainObject(raw.attributes) ? raw.attributes : undefined,
  };
}

function nonNegative(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function parseReportSummary(raw: unknown): ActivityStats | null {
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!isPlainObject(row)) return null;
  return {
    distanceKm: nonNegative(row.distance) / 1000,
    // SummaryReportItem computes engineHours as endHours - startHours, and both are milliseconds
    // (see traccar-web formatNumericHours, which divides by 3_600_000 before showing X h Y m).
    engineHours: nonNegative(row.engineHours) / HOUR_MS,
    maxSpeedKmh: nonNegative(row.maxSpeed) * KNOT_TO_KMH,
    averageSpeedKmh: nonNegative(row.averageSpeed) * KNOT_TO_KMH,
  };
}

/** Render hours the way traccar-web does: "67 h 59 m". */
export function formatHoursMinutes(hours: number): string {
  const totalMs = Math.round(Math.max(0, Number.isFinite(hours) ? hours : 0) * HOUR_MS);
  const h = Math.floor(totalMs / HOUR_MS);
  const m = Math.floor((totalMs % HOUR_MS) / 60_000);
  return `${h} h ${m} m`;
}

export function buildActivity(
  range: ActivityRange,
  window: { fromMs: number; toMs: number },
  summaryRaw: unknown,
  eventsRaw: unknown,
): DeviceActivity {
  const events: ActivityEvent[] = [];
  if (Array.isArray(eventsRaw)) {
    for (const row of eventsRaw) {
      const ev = normalizeEvent(row);
      if (ev && ev.eventTime >= window.fromMs) events.push(ev);
    }
  }
  events.sort((a, b) => b.eventTime - a.eventTime);

  return {
    range,
    fromMs: window.fromMs,
    toMs: window.toMs,
    stats: parseReportSummary(summaryRaw),
    events: events.slice(0, MAX_ACTIVITY_EVENTS),
  };
}

export function mergeLiveEvents(
  base: ActivityEvent[],
  live: TraccarEvent[],
  deviceId: number,
  fromMs: number,
  cap: number = MAX_ACTIVITY_EVENTS,
): ActivityEvent[] {
  const known = new Set(base.map((e) => e.id));
  const fresh: ActivityEvent[] = [];

  for (const raw of Array.isArray(live) ? live : []) {
    if (raw?.deviceId !== deviceId) continue;
    const ev = normalizeEvent(raw);
    if (!ev || ev.eventTime < fromMs || known.has(ev.id)) continue;
    known.add(ev.id);
    fresh.push(ev);
  }

  if (fresh.length === 0) return base;
  return [...fresh, ...base].sort((a, b) => b.eventTime - a.eventTime).slice(0, cap);
}
