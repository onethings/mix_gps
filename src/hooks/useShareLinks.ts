import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { api } from '@/lib/api';

function storageKey(userId) {
  return userId ? `mixok-share-links-${userId}` : 'mixok-share-links';
}
function viewsKey(userId) {
  return userId ? `mixok-share-view-counts-${userId}` : 'mixok-share-view-counts';
}

// ── Per-user state cache ──
const caches = {};

function getCache(userId) {
  const id = userId ?? '__anon__';
  if (!caches[id]) caches[id] = { cachedLinks: null, cachedViewCounts: null, listeners: [] };
  return caches[id];
}

function readLinks(userId) {
  try {
    return JSON.parse(localStorage.getItem(storageKey(userId))) || [];
  } catch {
    return [];
  }
}

function readViewCounts(userId) {
  try {
    return JSON.parse(localStorage.getItem(viewsKey(userId))) || {};
  } catch {
    return {};
  }
}

function getStoredLinks(userId) {
  const cache = getCache(userId);
  if (cache.cachedLinks === null) cache.cachedLinks = readLinks(userId);
  return cache.cachedLinks;
}

function getViewCounts(userId) {
  const cache = getCache(userId);
  if (cache.cachedViewCounts === null) cache.cachedViewCounts = readViewCounts(userId);
  return cache.cachedViewCounts;
}

function persistLinks(userId, links) {
  localStorage.setItem(storageKey(userId), JSON.stringify(links));
  const cache = getCache(userId);
  cache.cachedLinks = null;
  cache.cachedViewCounts = null;
  emitChange(userId);
}

function persistViewCounts(userId, counts) {
  localStorage.setItem(viewsKey(userId), JSON.stringify(counts));
  const cache = getCache(userId);
  cache.cachedLinks = null;
  cache.cachedViewCounts = null;
  emitChange(userId);
}

function emitChange(userId) {
  const cache = getCache(userId);
  cache.cachedLinks = null;
  cache.cachedViewCounts = null;
  const ls = cache.listeners.slice();
  ls.forEach((l) => l());
}

function subscribeFactory(userId) {
  return (callback) => {
    const cache = getCache(userId);
    cache.listeners.push(callback);
    return () => {
      const c = getCache(userId);
      c.listeners = c.listeners.filter((l) => l !== callback);
    };
  };
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function generateShareCode() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

export const DURATION_OPTIONS = [
  { label: 'h1', value: 1, unit: 'hours' },
  { label: 'h3', value: 3, unit: 'hours' },
  { label: 'h6', value: 6, unit: 'hours' },
  { label: 'h12', value: 12, unit: 'hours' },
  { label: 'd1', value: 1, unit: 'days' },
  { label: 'd3', value: 3, unit: 'days' },
  { label: 'd5', value: 5, unit: 'days' },
  { label: 'd7', value: 7, unit: 'days' },
  { label: 'd10', value: 10, unit: 'days' },
  { label: 'd15', value: 15, unit: 'days' },
  { label: 'm1', value: 1, unit: 'months' },
  { label: 'y1', value: 1, unit: 'years' },
];

function computeExpiresAt(duration, unit) {
  const now = Date.now();
  const msMap = {
    hours: 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
    months: 30 * 24 * 60 * 60 * 1000,
    years: 365 * 24 * 60 * 60 * 1000,
  };
  return new Date(now + duration * (msMap[unit] || msMap.hours)).toISOString();
}

// ── Module-level init (deferred to avoid SSR issues) ──
const inits = {};
function init(userId) {
  const id = userId ?? '__anon__';
  if (inits[id]) return;
  inits[id] = true;
  if (typeof window === 'undefined') return;
  window.addEventListener('storage', (e) => {
    if (e.key === storageKey(userId) || e.key === viewsKey(userId)) {
      emitChange(userId);
    }
  });
}

export function useShareLinks(userId) {
  const initRef = useRef(false);
  if (!initRef.current) {
    initRef.current = true;
    init(userId);
  }

  const subscribe = useMemo(() => subscribeFactory(userId), [userId]);

  const links = useSyncExternalStore(
    subscribe,
    () => getStoredLinks(userId),
    () => getStoredLinks(userId),
  );
  const viewCounts = useSyncExternalStore(
    subscribe,
    () => getViewCounts(userId),
    () => getViewCounts(userId),
  );

  const activeShares = useMemo(
    () => links.filter((l) => new Date(l.expiresAt) > new Date()),
    [links],
  );

  const expiredShares = useMemo(
    () => links.filter((l) => new Date(l.expiresAt) <= new Date()),
    [links],
  );

  const createShareLink = useCallback(
    async (vehicles, durationValue, durationUnit) => {
      const now = new Date().toISOString();
      const expiresAt = computeExpiresAt(durationValue, durationUnit);

      // Create shares on Traccar server via API
      const serverShares = [];
      for (const v of vehicles) {
        const deviceId = v._raw?.device?.id ?? v.id;
        try {
          const result = await api.share.device(deviceId, expiresAt);
          serverShares.push({ deviceId, result });
        } catch (err) {
          console.warn('Traccar share API failed for device', deviceId, err);
        }
      }

      const share = {
        id: generateId(),
        code: serverShares[0]?.result?.token || generateShareCode(),
        serverToken: serverShares[0]?.result?.token || null,
        vehicles: vehicles.map((v) => ({
          id: v.id,
          name: v.name,
          plate: v.plate || v.name,
          deviceId: v._raw?.device?.uniqueId || v.id,
          lat: Number.isFinite(v.lat) ? v.lat : null,
          lng: Number.isFinite(v.lng) ? v.lng : null,
          course: v.course ?? 0,
          speed: v.speed ?? 0,
          status: v.status || 'offline',
          lastUpdate: v.lastUpdate || now,
        })),
        durationValue,
        durationUnit,
        createdAt: now,
        expiresAt,
        active: true,
      };
      const all = [...readLinks(userId), share];
      persistLinks(userId, all);
      return share;
    },
    [userId],
  );

  const revokeShare = useCallback((shareId) => {
    const all = readLinks(userId).map((l) =>
      l.id === shareId ? { ...l, active: false, revokedAt: new Date().toISOString() } : l,
    );
    persistLinks(userId, all);
  }, [userId]);

  const revokeAllShares = useCallback(() => {
    const all = readLinks(userId).map((l) =>
      l.active ? { ...l, active: false, revokedAt: new Date().toISOString() } : l,
    );
    persistLinks(userId, all);
  }, [userId]);

  const recordView = useCallback((shareCode) => {
    const counts = readViewCounts(userId);
    counts[shareCode] = (counts[shareCode] || 0) + 1;
    persistViewCounts(userId, counts);
  }, [userId]);

  const getShareUrl = useCallback((share) => {
    if (!share) return '';
    // If we have a server token, use the server share page
    if (share.serverToken) {
      const base = window.location.origin;
      return `${base}/shared?token=${share.serverToken}&code=${share.code}`;
    }
    // Fallback to local-only share
    const base = window.location.origin;
    return `${base}/shared?code=${share.code}`;
  }, []);

  return {
    links,
    activeShares,
    expiredShares,
    viewCounts,
    createShareLink,
    revokeShare,
    revokeAllShares,
    recordView,
    getShareUrl,
  };
}
