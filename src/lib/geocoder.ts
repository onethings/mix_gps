import { geohashEncode } from './geohash.js';

const GEOHASH_PRECISION = 6;
const MIN_INTERVAL_MS = 1500;
const ENDPOINT = '/geocode/reverse';
const DB_NAME = 'fleet-geocode-cache';
const DB_VERSION = 3;
const STORE_NAME = 'addresses';

interface CacheRecord {
  hash: string;
  lang: string;
  address: string;
  t: number;
}

function getLocale(): string {
  try { return localStorage.getItem('mixok-locale') || 'en'; }
  catch { return 'en'; }
}

/* Nominatim accept-language: use full locale or just language code */
function langParam(): string {
  const loc = getLocale();
  // Map common codes to Nominatim-compatible values
  const map: Record<string, string> = { zh: 'zh-Hans', 'zh-cn': 'zh-Hans', 'zh-tw': 'zh-Hant', ja: 'ja', ko: 'ko' };
  return map[loc] || loc.slice(0, 2);
}

function cacheKey(hash: string): string {
  return `${hash}:${langParam()}`;
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Drop old store if exists (version 1 had different schema)
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      store.createIndex('hash_lang', ['hash', 'lang'], { unique: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGet(hash: string): Promise<CacheRecord | null> {
  try {
    const db = await openDb();
    if (!db) return null;
    const lang = langParam();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const index = tx.objectStore(STORE_NAME).index('hash_lang');
      const req = index.get([hash, lang]);
      req.onsuccess = () => { resolve(req.result || null); db.close(); };
      req.onerror = () => { db.close(); resolve(null); };
    });
  } catch { return null; }
}

async function dbSet(hash: string, address: string): Promise<void> {
  try {
    const db = await openDb();
    if (!db) return;
    const lang = langParam();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      // Try to find existing record first
      const index = store.index('hash_lang');
      const getReq = index.get([hash, lang]);
      getReq.onsuccess = () => {
        const existing = getReq.result;
        if (existing) {
          store.put({ ...existing, address, t: Date.now() });
        } else {
          store.put({ id: `${hash}:${lang}`, hash, lang, address, t: Date.now() });
        }
        db.close();
      };
      getReq.onerror = () => { db.close(); };
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
  return cacheKey(geohashEncode(lat, lng, GEOHASH_PRECISION));
}

function makeRawHash(lat: number, lng: number): string {
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

interface QueueItem {
  hash: string;
  rawHash: string;
  lat: number;
  lng: number;
  priority: number; // lower = higher priority (0 = selected vehicle, 1 = visible, 2 = background)
  resolve: (addr: string | null) => void;
  id: number;
}

const queue: QueueItem[] = [];
const inflight = new Map<string, Promise<string | null>>();
let lastRequestAt = 0;
let draining = false;
let queueIdCounter = 0;
const seenGeohashes = new Set<string>();

/** Insert item into queue sorted by priority (lower first), then FIFO for same priority */
function enqueue(item: QueueItem): void {
  // Remove duplicate geohash with same or lower priority (keep the higher priority one)
  const dupIdx = queue.findIndex((q) => q.hash === item.hash);
  if (dupIdx !== -1) {
    const dup = queue[dupIdx];
    if (dup && dup.priority <= item.priority) {
      // Existing has same or higher priority — skip the new one
      item.resolve(null); // resolve immediately with null
      return;
    }
    // New has higher priority — remove existing
    queue.splice(dupIdx, 1);
    dup.resolve(null);
  }
  // Insert sorted by priority
  const idx = queue.findIndex((q) => q.priority > item.priority);
  if (idx === -1) queue.push(item);
  else queue.splice(idx, 0, item);
}

async function runRequest(lat: number, lng: number): Promise<string | null> {
  const now = Date.now();
  const wait = Math.max(0, lastRequestAt + MIN_INTERVAL_MS - now);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const url = `${ENDPOINT}?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=${langParam()}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'KevinGPS/1.0' },
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status} ${res.statusText}`);
  lastRequestAt = Date.now();
  return formatAddress(await res.json());
}

/** Batch write multiple (rawHash, address) pairs to IndexedDB in a single transaction */
async function dbSetBatch(entries: { rawHash: string; address: string }[]): Promise<void> {
  if (!entries.length) return;
  try {
    const db = await openDb();
    if (!db) return;
    const lang = langParam();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const { rawHash, address } of entries) {
        const id = `${rawHash}:${lang}`;
        // Try to find existing first
        const index = store.index('hash_lang');
        const getReq = index.get([rawHash, lang]);
        getReq.onsuccess = () => {
          const existing = getReq.result;
          if (existing) {
            store.put({ ...existing, address, t: Date.now() });
          } else {
            store.put({ id, hash: rawHash, lang, address, t: Date.now() });
          }
        };
      }
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    });
  } catch { /* best effort */ }
}

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  const pendingDbWrites: { rawHash: string; address: string }[] = [];
  while (queue.length) {
    const item = queue.shift()!;
    // Skip if already cached (stale request — vehicle moved to a new location)
    const cached = hotGet(item.hash);
    if (cached !== undefined) {
      item.resolve(cached);
      inflight.delete(item.hash);
      continue;
    }
    try {
      const address = await runRequest(item.lat, item.lng);
      if (address) {
        hotSet(item.hash, address);
        notify(item.hash, address);
        pendingDbWrites.push({ rawHash: item.rawHash, address });
      }
      item.resolve(address);
    } catch (e) {
      console.warn('[geocoder] Nominatim failed:', (e as Error)?.message || e);
      item.resolve(null);
    }
    inflight.delete(item.hash);
  }
  // Flush all IndexedDB writes in a single transaction
  if (pendingDbWrites.length) {
    dbSetBatch(pendingDbWrites).catch(() => {});
  }
  draining = false;
}

