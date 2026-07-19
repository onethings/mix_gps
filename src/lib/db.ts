const DB_NAME = 'mixok-cache';
const DB_VERSION = 1;
const DEFAULT_TTL_MS = 60 * 60 * 1000;

const STORES: Record<string, { keyPath: string; ttl: number }> = {
  mileage: { keyPath: 'id', ttl: 7 * 24 * 60 * 60 * 1000 },
  tracks: { keyPath: 'id', ttl: 24 * 60 * 60 * 1000 },
  settings: { keyPath: 'id', ttl: 0 },
  devices: { keyPath: 'id', ttl: 60 * 60 * 1000 },
  geofences: { keyPath: 'id', ttl: 60 * 60 * 1000 },
  groups: { keyPath: 'id', ttl: 60 * 60 * 1000 },
  drivers: { keyPath: 'id', ttl: 60 * 60 * 1000 },
  calendars: { keyPath: 'id', ttl: 60 * 60 * 1000 },
  maintenance: { keyPath: 'id', ttl: 60 * 60 * 1000 },
  general: { keyPath: 'id', ttl: DEFAULT_TTL_MS },
  routes: { keyPath: 'id', ttl: 60 * 60 * 1000 },
  geocode: { keyPath: 'id', ttl: 30 * 24 * 60 * 60 * 1000 },
};

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDB(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = (ev.target as IDBOpenDBRequest).result;
      Object.keys(STORES).forEach((name) => {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, { keyPath: 'id' });
          store.createIndex('expiresAt', 'expiresAt', { unique: false });
        }
      });
    };
    req.onsuccess = (ev) => resolve((ev.target as IDBOpenDBRequest).result);
    req.onerror = () => resolve(null);
  });
  return dbPromise;
}

function pruneExpired(db: IDBDatabase): void {
  const now = Date.now();
  try {
    Object.keys(STORES).forEach((name) => {
      if (!db.objectStoreNames.contains(name)) return;
      const tx = db.transaction(name, 'readwrite');
      const store = tx.objectStore(name);
      const idx = store.index('expiresAt');
      const range = IDBKeyRange.upperBound(now);
      idx.openCursor(range).onsuccess = (ev) => {
        const cursor = (ev.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          store.delete(cursor.primaryKey);
          cursor.continue();
        }
      };
    });
  } catch { /* best effort */ }
}

interface CacheRecord {
  id: string;
  value: unknown;
  storedAt: number;
  expiresAt: number;
}

export async function cacheSet(storeName: string, key: string, value: unknown, ttl?: number): Promise<void> {
  const storeDef = STORES[storeName];
  if (!storeDef) throw new Error(`Unknown cache store: ${storeName}`);

  const db = await openDB();
  const ttlMs = ttl ?? storeDef.ttl;

  const record: CacheRecord = {
    id: key,
    value,
    storedAt: Date.now(),
    expiresAt: ttlMs > 0 ? Date.now() + ttlMs : Infinity,
  };

  if (db) {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(record);
      return;
    } catch { /* fall through */ }
  }

  // Fallback to localStorage
  try {
    const lsKey = `mixok:${storeName}:${key}`;
    localStorage.setItem(lsKey, JSON.stringify(record));
  } catch { /* ignore */ }
}

export async function cacheGet<T = unknown>(storeName: string, key: string): Promise<T | null> {
  const storeDef = STORES[storeName];
  if (!storeDef) throw new Error(`Unknown cache store: ${storeName}`);

  const db = await openDB();
  const now = Date.now();

  // Try IndexedDB first
  if (db) {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const val = await new Promise<T | null>((resolve) => {
        const req = tx.objectStore(storeName).get(key);
        req.onsuccess = () => {
          const record = req.result as CacheRecord | undefined;
          if (!record || (record.expiresAt < now && record.expiresAt !== Infinity)) {
            resolve(null);
          } else {
            resolve(record.value as T);
          }
        };
        req.onerror = () => resolve(null);
      });
      if (val !== null) return val;
      // Not found in IndexedDB — fall through to localStorage
    } catch { /* fall through */ }
  }

  // Fallback to localStorage
  try {
    const lsKey = `mixok:${storeName}:${key}`;
    const raw = localStorage.getItem(lsKey);
    if (!raw) return null;
    const record: CacheRecord = JSON.parse(raw);
    if (record.expiresAt < now && record.expiresAt !== Infinity) {
      localStorage.removeItem(lsKey);
      return null;
    }
    return record.value as T;
  } catch { return null; }
}

export async function cacheDelete(storeName: string, key: string): Promise<void> {
  const db = await openDB();
  if (db) {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key);
      return;
    } catch { /* fall through */ }
  }
  try {
    localStorage.removeItem(`mixok:${storeName}:${key}`);
  } catch { /* ignore */ }
}

export async function cacheClear(storeName?: string): Promise<void> {
  const db = await openDB();
  if (db) {
    try {
      const names = storeName ? [storeName] : Object.keys(STORES);
      names.forEach((name) => {
        if (db.objectStoreNames.contains(name)) {
          const tx = db.transaction(name, 'readwrite');
          tx.objectStore(name).clear();
        }
      });
      return;
    } catch { /* fall through */ }
  }
  // localStorage fallback
  try {
    const prefix = storeName ? `mixok:${storeName}:` : 'mixok:';
    Object.keys(localStorage)
      .filter((k) => k.startsWith(prefix))
      .forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}
