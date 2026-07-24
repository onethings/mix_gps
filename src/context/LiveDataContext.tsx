import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api, openSocket } from '@/lib/api';
import { toAlert, toVehicles } from '@/lib/transformers';
import { geocodeKey, lookupCached, reverseGeocode, subscribeGeocode } from '@/lib/geocoder';
import { useSession } from './SessionContext';
import type { Vehicle, TraccarDevice, TraccarPosition, TraccarEvent, Alert } from '@/types';

function shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const key of ka) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

interface LiveDataContextValue {
  vehicles: any[];
  devices: TraccarDevice[];
  devicesById: Record<number, TraccarDevice>;
  positions: Record<string, TraccarPosition>;
  events: TraccarEvent[];
  alerts: Alert[];
  connected: boolean;
  socketError: string | null;
  loading: boolean;
  error: Error | null;
  getVehicle: (id: string | undefined) => Vehicle | undefined;
  refresh: () => Promise<void>;
}

const LiveDataContext = createContext<LiveDataContextValue | null>(null);
const MAX_EVENTS = 100;

export function LiveDataProvider({ children }: { children: React.ReactNode }) {
  const { user, server } = useSession();
  const [devices, setDevices] = useState<TraccarDevice[]>([]);
  const [positions, setPositions] = useState<Record<string, TraccarPosition>>({});
  const [events, setEvents] = useState<TraccarEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [socketError, setSocketError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [geocoded, setGeocoded] = useState<Record<string, string>>({});
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return subscribeGeocode((key, address) => {
      setGeocoded((prev) => (prev[key] === address ? prev : { ...prev, [key]: address }));
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setDevices([]);
      setPositions({});
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const [deviceList, positionList] = await Promise.all([
          api.devices.list(),
          api.positions.list(),
        ]);
        if (cancelled) return;
        setDevices(Array.isArray(deviceList) ? deviceList : []);
        const byDevice = {};
        (Array.isArray(positionList) ? positionList : []).forEach((p) => {
          const id = p.deviceId;
          if (id == null) return;
          byDevice[id] = p;
          byDevice[String(id)] = p;
        });
        setPositions(byDevice);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // RAF-based batching for WebSocket frames — merge multiple frames per animation frame
  const pendingDevicesRef = useRef<Map<number, any> | null>(null);
  const pendingPositionsRef = useRef<Map<number, any> | null>(null);
  const pendingEventsRef = useRef<any[] | null>(null);
  const flushRafRef = useRef<number | null>(null);

  function flushFrameBatch() {
    flushRafRef.current = null;

    if (pendingDevicesRef.current) {
      const batch = pendingDevicesRef.current;
      pendingDevicesRef.current = null;
      setDevices((prev) => {
        let hasChanges = false;
        const map = new Map(prev.map((d) => [d.id, d]));
        batch.forEach((merged, id) => {
          const existing = map.get(id);
          map.set(id, merged);
          if (!hasChanges && existing && !shallowEqual(existing as any, merged as any)) {
            hasChanges = true;
          }
        });
        return hasChanges ? Array.from(map.values()) : prev;
      });
    }

    if (pendingPositionsRef.current) {
      const batch = pendingPositionsRef.current;
      pendingPositionsRef.current = null;
      setPositions((prev) => {
        const next = { ...prev };
        let hasChanges = false;
        batch.forEach((p, id) => {
          const existing = next[id];
          next[id] = p;
          next[String(id)] = p;
          if (!hasChanges && existing && !shallowEqual(existing as any, p as any)) {
            hasChanges = true;
          }
        });
        return hasChanges ? next : prev;
      });
    }

    if (pendingEventsRef.current) {
      const batch = pendingEventsRef.current;
      pendingEventsRef.current = null;
      setEvents((prev) => [...batch, ...prev].slice(0, MAX_EVENTS));
    }
  }

  function scheduleFlush() {
    if (flushRafRef.current === null) {
      flushRafRef.current = requestAnimationFrame(flushFrameBatch);
    }
  }

  // v4.4 沒有 WebSocket 支援 → 用輪詢，避免 Basic Auth 彈窗
  const serverVersion = server?.version;
  const useWebSocket = serverVersion ? Number(serverVersion.split('.')[0] || 0) >= 5 : true;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!user) return undefined;

    if (!useWebSocket) {
      setConnected(false);
      const poll = async () => {
        try {
          const [deviceList, positionList] = await Promise.all([
            api.devices.list(),
            api.positions.list(),
          ]);
          setDevices(Array.isArray(deviceList) ? deviceList : []);
          const byDevice = {};
          (Array.isArray(positionList) ? positionList : []).forEach((p) => {
            const id = p.deviceId;
            if (id == null) return;
            byDevice[id] = p;
            byDevice[String(id)] = p;
          });
          setPositions(byDevice);
        } catch { /* ignore polling errors */ }
      };
      poll();
      const interval = setInterval(poll, 15000);
      return () => clearInterval(interval);
    }

    const connect = () => {
      const socket = openSocket((frame: any) => {
        // Accumulate into pending refs — React state only updates once per RAF
        if (Array.isArray(frame.devices)) {
          if (!pendingDevicesRef.current) pendingDevicesRef.current = new Map();
          frame.devices.forEach((d) => {
            const existing = pendingDevicesRef.current!.get(d.id);
            pendingDevicesRef.current!.set(d.id, { ...existing, ...d });
          });
          scheduleFlush();
        }
        if (Array.isArray(frame.positions)) {
          if (!pendingPositionsRef.current) pendingPositionsRef.current = new Map();
          frame.positions.forEach((p) => {
            const id = p.deviceId;
            if (id == null) return;
            pendingPositionsRef.current!.set(id, p);
          });
          scheduleFlush();
        }
        if (Array.isArray(frame.events)) {
          if (!pendingEventsRef.current) pendingEventsRef.current = [];
          pendingEventsRef.current.push(...frame.events);
          scheduleFlush();
        }
      });

      socket.addEventListener('open', () => {
        setConnected(true);
        setSocketError(null);
      });
      socket.addEventListener('close', () => {
        setConnected(false);
        setSocketError('Connection closed — reconnecting…');
        reconnectRef.current = setTimeout(connect, 15000);
      });
      socket.addEventListener('error', () => {
        setSocketError('Live connection error');
        socket.close();
      });
      socketRef.current = socket;
    };

    connect();

    return () => {
      if (flushRafRef.current !== null) cancelAnimationFrame(flushRafRef.current);
      flushRafRef.current = null;
      pendingDevicesRef.current = null;
      pendingPositionsRef.current = null;
      pendingEventsRef.current = null;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      socketRef.current?.close();
      setConnected(false);
    };
  }, [user, useWebSocket]);

  const baseVehicles = useMemo(() => toVehicles(devices, positions), [devices, positions]);

  const vehicles = useMemo(
    () =>
      baseVehicles.map((v) => {
        if (v.address) return v;
        const key = geocodeKey(v.lat, v.lng);
        if (!key) return v;
        const cached = geocoded[key] ?? lookupCached(v.lat, v.lng);
        return cached ? { ...v, address: cached } : v;
      }),
    [baseVehicles, geocoded],
  );

  useEffect(() => {
    baseVehicles.forEach((v) => {
      if (v.address) return;
      if (!Number.isFinite(v.lat) || !Number.isFinite(v.lng)) return;
      if (v.lat === 0 && v.lng === 0) return;
      reverseGeocode(v.lat, v.lng);
    });
  }, [baseVehicles]);

  const devicesById = useMemo(() => {
    const map = {};
    devices.forEach((d) => {
      map[d.id] = d;
    });
    return map;
  }, [devices]);

  const alerts = useMemo(
    () => events.map((e) => toAlert(e, devicesById[e.deviceId]?.name)),
    [events, devicesById],
  );

  const getVehicle = useCallback(
    (id: string | undefined): Vehicle | undefined => vehicles.find((v) => v.id === Number(id) || String(v.id) === String(id)) as Vehicle | undefined,
    [vehicles],
  );

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [deviceList, positionList] = await Promise.all([
        api.devices.list(),
        api.positions.list(),
      ]);
      setDevices(Array.isArray(deviceList) ? deviceList : []);
      const byDevice = {};
      (Array.isArray(positionList) ? positionList : []).forEach((p) => {
        const id = p.deviceId;
        if (id == null) return;
        byDevice[id] = p;
        byDevice[String(id)] = p;
      });
      setPositions(byDevice);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  return (
    <LiveDataContext.Provider
      value={{
        vehicles,
        devices,
        devicesById,
        positions,
        events,
        alerts,
        connected,
        socketError,
        loading,
        error,
        getVehicle,
        refresh,
      }}
    >
      {children}
    </LiveDataContext.Provider>
  );
}

export const useLiveData = () => {
  const ctx = useContext(LiveDataContext);
  if (!ctx) throw new Error('useLiveData must be used inside LiveDataProvider');
  return ctx;
};
