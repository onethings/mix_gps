import { describe, it, expect } from 'vitest';
import {
  MAX_ACTIVITY_EVENTS,
  activityWindow,
  activityWindowKey,
  buildActivity,
  formatHoursMinutes,
  mergeLiveEvents,
  normalizeEvent,
  type ActivityEvent,
} from './activity';
import type { TraccarEvent } from '@/types';

const NOW = new Date(2024, 4, 15, 14, 30, 0, 0).getTime();
const DAY_MS = 86_400_000;

function ev(id: number, eventTime: number, deviceId = 7, type = 'deviceOnline'): TraccarEvent {
  return { id, type, deviceId, eventTime };
}

describe('activityWindow', () => {
  it('starts today at local midnight and ends now', () => {
    const w = activityWindow('today', NOW);
    expect(w.fromMs).toBe(new Date(2024, 4, 15).getTime());
    expect(w.toMs).toBe(NOW);
  });

  it('spans exactly 24 hours', () => {
    const w = activityWindow('24h', NOW);
    expect(w.toMs - w.fromMs).toBe(DAY_MS);
    expect(w.toMs).toBe(NOW);
  });
});

describe('activityWindowKey', () => {
  it('differs across dates for today', () => {
    const a = activityWindowKey('today', new Date(2024, 4, 15, 0, 0, 1).getTime());
    const b = activityWindowKey('today', new Date(2024, 4, 16, 0, 0, 1).getTime());
    expect(a).not.toBe(b);
    expect(a).toBe(activityWindowKey('today', new Date(2024, 4, 15, 23, 59, 59).getTime()));
  });

  it('is empty for the rolling 24h window', () => {
    expect(activityWindowKey('24h', NOW)).toBe('');
  });
});

describe('normalizeEvent', () => {
  it('parses an ISO eventTime', () => {
    const ev0 = normalizeEvent({ id: 1, type: 'alarm', eventTime: '2024-05-15T10:00:00.000Z' });
    expect(ev0?.eventTime).toBe(Date.parse('2024-05-15T10:00:00.000Z'));
    expect(ev0?.type).toBe('alarm');
  });

  it('parses epoch milliseconds and epoch seconds', () => {
    expect(normalizeEvent({ id: 1, eventTime: 1_715_760_000_000 })?.eventTime).toBe(1_715_760_000_000);
    expect(normalizeEvent({ id: 1, eventTime: 1_715_760_000 })?.eventTime).toBe(1_715_760_000_000);
  });

  it('falls back to serverTime then fixTime, and to 0 when unparseable', () => {
    expect(normalizeEvent({ id: 1, serverTime: '2024-05-15T10:00:00.000Z' })?.eventTime).toBe(
      Date.parse('2024-05-15T10:00:00.000Z'),
    );
    expect(normalizeEvent({ id: 1, fixTime: '2024-05-15T11:00:00.000Z' })?.eventTime).toBe(
      Date.parse('2024-05-15T11:00:00.000Z'),
    );
    expect(normalizeEvent({ id: 1, eventTime: 'not a date' })?.eventTime).toBe(0);
    expect(normalizeEvent({ id: 1 })?.eventTime).toBe(0);
  });

  it('rejects missing or non-numeric ids', () => {
    expect(normalizeEvent({ type: 'alarm' })).toBeNull();
    expect(normalizeEvent({ id: 'abc', type: 'alarm' })).toBeNull();
    expect(normalizeEvent(null)).toBeNull();
    expect(normalizeEvent('nope')).toBeNull();
  });

  it('keeps geofenceId and attributes', () => {
    const parsed = normalizeEvent({
      id: 9,
      type: 'geofenceEnter',
      eventTime: 1_715_760_000_000,
      geofenceId: 3,
      attributes: { alarm: 'sos' },
    });
    expect(parsed?.geofenceId).toBe(3);
    expect(parsed?.attributes).toEqual({ alarm: 'sos' });
    expect(normalizeEvent({ id: 9, type: 'x' })?.geofenceId).toBeUndefined();
    expect(normalizeEvent({ id: 9, type: 'x', attributes: 'nope' })?.attributes).toBeUndefined();
  });
});

