import { geohashEncode } from './geohash.js';

const GEOHASH_PRECISION = 6;
const MIN_INTERVAL_MS = 1500;
const ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';
const DB_NAME = 'fleet-geocode-cache';
const DB_VERSION = 1;
const STORE_NAME = 'addresses';

interface CacheRecord {
  hash: string;
  address: string;
  t: number;
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'hash' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGet(hash: string): Promise<CacheRecord | null> {
  try {
    const db = await openDb();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(hash);
      req.onsuccess = () => { resolve(req.result || null); db.close(); };
      req.onerror = () => { db.close(); resolve(null); };
    });
  } catch { return null; }
}

async function dbSet(hash: string, address: string): Promise<void> {
  try {
    const db = await openDb();
    if (!db) return;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).put({ hash, address, t: Date.now() });
      req.onsuccess = () => { db.close(); resolve(); };
      req.onerror = () => { db.close(); resolve(); };
    });
  } catch { /* ignore */ }
}

const HOT_CACHE_LIMIT = 500;
const hotCache = new Map<string, string>();

function hotGet(hash: string): string | undefined {
  const hit = hotCache.get(hash);
  if (hit) {
    hotCache.delete(hash);
    hotCache.set(hash, hit);
    return hit;
  }
  return undefined;
}

function hotSet(hash: string, address: string): void {
  if (hotCache.has(hash)) hotCache.delete(hash);
  else if (hotCache.size >= HOT_CACHE_LIMIT) {
    const oldest = hotCache.keys().next().value;
    if (oldest) hotCache.delete(oldest);
  }
  hotCache.set(hash, address);
}

function makeKey(lat: number, lng: number): string {
  return geohashEncode(lat, lng, GEOHASH_PRECISION);
}

const subscribers = new Set<(hash: string, address: string) => void>();

function notify(hash: string, address: string): void {
  subscribers.forEach((fn) => {
    try { fn(hash, address); } catch { /* ignore */ }
  });
}

function formatAddress(data: { address?: Record<string, string>; display_name?: string } | null): string | null {
  if (!data) return null;
  const a = data.address || {};
  const line1 = [a.house_number, a.road || a.pedestrian || a.footway].filter(Boolean).join(' ');
  const locality = a.suburb || a.neighbourhood || a.village || a.town || a.city || a.county;
  const region = a.state || a.region;
  const parts = [line1 || null, locality, region].filter(Boolean);
  if (parts.length) return parts.join(', ');
  return data.display_name || null;
}

const queue: Array<{ hash: string; lat: number; lng: number; resolve: (addr: string | null) => void }> = [];
const inflight = new Map<string, Promise<string | null>>();
let lastRequestAt = 0;
let draining = false;

async function runRequest(lat: number, lng: number): Promise<string | null> {
  const now = Date.now();
  const wait = Math.max(0, lastRequestAt + MIN_INTERVAL_MS - now);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
  const url = `${ENDPOINT}?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  return formatAddress(await res.json());
}

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  while (queue.length) {
    const { hash, lat, lng, resolve } = queue.shift()!;
    try {
      const address = await runRequest(lat, lng);
      if (address) {
        await dbSet(hash, address);
        hotSet(hash, address);
        notify(hash, address);
      }
      resolve(address);
    } catch {
      resolve(null);
    }
    inflight.delete(hash);
  }
  draining = false;
}

let preloaded = false;

async function preloadFromDb(): Promise<void> {
  if (preloaded) return;
  preloaded = true;
  try {
    const db = await openDb();
    if (!db) return;
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => {
      const rows = (req.result || []) as CacheRecord[];
      rows.forEach((r) => {
        if (r?.hash && r?.address) hotSet(r.hash, r.address);
      });
      db.close();
    };
    req.onerror = () => { db.close(); };
  } catch { /* ignore */ }
}

if (typeof indexedDB !== 'undefined') preloadFromDb();

export function lookupCached(lat: number, lng: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const hash = makeKey(lat, lng);
  if (!hash) return null;
  return hotGet(hash) || null;
}

export function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return Promise.resolve(null);
  const hash = makeKey(lat, lng);
  if (!hash) return Promise.resolve(null);

  const hot = hotGet(hash);
  if (hot !== undefined) return Promise.resolve(hot);

  if (inflight.has(hash)) return inflight.get(hash)!;

  const promise = new Promise<string | null>((resolve) => {
    queue.push({ hash, lat, lng, resolve });
    setTimeout(drain, 0);
  });
  inflight.set(hash, promise);
  return promise;
}

export function subscribeGeocode(fn: (hash: string, address: string) => void): () => void {
  subscribers.add(fn);
  return () => { subscribers.delete(fn); };
}

export function geocodeKey(lat: number, lng: number): string {
  return makeKey(lat, lng);
}