/** Schedule drain on next microtask, debounced */
let drainTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleDrain(): void {
  if (!drainTimer) {
    drainTimer = setTimeout(() => {
      drainTimer = null;
      drain();
    }, 0);
  }
}

let preloaded = false;

async function preloadFromDb(): Promise<void> {
  if (preloaded) return;
  preloaded = true;
  const lang = langParam();
  try {
    const db = await openDb();
    if (!db) return;
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const allReq = store.getAll();
    allReq.onsuccess = () => {
      const rows = (allReq.result || []) as CacheRecord[];
      rows.forEach((r) => {
        if (r?.hash && r?.address && r.lang === lang) hotSet(cacheKey(r.hash), r.address);
      });
      db.close();
    };
    allReq.onerror = () => { db.close(); };
  } catch { /* ignore */ }
}

if (typeof indexedDB !== 'undefined') preloadFromDb();

export function lookupCached(lat: number, lng: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const key = makeKey(lat, lng);
  if (!key) return null;
  return hotGet(key) || null;
}

/**
 * Reverse geocode with priority queue.
 * @param priority - 0=selected vehicle, 1=visible vehicles, 2=background (default)
 */
export function reverseGeocode(lat: number, lng: number, priority = 2): Promise<string | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return Promise.resolve(null);
  const rawHash = makeRawHash(lat, lng);
  const key = makeKey(lat, lng);
  if (!key || !rawHash) return Promise.resolve(null);

  const hot = hotGet(key);
  if (hot !== undefined) return Promise.resolve(hot);

  if (inflight.has(key)) return inflight.get(key)!;

  const id = ++queueIdCounter;
  const promise = new Promise<string | null>((resolve) => {
    enqueue({ hash: key, rawHash, lat, lng, priority, resolve, id });
    scheduleDrain();
  });
  inflight.set(key, promise);
  return promise;
}

export function subscribeGeocode(fn: (hash: string, address: string) => void): () => void {
  subscribers.add(fn);
  return () => { subscribers.delete(fn); };
}

export function geocodeKey(lat: number, lng: number): string {
  return makeKey(lat, lng);
}
