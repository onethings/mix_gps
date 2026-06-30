import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { Map as MapIcon, Satellite, Crosshair, Shield, ShieldOff, Ruler } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import FleetMapLibre from '@/components/tracking/FleetMapLibre';
import type { Vehicle, TraccarGeofence } from '@/types';

function validLatLng(lat: number | null | undefined, lng: number | null | undefined): boolean {
  if (lat == null || lng == null) return false;
  const la = Number(lat), ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
  if (la === 0 && ln === 0) return false;
  return la >= -90 && la <= 90 && ln >= -180 && ln <= 180;
}

const STATUS_COLORS: Record<string, string> = {
  moving: 'bg-blue-600', idle: 'bg-amber-600', stopped: 'bg-slate-500',
  offline: 'bg-slate-600', alert: 'bg-red-600',
};

interface MapViewProps {
  vehicles: Vehicle[];
  selectedId: number | null;
  onSelect: (v: Vehicle | null) => void;
}

export default function MapView({ vehicles, selectedId, onSelect }: MapViewProps) {
  const [basemap, setBasemap] = useState('road');
  const [showGeofences, setShowGeofences] = useState(false);
  const [geofences, setGeofences] = useState<TraccarGeofence[]>([]);
  const [geofencesLoaded, setGeofencesLoaded] = useState(false);
  const [measuring, setMeasuring] = useState(false);
  const [measureKm, setMeasureKm] = useState(0);
  const mapRef = useRef<{ fitAllVehicles: () => void; clearMeasurement: () => void; _measureTotalKm?: number }>(null);

  const noPositionCount = useMemo(() => vehicles.filter((v) => !validLatLng(v.lat, v.lng)).length, [vehicles]);
  const anyPosition = useMemo(() => vehicles.some((v) => validLatLng(v.lat, v.lng)), [vehicles]);

  const fleetStats = useMemo(() => {
    const counts: Record<string, number> = { moving: 0, idle: 0, stopped: 0, offline: 0, alert: 0 };
    vehicles.forEach((v) => { if (counts[v.status] != null) counts[v.status] += 1; });
    return { ...counts, total: vehicles.length };
  }, [vehicles]);

  useEffect(() => {
    if (!measuring) { setMeasureKm(0); return; }
    const id = setInterval(() => {
      if (mapRef.current?._measureTotalKm != null) setMeasureKm(mapRef.current._measureTotalKm);
    }, 300);
    return () => clearInterval(id);
  }, [measuring]);

  const handleToggleGeofences = useCallback(async () => {
    if (!showGeofences && !geofencesLoaded) {
      try {
        const data = await api.geofences.list() as TraccarGeofence[];
        setGeofences(Array.isArray(data) ? data.map((g, i) => ({
          ...g,
          attributes: { ...g.attributes, color: g.attributes?.color || ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16'][i % 10] as string },
        })) : []);
        setGeofencesLoaded(true);
      } catch { /* silently fail */ }
    }
    setShowGeofences((prev) => !prev);
  }, [showGeofences, geofencesLoaded]);

  const handleSelect = useCallback((id: number | null) => {
    const v = vehicles.find((x) => x.id === id);
    onSelect(v || null);
  }, [vehicles, onSelect]);

  return (
    <div className="relative h-full w-full min-h-[200px] overflow-hidden rounded-none bg-background">
      <FleetMapLibre
        ref={mapRef}
        vehicles={vehicles}
        selectedId={selectedId}
        onSelectVehicle={handleSelect}
        showControls
        showGeolocate={false}
        fitPadding={56}
        basemap={basemap}
        showGeofences={showGeofences}
        geofences={geofences}
        measuring={measuring}
        onMeasuringChange={setMeasuring}
        className="absolute inset-0"
      />

      {/* Map Controls (top-left) — grouped bar */}
      <div className="absolute left-4 top-4 z-20 flex flex-col gap-1">
        <div className="flex items-center gap-0.5 rounded-lg border border-border bg-card/95 p-0.5 shadow-md backdrop-blur">
          <button type="button" onClick={() => setBasemap('road')}
            className={cn('flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              basemap === 'road' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent')}>
            <MapIcon className="h-3.5 w-3.5" /> Map
          </button>
          <button type="button" onClick={() => setBasemap('satellite')}
            className={cn('flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              basemap === 'satellite' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent')}>
            <Satellite className="h-3.5 w-3.5" /> Satellite
          </button>
          <div className="mx-0.5 h-5 w-px bg-border" />
          <button type="button" onClick={() => mapRef.current?.fitAllVehicles()}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
            title="Fit all vehicles">
            <Crosshair className="h-3.5 w-3.5" /> All
          </button>
          <button type="button" onClick={handleToggleGeofences}
            className={cn('flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              showGeofences ? 'bg-primary/15 text-primary hover:bg-primary/20' : 'text-muted-foreground hover:bg-accent')}
            title={showGeofences ? 'Hide geofences' : 'Show geofences'}>
            {showGeofences ? <Shield className="h-3.5 w-3.5" /> : <ShieldOff className="h-3.5 w-3.5" />} Zones
          </button>
          <div className="mx-0.5 h-5 w-px bg-border" />
          <button type="button" onClick={() => { if (!measuring) setMeasureKm(0); setMeasuring((p) => !p); }}
            className={cn('flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              measuring ? 'bg-amber-500/20 text-amber-600 hover:bg-amber-500/30' : 'text-muted-foreground hover:bg-accent')}
            title={measuring ? 'Stop measuring' : 'Measure distance'}>
            <Ruler className="h-3.5 w-3.5" /> Ruler
          </button>
        </div>

        {/* Measurement info banner */}
        {measuring && (
          <div className="mt-1 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/95 px-3 py-1.5 text-xs shadow-sm backdrop-blur dark:border-amber-800 dark:bg-amber-950/80">
            <Ruler className="h-3.5 w-3.5 text-amber-600" />
            <span className="font-medium text-amber-700 dark:text-amber-300">
              {measureKm > 0 ? `${measureKm.toFixed(2)} km` : 'Click on the map to measure'}
            </span>
            <button type="button" onClick={() => { mapRef.current?.clearMeasurement?.(); setMeasureKm(0); }}
              className="ml-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-amber-600 hover:bg-amber-200/50 dark:text-amber-400 dark:hover:bg-amber-800/50">Clear</button>
          </div>
        )}
      </div>

      {/* GPS status messages */}
      {!anyPosition && vehicles.length > 0 && (
        <div className="pointer-events-none absolute left-1/2 top-16 z-10 max-w-[90%] -translate-x-1/2 rounded-md border border-border bg-card/95 px-3 py-2 text-center text-xs text-muted-foreground shadow-sm backdrop-blur">
          No GPS positions yet — markers appear when the server reports coordinates.
        </div>
      )}

      {noPositionCount > 0 && anyPosition && (
        <div className="pointer-events-none absolute left-1/2 top-16 z-10 max-w-[90%] -translate-x-1/2 rounded-md border border-border bg-card/95 px-3 py-1.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
          {noPositionCount} of {vehicles.length} device{vehicles.length === 1 ? '' : 's'} have no coordinates
        </div>
      )}

      {/* Fleet Stats + Legend Bar (bottom-left) */}
      <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex flex-col gap-2">
        <div className="flex items-center gap-3 rounded-md border border-border bg-card/90 px-3 py-2 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
          <span className="font-semibold text-foreground">{fleetStats.total}</span>
          <span>vehicles</span>
          <span className="text-border">|</span>
          {(['moving', 'idle', 'stopped', 'offline', 'alert'] as const).map((status) => {
            const count = fleetStats[status];
            if (count === 0) return null;
            return (
              <span key={status} className="flex items-center gap-1">
                <span className={cn('h-2 w-2 rounded-full', STATUS_COLORS[status])} />
                <span className="capitalize">{count}</span>
              </span>
            );
          })}
        </div>
        <div className="flex max-w-[calc(100vw-4rem)] flex-wrap items-center gap-2 rounded-md border border-border bg-card/90 px-3 py-2 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-600" /> Moving</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-600" /> Idle</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-500" /> Stopped</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-600" /> Offline</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-600" /> Alert</span>
        </div>
      </div>
    </div>
  );
}
