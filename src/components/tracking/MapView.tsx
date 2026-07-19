import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { Map as MapIcon, Satellite, Crosshair, Shield, ShieldOff, Ruler, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import FleetMapLibre, { type FleetMapLibreHandle } from '@/components/tracking/FleetMapLibre';
import type { Vehicle, TraccarGeofence } from '@/types';

interface NominatimFeature {
  place_id: number;
  display_name: string;
  bbox: [string, string, string, string];
  lat: string;
  lon: string;
}

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
  const { t } = useT();
  const [basemap, setBasemap] = useState('road');
  const [showGeofences, setShowGeofences] = useState(false);
  const [geofences, setGeofences] = useState<TraccarGeofence[]>([]);
  const [geofencesLoaded, setGeofencesLoaded] = useState(false);
  const [measuring, setMeasuring] = useState(false);
  const [measureKm, setMeasureKm] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<NominatimFeature[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<FleetMapLibreHandle>(null);

  const noPositionCount = useMemo(() => vehicles.filter((v) => !validLatLng(v.lat, v.lng)).length, [vehicles]);
  const anyPosition = useMemo(() => vehicles.some((v) => validLatLng(v.lat, v.lng)), [vehicles]);

  const fleetStats = useMemo(() => {
    const counts: Record<string, number> = { moving: 0, idle: 0, stopped: 0, offline: 0, alert: 0 };
    vehicles.forEach((v) => { if (counts[v.status] != null) counts[v.status] += 1; });
    return { ...counts, total: vehicles.length };
  }, [vehicles]);

  /* Geocoder: debounced Nominatim search */
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); setSearchLoading(false); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=geojson&addressdetails=1&limit=8`;
        const res = await fetch(url, { signal: controller.signal });
        const data = await res.json();
        setSearchResults(data.features?.map((f: any) => ({
          place_id: f.properties.place_id,
          display_name: f.properties.display_name,
          bbox: f.bbox,
          lat: String(f.geometry.coordinates[1]),
          lon: String(f.geometry.coordinates[0]),
        })) || []);
      } catch { /* AbortError is expected */ }
      finally { setSearchLoading(false); }
    }, 350);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [searchQuery]);

  /* Close search dropdown on outside click */
  useEffect(() => {
    if (!searchOpen) return;
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [searchOpen]);

  const handleSearchSelect = useCallback((feature: NominatimFeature) => {
    const [minX, minY, maxX, maxY] = feature.bbox;
    mapRef.current?.flyToBounds(
      [[parseFloat(minX), parseFloat(minY)], [parseFloat(maxX), parseFloat(maxY)]],
      { padding: 60 }
    );
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
  }, []);

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
            <MapIcon className="h-3.5 w-3.5" /> {t('mapLayer')}
          </button>
          <button type="button" onClick={() => setBasemap('satellite')}
            className={cn('flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              basemap === 'satellite' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent')}>
            <Satellite className="h-3.5 w-3.5" /> {t('satellite')}
          </button>
          <div className="mx-0.5 h-5 w-px bg-border" />
          <button type="button" onClick={() => mapRef.current?.fitAllVehicles()}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
            title={t('fitAllVehicles')}>
            <Crosshair className="h-3.5 w-3.5" /> {t('all')}
          </button>
          {/* Geocoder search */}
          <div ref={searchRef} className="relative">
            <button type="button" onClick={() => setSearchOpen((v) => !v)}
              className={cn('flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                searchOpen ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-accent')}
              title={t('sharedSearch')}>
              <Search className="h-3.5 w-3.5" />
            </button>
            {searchOpen && (
              <div className="absolute left-0 top-full mt-1 z-30 w-72 rounded-lg border bg-popover shadow-lg">
                <div className="p-2">
                  <input
                    autoFocus
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('sharedSearch')}
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs outline-none focus:border-primary"
                  />
                </div>
                <div className="max-h-60 overflow-y-auto border-t">
                  {searchLoading ? (
                    <div className="px-3 py-4 text-center text-xs text-muted-foreground">{t('loading')}…</div>
                  ) : searchResults.length > 0 ? (
                    searchResults.map((f) => (
                      <button key={f.place_id} type="button"
                        className="block w-full px-3 py-2 text-left text-xs hover:bg-accent transition-colors border-b border-border/50 last:border-0"
                        onClick={() => handleSearchSelect(f)}
                      >
                        <span className="line-clamp-2">{f.display_name}</span>
                      </button>
                    ))
                  ) : searchQuery.trim() && !searchLoading ? (
                    <div className="px-3 py-4 text-center text-xs text-muted-foreground">{t('noData')}</div>
                  ) : null}
                </div>
              </div>
            )}
          </div>
          <button type="button" onClick={handleToggleGeofences}
            className={cn('flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              showGeofences ? 'bg-primary/15 text-primary hover:bg-primary/20' : 'text-muted-foreground hover:bg-accent')}
            title={showGeofences ? t('hideGeofences') : t('showGeofences')}>
            {showGeofences ? <Shield className="h-3.5 w-3.5" /> : <ShieldOff className="h-3.5 w-3.5" />} {t('zones')}
          </button>
          <div className="mx-0.5 h-5 w-px bg-border" />
          <button type="button" onClick={() => { if (!measuring) setMeasureKm(0); setMeasuring((p) => !p); }}
            className={cn('flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
              measuring ? 'bg-amber-500/20 text-amber-600 hover:bg-amber-500/30' : 'text-muted-foreground hover:bg-accent')}
            title={measuring ? t('stopMeasuring') : t('measureDistance')}>
            <Ruler className="h-3.5 w-3.5" /> {t('ruler')}
          </button>
        </div>

        {/* Measurement info banner */}
        {measuring && (
          <div className="mt-1 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/95 px-3 py-1.5 text-xs shadow-sm backdrop-blur dark:border-amber-800 dark:bg-amber-950/80">
            <Ruler className="h-3.5 w-3.5 text-amber-600" />
            <span className="font-medium text-amber-700 dark:text-amber-300">
              {measureKm > 0 ? `${measureKm.toFixed(2)} ${t('unitKm')}` : t('clickToMeasure')}
            </span>
            <button type="button" onClick={() => { mapRef.current?.clearMeasurement?.(); setMeasureKm(0); }}
              className="ml-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-amber-600 hover:bg-amber-200/50 dark:text-amber-400 dark:hover:bg-amber-800/50">{t('clear')}</button>
          </div>
        )}
      </div>

      {/* Fleet Stats + Legend Bar + GPS warnings (bottom-left) */}
      <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex flex-col gap-1.5">
        {/* Merged legend bar */}
        <div className="flex items-center gap-2 rounded-md border border-border bg-card/90 px-3 py-2 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
          <span className="font-semibold text-foreground">{fleetStats.total}</span>
          <span>{t('vehicles')}</span>
          <span className="text-muted-foreground/30">|</span>
          {(['moving', 'idle', 'stopped', 'offline', 'alert'] as const).map((status) => {
            const count = fleetStats[status];
            if (count === 0) return null;
            return (
              <span key={status} className="flex items-center gap-1">
                <span className={cn('h-2 w-2 rounded-full', STATUS_COLORS[status])} />
                <span>{count} {t(status)}</span>
              </span>
            );
          })}
        </div>

        {/* Speed legend bar */}
        {anyPosition && (() => {
          const speeds = vehicles.filter((v) => v.speed != null).map((v) => v.speed * 1.852);
          if (!speeds.length) return null;
          const min = Math.round(Math.min(...speeds));
          const max = Math.round(Math.max(...speeds));
          if (min === max) return null;
          const gradientStops = ['#00bfff','#00ff7f','#ffff00','#ff8c00','#ff4500','#dc143c'];
          return (
            <div className="flex items-center gap-2 rounded-md border border-border bg-card/90 px-3 py-1.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
              <span className="font-medium text-foreground">{t('speed')}</span>
              <span>{min}</span>
              <div className="h-2 w-20 rounded-sm" style={{
                background: `linear-gradient(to right, ${gradientStops.join(', ')})`,
              }} />
              <span>{max} km/h</span>
            </div>
          );
        })()}

        {/* No-coordinates warning — moved here instead of blocking top controls */}
        {noPositionCount > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50/90 px-3 py-1.5 text-[11px] text-amber-700 shadow-sm backdrop-blur dark:border-amber-800 dark:bg-amber-950/80 dark:text-amber-300">
            {t('deviceNoCoords').replace('{count}', String(noPositionCount)).replace('{total}', String(vehicles.length))}
          </div>
        )}
      </div>
    </div>
  );
}
