/**
 * Alert panel settings stored in IndexedDB (settings store, no TTL).
 * Mirrors the Flutter version's Hive 'ui_settings' box pattern.
 */

import { cacheGet, cacheSet } from '@/lib/db';

const STORE = 'settings';
const PREFIX = 'alert:';

// ─── Types ───────────────────────────────────────────────────────────

export interface AlertSettings {
  /** Timer duration in seconds (default 300 = 5 min) */
  timerDuration: number;
  /** Colors per minute threshold (key: `5`, `4`, `3`, `2`, `1`) — ARGB int */
  timerColors: Record<number, string>;
  /** Ordered list of visible card field keys */
  cardFieldsOrder: string[];
  /** Set of visible card field keys */
  cardFieldsVisible: Record<string, boolean>;
}

export type AlertCardFieldKey = 'eventType' | 'licensePlate' | 'geofence' | 'time';

export const ALL_CARD_FIELDS: { key: AlertCardFieldKey; label: string }[] = [
  { key: 'eventType', label: 'Event Type' },
  { key: 'licensePlate', label: 'License Plate' },
  { key: 'geofence', label: 'Geofence' },
  { key: 'time', label: 'Time' },
];

export const DEFAULT_TIMER_COLORS: Record<number, string> = {
  5: '#ef4444', // red
  4: '#f97316', // orange
  3: '#eab308', // yellow
  2: '#3b82f6', // blue
  1: '#22c55e', // green
};

export const PRESET_COLORS: string[] = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6',
  '#06b6d4', '#84cc16', '#f43f5e', '#a855f7',
  '#6366f1', '#f59e0b',
];

const DEFAULTS: AlertSettings = {
  timerDuration: 300,
  timerColors: { ...DEFAULT_TIMER_COLORS },
  cardFieldsOrder: ['eventType', 'licensePlate', 'geofence', 'time'],
  cardFieldsVisible: { eventType: true, licensePlate: true, geofence: true, time: true },
};

// ─── Cache ───────────────────────────────────────────────────────────

let cached: AlertSettings | null = null;

function settingsKey(): string {
  return `${PREFIX}settings`;
}

// ─── Public API ──────────────────────────────────────────────────────

export async function getAlertSettings(): Promise<AlertSettings> {
  if (cached) return cached;
  const stored = await cacheGet<AlertSettings>(STORE, settingsKey());
  if (stored) {
    // Merge with defaults to handle missing keys from older versions
    cached = {
      ...DEFAULTS,
      ...stored,
      timerColors: { ...DEFAULTS.timerColors, ...(stored.timerColors ?? {}) },
      cardFieldsOrder: stored.cardFieldsOrder ?? DEFAULTS.cardFieldsOrder,
      cardFieldsVisible: { ...DEFAULTS.cardFieldsVisible, ...(stored.cardFieldsVisible ?? {}) },
    };
    return cached;
  }
  cached = { ...DEFAULTS, timerColors: { ...DEFAULTS.timerColors }, cardFieldsOrder: [...DEFAULTS.cardFieldsOrder], cardFieldsVisible: { ...DEFAULTS.cardFieldsVisible } };
  return cached;
}

export async function updateAlertSettings(partial: Partial<AlertSettings>): Promise<AlertSettings> {
  const current = await getAlertSettings();
  const next: AlertSettings = {
    ...current,
    ...partial,
    timerColors: { ...current.timerColors, ...(partial.timerColors ?? {}) },
    cardFieldsOrder: partial.cardFieldsOrder ?? current.cardFieldsOrder,
    cardFieldsVisible: { ...current.cardFieldsVisible, ...(partial.cardFieldsVisible ?? {}) },
  };
  cached = next;
  await cacheSet(STORE, settingsKey(), next, 0);
  return next;
}

export async function resetAlertSettings(): Promise<AlertSettings> {
  cached = { ...DEFAULTS, timerColors: { ...DEFAULTS.timerColors }, cardFieldsOrder: [...DEFAULTS.cardFieldsOrder], cardFieldsVisible: { ...DEFAULTS.cardFieldsVisible } };
  await cacheSet(STORE, settingsKey(), cached, 0);
  return cached;
}

/** Get the colour for a given remaining seconds based on thresholds. */
export function getTimerColor(remainingSeconds: number, settings: AlertSettings): string {
  const minutes = Math.ceil(remainingSeconds / 60);
  if (minutes >= 5) return settings.timerColors[5] ?? DEFAULT_TIMER_COLORS[5];
  if (minutes >= 4) return settings.timerColors[4] ?? DEFAULT_TIMER_COLORS[4];
  if (minutes >= 3) return settings.timerColors[3] ?? DEFAULT_TIMER_COLORS[3];
  if (minutes >= 2) return settings.timerColors[2] ?? DEFAULT_TIMER_COLORS[2];
  return settings.timerColors[1] ?? DEFAULT_TIMER_COLORS[1];
}
