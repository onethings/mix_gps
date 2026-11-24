import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import {
  activityWindow,
  activityWindowKey,
  buildActivity,
  type ActivityRange,
  type DeviceActivity,
} from '@/lib/activity';

export const ACTIVITY_CACHE_TTL_MS = 2 * 60_000;

interface CacheEntry {
  data: DeviceActivity;
  fetchedAt: number;
}

interface ActivityState {
  data: DeviceActivity | null;
  loading: boolean;
  error: string | null;
  fetchedAt: number | null;
  key: string | null;
}

export interface UseDeviceActivityResult {
  data: DeviceActivity | null;
  loading: boolean;
  error: string | null;
  fetchedAt: number | null;
  refresh: () => void;
}

const IDLE: ActivityState = { data: null, loading: false, error: null, fetchedAt: null, key: null };

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<CacheEntry>>();

function cacheKey(deviceId: number, range: ActivityRange, fromMs: number): string {
  return `${deviceId}:${range}:${activityWindowKey(range, fromMs)}`;
}

function fetchActivity(
  deviceId: number,
  range: ActivityRange,
  key: string,
  window: { fromMs: number; toMs: number },
): Promise<CacheEntry> {
  const existing = inflight.get(key);
  if (existing) return existing;

  const params = {
    deviceId,
    from: new Date(window.fromMs).toISOString(),
    to: new Date(window.toMs).toISOString(),
  };

  const promise: Promise<CacheEntry> = Promise.all([
    api.reports.summary(params),
    api.reports.events(params),
  ]).then(([summary, events]) => {
    const entry: CacheEntry = { data: buildActivity(range, window, summary, events), fetchedAt: Date.now() };
    cache.set(key, entry);
    return entry;
  });

  inflight.set(key, promise);
  const settle = () => {
    if (inflight.get(key) === promise) inflight.delete(key);
  };
  promise.then(settle, settle);

  return promise;
}

export function useDeviceActivity(deviceId: number | null, range: ActivityRange): UseDeviceActivityResult {
  const [state, setState] = useState<ActivityState>(IDLE);
  const mountedRef = useRef(false);
  const currentKeyRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(
    (force: boolean) => {
      if (deviceId == null) {
        currentKeyRef.current = null;
        setState(IDLE);
        return;
      }

      const window = activityWindow(range);
      const key = cacheKey(deviceId, range, window.fromMs);
      currentKeyRef.current = key;

      const cached = cache.get(key);
      if (!force && cached && Date.now() - cached.fetchedAt < ACTIVITY_CACHE_TTL_MS) {
        setState({ data: cached.data, loading: false, error: null, fetchedAt: cached.fetchedAt, key });
        return;
      }

      const promise = fetchActivity(deviceId, range, key, window);

      setState((prev) =>
        prev.key === key
          ? { ...prev, loading: true, error: null }
          : { data: null, loading: true, error: null, fetchedAt: null, key },
      );

      promise.then(
        (entry) => {
          if (!mountedRef.current || currentKeyRef.current !== key) return;
          setState({ data: entry.data, loading: false, error: null, fetchedAt: entry.fetchedAt, key });
        },
        (e: unknown) => {
          if (!mountedRef.current || currentKeyRef.current !== key) return;
          setState({
            data: null,
            loading: false,
            error: (e as Error)?.message || 'Request failed',
            fetchedAt: null,
            key,
          });
        },
      );
    },
    [deviceId, range],
  );

  // Included in the deps so crossing local midnight refetches the "today" window.
  const dayKey = activityWindowKey(range, activityWindow(range).fromMs);

  useEffect(() => {
    load(false);
  }, [load, dayKey]);

  const refresh = useCallback(() => {
    if (deviceId == null) return;
    load(true);
  }, [deviceId, load]);

  // Until the effect re-runs for a new device or range, `state` still holds the previous
  // snapshot. Hide it rather than render one frame of another vehicle's numbers.
  const currentKey = deviceId == null ? null : cacheKey(deviceId, range, activityWindow(range).fromMs);
  const aligned = currentKey !== null && state.key === currentKey;

  return {
    data: aligned ? state.data : null,
    loading: state.loading,
    error: aligned ? state.error : null,
    fetchedAt: aligned ? state.fetchedAt : null,
    refresh,
  };
}
