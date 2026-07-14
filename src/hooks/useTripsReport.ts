import { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '@/lib/api';
import { toTrip } from '@/lib/transformers';
import type { Trip, TraccarReportTrip } from '@/types';

interface UseTripsReportOptions {
  deviceIds: number[];
  fromIso: string;
  toIso: string;
  nameByDeviceId?: Record<number, string>;
}

export function useTripsReport({ deviceIds, fromIso, toIso, nameByDeviceId }: UseTripsReportOptions) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const namesRef = useRef(nameByDeviceId);
  namesRef.current = nameByDeviceId;

  const key = useMemo(() => `${fromIso}|${toIso}|${(deviceIds || []).join(',')}`, [fromIso, toIso, deviceIds]);

  useEffect(() => {
    if (!fromIso || !toIso || !deviceIds?.length) {
      setTrips([]); setLoading(false); return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const raw = await api.reports.trips({ from: fromIso, to: toIso, deviceId: deviceIds }) as TraccarReportTrip[];
        if (cancelled) return;
        const nm = namesRef.current || {};
        const list = (raw || []).map((t) => toTrip(t, nm[t.deviceId] || `Device ${t.deviceId}`));
        list.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
        setTrips(list);
        setError(null);
      } catch (e) {
        if (!cancelled) { setError(e as Error); setTrips([]); }
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [key]);

  return { trips, loading, error };
}
