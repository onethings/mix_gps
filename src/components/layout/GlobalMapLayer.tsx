import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Map as MapIcon, Satellite, Crosshair, Shield, ShieldOff, Ruler } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { I18nContext } from '@/lib/i18n';
import { useLiveData } from '@/context/LiveDataContext';
import { useMapContext } from '@/context/MapContext';
import FleetMapLibre from '@/components/tracking/FleetMapLibre';
import type { TraccarGeofence } from '@/types';

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

interface GlobalMapLayerProps {
  /** Show interactive map controls (basemap toggle, ruler, geofences, fleet stats) */
  showControls?: boolean;
}

export default function GlobalMapLayer({ showControls = false }: GlobalMapLayerProps) {
  const { vehicles } = useLiveData();
  const { selectedVehicleId, setSelectedVehicleId, mapHandleRef } = useMapContext();
  const i18nCtx = useContext(I18nContext);
  const t = i18nCtx?.t ?? ((key: string) => key);
  const [basemap, setBasemap] = useState('road');
  const [showGeofences, setShowGeofences] = useState(false);
  const [geofences, setGeofences] = useState<TraccarGeofence[]>([]);
  const [geofencesLoaded, setGeofencesLoaded] = useState(false);
  const [measuring, setMeasuring] = useState(false);
  const [measureKm, setMeasureKm] = useState(0);

  const noPositionCount = useMemo(() => vehicles.filter((v) => !validLatLng(v.lat, v.lng)).length, [vehicles]);

  const fleetStats = useMemo(() => {
    const counts: Record<string, number> = { moving: 0, idle: 0, stopped: 0, offline: 0, alert: 0 };
    vehicles.forEach((v) => { if (counts[v.status] != null) counts[v.status] += 1; });
    return { ...counts, total: vehicles.length };
  }, [vehicles]);

  useEffect(() => {
    if (!measuring) { setMeasureKm(0); return; }
    const id = setInterval(() => {
      if (mapHandleRef.current?._measureTotalKm != null) setMeasureKm(mapHandleRef.current._measureTotalKm);
    }, 300);
    return () => clearInterval(id);
  }, [measuring, mapHandleRef]);

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
    setSelectedVehicleId(id);
  }, [setSelectedVehicleId]);

  return (
    <div className="absolute inset-0">
      <FleetMapLibre
        ref={(handle) => { mapHandleRef.current = handle; }}
        // Only render markers on tracking page to avoid clutter on replay/settings/etc.
        vehicles={showControls ? vehicles : []}
        selectedId={showControls ? selectedVehicleId : null}
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

      {/* Map Controls (top-left) — grouped bar — only on tracking page */}
      {/* top-14 positions controls below the Topbar (h-14) so they're not hidden behind it */}
      {showControls && (
        <div className="absolute left-2 top-14 z-20 flex flex-col gap-1 sm:left-4">
          <div className="flex flex-wrap items-center gap-0.5 rounded-lg border border-border bg-card/95 p-0.5 shadow-md backdrop-blur">
            <button type="button" onClick={() => setBasemap('road')}
              className={cn('flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors sm:px-2.5',
                basemap === 'road' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent')}>
              <MapIcon className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t('mapLayer')}</span>
            </button>
            <button type="button" onClick={() => setBasemap('satellite')}
              className={cn('flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors sm:px-2.5',
                basemap === 'satellite' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent')}>
              <Satellite className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t('satellite')}</span>
            </button>
            <div className="mx-0.5 h-5 w-px bg-border" />
            <button type="button" onClick={() => mapHandleRef.current?.fitAllVehicles()}
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent sm:px-2.5"
              title={t('fitAllVehicles')}>
              <Crosshair className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t('all')}</span>
            </button>
            <button type="button" onClick={handleToggleGeofences}
              className={cn('flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors sm:px-2.5',
                showGeofences ? 'bg-primary/15 text-primary hover:bg-primary/20' : 'text-muted-foreground hover:bg-accent')}
              title={showGeofences ? t('hideGeofences') : t('showGeofences')}>
              {showGeofences ? <Shield className="h-3.5 w-3.5" /> : <ShieldOff className="h-3.5 w-3.5" />} <span className="hidden sm:inline">{t('zones')}</span>
            </button>
            <div className="mx-0.5 h-5 w-px bg-border" />
            <button type="button" onClick={() => { if (!measuring) setMeasureKm(0); setMeasuring((p) => !p); }}
              className={cn('flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors sm:px-2.5',
                measuring ? 'bg-amber-500/20 text-amber-600 hover:bg-amber-500/30' : 'text-muted-foreground hover:bg-accent')}
              title={measuring ? t('stopMeasuring') : t('measureDistance')}>
              <Ruler className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t('ruler')}</span>
            </button>
          </div>

          {/* Measurement info banner */}
          {measuring && (
            <div className="mt-1 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/95 px-3 py-1.5 text-xs shadow-sm backdrop-blur dark:border-amber-800 dark:bg-amber-950/80">
              <Ruler className="h-3.5 w-3.5 text-amber-600" />
              <span className="font-medium text-amber-700 dark:text-amber-300">
                {measureKm > 0 ? `${measureKm.toFixed(2)} ${t('unitKm')}` : t('clickToMeasure')}
              </span>
              <button type="button" onClick={() => { mapHandleRef.current?.clearMeasurement?.(); setMeasureKm(0); }}
                className="ml-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-amber-600 hover:bg-amber-200/50 dark:text-amber-400 dark:hover:bg-amber-800/50">{t('clear')}</button>
            </div>
          )}
        </div>
      )}

      {/* Fleet Stats + Legend Bar (bottom-left) — only on tracking page */}
      {showControls && (
        <div className="pointer-events-none absolute bottom-2 left-2 z-10 flex flex-col gap-1 sm:bottom-4 sm:left-4">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border border-border bg-card/90 px-2.5 py-1.5 text-[10px] text-muted-foreground shadow-sm backdrop-blur sm:px-3 sm:py-2 sm:text-[11px]">
            <span className="font-semibold text-foreground">{fleetStats.total}</span>
            <span className="hidden sm:inline">{t('vehicles')}</span>
            {(['moving', 'idle', 'stopped', 'offline', 'alert'] as const).map((status) => {
              const count = fleetStats[status];
              if (count === 0) return null;
              return (
                <span key={status} className="flex items-center gap-1">
                  <span className={cn('h-1.5 w-1.5 rounded-full sm:h-2 sm:w-2', STATUS_COLORS[status])} />
                  <span>{count}<span className="hidden sm:inline"> {t(status)}</span></span>
                </span>
              );
            })}
          </div>

          {noPositionCount > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50/90 px-2 py-1 text-[10px] text-amber-700 shadow-sm backdrop-blur dark:border-amber-800 dark:bg-amber-950/80 dark:text-amber-300 sm:px-3 sm:py-1.5 sm:text-[11px]">
              {t('deviceNoCoords').replace('{count}', String(noPositionCount)).replace('{total}', String(vehicles.length))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