describe('buildActivity', () => {
  const window = { fromMs: NOW - 3_600_000, toMs: NOW };

  it('converts meters to km, summary milliseconds to hours, and knots to km/h', () => {
    const activity = buildActivity('today', window, [
      { distance: 12_345, engineHours: 5_040_000, maxSpeed: 47, averageSpeed: 20 },
    ], []);

    expect(activity.stats?.distanceKm).toBeCloseTo(12.345, 6);
    expect(activity.stats?.engineHours).toBeCloseTo(1.4, 6);
    expect(activity.stats?.maxSpeedKmh).toBeCloseTo(87.044, 3);
    expect(activity.stats?.averageSpeedKmh).toBeCloseTo(37.04, 3);
    expect(activity.range).toBe('today');
    expect(activity.fromMs).toBe(window.fromMs);
    expect(activity.toMs).toBe(window.toMs);
  });

  it('accepts a bare summary object', () => {
    expect(buildActivity('today', window, { distance: 500 }, []).stats?.distanceKm).toBeCloseTo(0.5, 6);
  });

  it('returns null stats for an empty summary array', () => {
    expect(buildActivity('today', window, [], []).stats).toBeNull();
    expect(buildActivity('today', window, null, []).stats).toBeNull();
  });

  it('clamps NaN and negative values to 0', () => {
    const stats = buildActivity('today', window, {
      distance: Number.NaN,
      engineHours: -5,
      maxSpeed: 'oops',
      averageSpeed: undefined,
    }, []).stats;
    expect(stats).toEqual({ distanceKm: 0, engineHours: 0, maxSpeedKmh: 0, averageSpeedKmh: 0 });
  });

  it('filters events before the window, sorts newest first, and caps the list', () => {
    const rows = [
      { id: 1, type: 'a', eventTime: window.fromMs + 1000 },
      { id: 2, type: 'b', eventTime: window.fromMs + 3000 },
      { id: 3, type: 'c', eventTime: window.fromMs - 1 },
      { id: 4, type: 'd', eventTime: window.fromMs + 2000 },
      null,
      { id: 'bad', type: 'e' },
    ];
    const events = buildActivity('today', window, [], rows).events;
    expect(events.map((e) => e.id)).toEqual([2, 4, 1]);
  });

  it('caps the event list', () => {
    const rows = Array.from({ length: MAX_ACTIVITY_EVENTS + 10 }, (_, i) => ({
      id: i + 1,
      type: 'deviceMoving',
      eventTime: window.fromMs + i,
    }));
    expect(buildActivity('today', window, [], rows).events).toHaveLength(MAX_ACTIVITY_EVENTS);
  });
});

describe('mergeLiveEvents', () => {
  const fromMs = NOW - 3_600_000;
  const base: ActivityEvent[] = [
    { id: 10, type: 'deviceOnline', eventTime: fromMs + 1000 },
    { id: 11, type: 'deviceOffline', eventTime: fromMs + 2000 },
  ];

  it('prepends new events for the device and sorts newest first', () => {
    const merged = mergeLiveEvents(base, [ev(12, fromMs + 5000)], 7, fromMs);
    expect(merged.map((e) => e.id)).toEqual([12, 11, 10]);
    expect(merged[0]?.type).toBe('deviceOnline');
  });

  it('ignores other devices and events older than the window', () => {
    const merged = mergeLiveEvents(
      base,
      [ev(13, fromMs + 5000, 99), ev(14, fromMs - 1, 7)],
      7,
      fromMs,
    );
    expect(merged).toBe(base);
  });

  it('dedupes ids already present', () => {
    const merged = mergeLiveEvents(base, [ev(11, fromMs + 2000), ev(15, fromMs + 9000)], 7, fromMs);
    expect(merged.map((e) => e.id)).toEqual([15, 11, 10]);
  });

  it('returns the same array reference when nothing new arrives', () => {
    expect(mergeLiveEvents(base, [], 7, fromMs)).toBe(base);
    expect(mergeLiveEvents(base, [ev(10, fromMs + 1000)], 7, fromMs)).toBe(base);
  });

  it('respects the cap', () => {
    const merged = mergeLiveEvents(
      base,
      Array.from({ length: 50 }, (_, i) => ev(100 + i, fromMs + 10_000 + i)),
      7,
      fromMs,
      3,
    );
    expect(merged).toHaveLength(3);
    expect(merged.map((e) => e.id)).toEqual([149, 148, 147]);
  });

  it('keeps live attributes and geofence ids', () => {
    const merged = mergeLiveEvents(
      base,
      [{ id: 20, type: 'alarm', deviceId: 7, eventTime: fromMs + 8000, geofenceId: 4, attributes: { alarm: 'sos' } }],
      7,
      fromMs,
    );
    expect(merged[0]).toMatchObject({ id: 20, geofenceId: 4, attributes: { alarm: 'sos' } });
  });
});

describe('formatHoursMinutes', () => {
  it('formats hours the way traccar-web does', () => {
    expect(formatHoursMinutes(67 + 59 / 60)).toBe('67 h 59 m');
    expect(formatHoursMinutes(2 + 48 / 60)).toBe('2 h 48 m');
    expect(formatHoursMinutes(0)).toBe('0 h 0 m');
    expect(formatHoursMinutes(1 / 60)).toBe('0 h 1 m');
  });

  it('round-trips summary milliseconds', () => {
    expect(formatHoursMinutes(10_105_000 / 3_600_000)).toBe('2 h 48 m');
    expect(formatHoursMinutes(244_740_000 / 3_600_000)).toBe('67 h 59 m');
  });

  it('clamps junk to zero', () => {
    expect(formatHoursMinutes(-3)).toBe('0 h 0 m');
    expect(formatHoursMinutes(Number.NaN)).toBe('0 h 0 m');
  });
});
