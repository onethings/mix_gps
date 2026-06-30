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

export function LiveDataProvider({ children }) {
  const { user } = useSession();
  const [devices, setDevices] = useState([]);
  const [positions, setPositions] = useState({});
  const [events, setEvents] = useState([]);
  const [connected, setConnected] = useState(false);
  const [socketError, setSocketError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [geocoded, setGeocoded] = useState({});
  const socketRef = useRef(null);
  const reconnectRef = useRef(null);

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

  useEffect(() => {
    if (!user) return undefined;

    const connect = () => {
      const socket = openSocket((frame) => {
        if (Array.isArray(frame.devices)) {
          setDevices((prev) => {
            const map = new Map(prev.map((d) => [d.id, d]));
            frame.devices.forEach((d) => map.set(d.id, { ...map.get(d.id), ...d }));
            return Array.from(map.values());
          });
        }
        if (Array.isArray(frame.positions)) {
          setPositions((prev) => {
            const next = { ...prev };
            frame.positions.forEach((p) => {
              const id = p.deviceId;
              if (id == null) return;
              next[id] = p;
              next[String(id)] = p;
            });
            return next;
          });
        }
        if (Array.isArray(frame.events)) {
          setEvents((prev) => [...frame.events, ...prev].slice(0, MAX_EVENTS));
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
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      socketRef.current?.close();
      setConnected(false);
    };
  }, [user]);

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
