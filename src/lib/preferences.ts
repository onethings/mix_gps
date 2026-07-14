/**
 * User preferences stored in IndexedDB (settings store, no TTL).
 * Per-page preferences are cached in a Map for fast synchronous reads after initial load.
 */

import { cacheGet, cacheSet } from '@/lib/db';

const STORE = 'settings';

// ─── Page preference keys ────────────────────────────────────────────

/** Global app preferences (locale, theme, etc.) */
export interface GeneralPrefs {
  locale?: string;
  theme?: string;
}

/** Live Tracking page preferences */
export interface LiveTrackingPrefs {
  showBottomPanel?: boolean;
  lastVehicleId?: number | null;
}

/** Replay page preferences (per device) — basemap only */
export interface ReplayPrefs {
  basemap?: string;
}

/** Replay page global preferences (shared across all devices) */
export interface ReplayGlobalPrefs {
  showChartPanel?: boolean;
  showData?: boolean;
}

// ─── In-memory cache for fast reads after first load ─────────────────

const prefsCache = new Map<string, unknown>();

function cacheKey(page: string, suffix = ''): string {
  return suffix ? `pref:${page}:${suffix}` : `pref:${page}`;
}

// ─── Generic helpers ─────────────────────────────────────────────────

async function getPref<T>(key: string): Promise<T | null> {
  // Check in-memory cache first
  if (prefsCache.has(key)) return prefsCache.get(key) as T;
  const val = await cacheGet<T>(STORE, key);
  if (val !== null) prefsCache.set(key, val);
  return val;
}

async function setPref<T>(key: string, value: T): Promise<void> {
  prefsCache.set(key, value);
  await cacheSet(STORE, key, value, 0); // TTL=0 means never expire
}

// ─── Live Tracking page ──────────────────────────────────────────────

export async function getLiveTrackingPrefs(): Promise<LiveTrackingPrefs> {
  return (await getPref<LiveTrackingPrefs>(cacheKey('liveTracking'))) ?? {};
}

export async function setLiveTrackingPrefs(prefs: LiveTrackingPrefs): Promise<void> {
  await setPref(cacheKey('liveTracking'), prefs);
}

// ─── Replay page (per device) ────────────────────────────────────────

export async function getReplayPrefs(deviceId: string): Promise<ReplayPrefs> {
  return (await getPref<ReplayPrefs>(cacheKey('replay', deviceId))) ?? {};
}

export async function setReplayPrefs(deviceId: string, prefs: ReplayPrefs): Promise<void> {
  await setPref(cacheKey('replay', deviceId), prefs);
}

// ─── Replay page (global — chart/data visibility shared across all devices) ───

export async function getReplayGlobalPrefs(): Promise<ReplayGlobalPrefs> {
  return (await getPref<ReplayGlobalPrefs>(cacheKey('replayGlobal'))) ?? {};
}

export async function setReplayGlobalPrefs(prefs: ReplayGlobalPrefs): Promise<void> {
  await setPref(cacheKey('replayGlobal'), prefs);
}

// ─── Global app preferences (locale, theme) ──────────────────────────

export async function getGeneralPrefs(): Promise<GeneralPrefs> {
  return (await getPref<GeneralPrefs>(cacheKey('general'))) ?? {};
}

export async function setGeneralPrefs(prefs: GeneralPrefs): Promise<void> {
  await setPref(cacheKey('general'), prefs);
}
