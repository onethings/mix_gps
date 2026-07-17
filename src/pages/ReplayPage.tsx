import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Download, Map as MapIcon, Pause, Play, Ruler, Satellite, Shield, SkipBack, SkipForward, Table2, BarChart3, Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import { useLiveData } from '@/context/LiveDataContext';
import { useT } from '@/lib/i18n';
import { createCarMarkerElement, updateCarMarkerElement } from '@/components/tracking/carMarkerSvg';
import { reverseGeocode, lookupCached, subscribeGeocode, geocodeKey } from '@/lib/geocoder';
import { wktToGeoJson } from '@/lib/geo';
import { cacheGet, cacheSet } from '@/lib/db';
import { getReplayPrefs, setReplayPrefs, getReplayGlobalPrefs, setReplayGlobalPrefs } from '@/lib/preferences';
import ReplaySidebar from '@/components/tracking/ReplaySidebar';
import ReplayBottomPanel from '@/components/tracking/ReplayBottomPanel';
import type { TraccarGeofence, TraccarReportTrip } from '@/types';

const STYLE_ROAD = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';
const STYLE_SATELLITE = {
  version: 8 as const,
  sources: {
    satellite: {
      type: 'raster' as const,
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: '<a href="https://www.esri.com/" target="_blank" rel="noreferrer">Esri</a>',
      maxzoom: 22,
    },
  },
  layers: [{ id: 'satellite', type: 'raster' as const, source: 'satellite', minzoom: 0, maxzoom: 22 }],
};

function styleForBasemap(b: string) { return b === 'satellite' ? STYLE_SATELLITE : STYLE_ROAD; }

const SPEEDS = [0.5, 1, 2, 4, 8];
const KM_CACHE_TTL = 60 * 24 * 60 * 60 * 1000;
const ROUTE_CACHE_TTL = 30 * 24 * 60 * 60 * 1000;

function monthKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function dayKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function knotsToKmh(k: unknown) { return Math.round((Number(k) || 0) * 1.852); }

function addArrowImage(map: maplibregl.Map) {
  if (map.hasImage('replay-arrow')) return;
  const canvas = document.createElement('canvas');
  canvas.width = 20;
  canvas.height = 20;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, 20, 20);
  ctx.fillStyle = '#2563eb';
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(20, 18);
  ctx.lineTo(10, 13);
  ctx.lineTo(0, 18);
  ctx.closePath();
  ctx.fill();
  try { map.addImage('replay-arrow', canvas as unknown as HTMLImageElement); } catch { /* style may not be ready */ }
}

function csvEscape(val: unknown) {
  if (val == null) return '';
  const s = String(val);
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCSV(filename: string, headers: string[], rows: unknown[][]) {
  const bom = '\uFEFF';
  const csv = bom + headers.join(',') + '\n' + rows.map(r => r.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatStoppedDuration(startMs: number, endMs: number) {
  const diff = endMs - startMs;
  if (diff <= 0) return '—';
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}m`;
}

function formatTime(isoStr: string | undefined | null) {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  } catch { return isoStr; }
}

// ─── Data Panel ──────────────────────────────────────────────────────
interface RoutePoint {
  latitude: number;
  longitude: number;
  speed?: number;
  course?: number;
  fixTime?: string;
  deviceTime?: string;
  address?: string;
}

interface StopPoint {
  latitude: number;
  longitude: number;
  startTime?: string;
  endTime?: string;
  address?: string;
}

function DataPanel({ route, stops, cursor, deviceName, selectedDate, onSeek }: {
  route: RoutePoint[]; stops: StopPoint[]; cursor: number; deviceName: string; selectedDate: string;
  onSeek?: (index: number) => void;
}) {
  const { t } = useT();
  const [tab, setTab] = useState<'route' | 'stops'>('route');
  const tableBodyRef = useRef<HTMLTableSectionElement>(null);
  const activeRowRef = useRef<HTMLTableRowElement | null>(null);

  // Auto-scroll to active row when cursor changes
  useEffect(() => {
    if (activeRowRef.current) {
      activeRowRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [cursor]);

  const routeHeaders = ['#', 'Time', 'Speed (km/h)', 'Course (°)', 'Latitude', 'Longitude', 'Address'];
  const routeRows = useMemo(() =>
    (route || []).map((p, i) => [
      i + 1,
      p.fixTime || p.deviceTime || '',
      knotsToKmh(p.speed),
      p.course != null ? Math.round(Number(p.course)) : '',
      p.latitude != null ? Number(p.latitude).toFixed(6) : '',
      p.longitude != null ? Number(p.longitude).toFixed(6) : '',
      p.address || lookupCached(Number(p.latitude), Number(p.longitude)) || '',
    ]),
  [route]);

  const stopHeaders = ['#', 'Start Time', 'End Time', 'Duration', 'Latitude', 'Longitude', 'Address'];
  const stopRows = useMemo(() =>
    (stops || []).map((s, i) => [
      i + 1,
      s.startTime || '',
      s.endTime || '',
      formatStoppedDuration(new Date(s.startTime || '').getTime(), new Date(s.endTime || '').getTime()),
      s.latitude != null ? Number(s.latitude).toFixed(6) : '',
      s.longitude != null ? Number(s.longitude).toFixed(6) : '',
      s.address || lookupCached(Number(s.latitude), Number(s.longitude)) || '',
    ]),
  [stops]);

  const handleDownloadRoute = () => {
    downloadCSV(`${deviceName}_${selectedDate}_route.csv`, routeHeaders, routeRows);
  };
  const handleDownloadStops = () => {
    downloadCSV(`${deviceName}_${selectedDate}_stops.csv`, stopHeaders, stopRows);
  };
  const handleDownloadAll = () => {
    const allHeaders = ['Type', '#', 'Time/Start', 'End Time', 'Speed (km/h)', 'Course (°)', 'Duration', 'Latitude', 'Longitude', 'Address'];
    const allRows = [
      ...(route || []).map((p, i) => [
        'Route', i + 1,
        p.fixTime || p.deviceTime || '', '', knotsToKmh(p.speed),
        p.course != null ? Math.round(Number(p.course)) : '', '',
        p.latitude != null ? Number(p.latitude).toFixed(6) : '',
        p.longitude != null ? Number(p.longitude).toFixed(6) : '',
        p.address || '',
      ]),
      ...(stops || []).map((s, i) => [
        'Stop', i + 1, s.startTime || '', s.endTime || '', '', '',
        formatStoppedDuration(new Date(s.startTime || '').getTime(), new Date(s.endTime || '').getTime()),
        s.latitude != null ? Number(s.latitude).toFixed(6) : '',
        s.longitude != null ? Number(s.longitude).toFixed(6) : '',
        s.address || '',
      ]),
    ];
    downloadCSV(`${deviceName}_${selectedDate}_all.csv`, allHeaders, allRows);
  };

  return (
    <div className="flex h-full flex-col text-[11px]">
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-1.5">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setTab('route')}
            className={cn('rounded px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors',
              tab === 'route' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-accent/60')}>
            {t('routeTab')} · {route.length} {t('pts')}
          </button>
          <button type="button" onClick={() => setTab('stops')}
            className={cn('rounded px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors',
              tab === 'stops' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-accent/60')}>
            {t('stopsTab')} · {stops.length}
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={handleDownloadAll}
            className="flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-emerald-700 transition-colors shadow-sm">
            <Download className="h-3 w-3" /> CSV
          </button>
          <button type="button" onClick={tab === 'route' ? handleDownloadRoute : handleDownloadStops}
            className="flex items-center gap-1 rounded border border-input bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <Download className="h-3 w-3" /> {tab === 'route' ? t('routeTab') : t('stopsTab')}
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {tab === 'route' && (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
              <tr className="border-b border-border">
                {[['#', '#'], ['time', 'Time'], ['kmhShort', 'KM/H'], ['°', '°'], ['latitude', 'Latitude'], ['longitude', 'Longitude'], ['address', 'Address']].map(([key, fallback]) => (
                  <th key={fallback} className="whitespace-nowrap px-2 py-1.5 text-left text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">{t(key)}</th>
                ))}
              </tr>
            </thead>
            <tbody ref={tableBodyRef}>
              {route.map((p, i) => {
                const isStop = knotsToKmh(p.speed) === 0;
                return (
                  <tr key={i} ref={i === cursor ? activeRowRef : undefined}
                    onClick={() => onSeek?.(i)}
                    className={cn(
                      'border-b border-border/40 transition-colors cursor-pointer',
                      i === cursor ? 'bg-primary/10 ring-1 ring-inset ring-primary/30' : isStop ? 'bg-amber-50/60 dark:bg-amber-950/20' : 'hover:bg-accent/40'
                    )}>
                    <td className={cn('px-2 py-1 font-mono text-[10px]', i === cursor ? 'text-primary font-bold' : 'text-muted-foreground')}>{i + 1}</td>
                    <td className="whitespace-nowrap px-2 py-1 font-mono text-[10px] text-foreground">{formatTime(p.fixTime || p.deviceTime)}</td>
                    <td className="px-2 py-1 font-mono text-[10px] tabular-nums text-foreground">{knotsToKmh(p.speed)}</td>
                    <td className="px-2 py-1 font-mono text-[10px] text-muted-foreground">{p.course != null ? `${Math.round(Number(p.course))}°` : '—'}</td>
                    <td className="px-2 py-1 font-mono text-[10px] text-muted-foreground">{Number(p.latitude).toFixed(4)}</td>
                    <td className="px-2 py-1 font-mono text-[10px] text-muted-foreground">{Number(p.longitude).toFixed(4)}</td>
                    <td className="max-w-[200px] truncate px-2 py-1 text-[10px] text-muted-foreground" title={p.address}>{p.address || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {tab === 'stops' && (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
              <tr className="border-b border-border">
                {[['#', '#'], ['start', 'Start'], ['end', 'End'], ['duration', 'Duration'], ['latitude', 'Latitude'], ['longitude', 'Longitude'], ['address', 'Address']].map(([key, fallback]) => (
                  <th key={fallback} className="whitespace-nowrap px-2 py-1.5 text-left text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">{t(key)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stops.map((s, i) => {
                const dur = formatStoppedDuration(new Date(s.startTime || '').getTime(), new Date(s.endTime || '').getTime());
                return (
                  <tr key={i} className="border-b border-border/40 bg-amber-50/50 dark:bg-amber-950/15 hover:bg-amber-100/60 dark:hover:bg-amber-950/30 transition-colors">
                    <td className="px-2 py-1 font-mono text-[10px] text-muted-foreground">{i + 1}</td>
                    <td className="whitespace-nowrap px-2 py-1 font-mono text-[10px] text-foreground">{formatTime(s.startTime)}</td>
                    <td className="whitespace-nowrap px-2 py-1 font-mono text-[10px] text-foreground">{formatTime(s.endTime)}</td>
                    <td className="px-2 py-1 font-mono text-[10px] tabular-nums text-amber-600 font-medium">
                      {dur}{dur !== '—' && <span className="ml-1 text-[9px] text-amber-500 uppercase">stop</span>}
                    </td>
                    <td className="px-2 py-1 font-mono text-[10px] text-muted-foreground">{Number(s.latitude).toFixed(4)}</td>
                    <td className="px-2 py-1 font-mono text-[10px] text-muted-foreground">{Number(s.longitude).toFixed(4)}</td>
                    <td className="max-w-[200px] truncate px-2 py-1 text-[10px] text-muted-foreground" title={s.address}>{s.address || '—'}</td>
                  </tr>
                );
              })}
              {stops.length === 0 && (
                <tr><td colSpan={7} className="px-2 py-8 text-center text-[11px] text-muted-foreground">No stops recorded for this date.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
      <div className="flex items-center gap-4 border-t border-border bg-muted/20 px-4 py-1 text-[10px] text-muted-foreground">
        <span><span className="font-semibold text-foreground">{route.length}</span> route pts</span>
        <span><span className="font-semibold text-foreground">{stops.length}</span> stops</span>
        {route.length > 0 && (
          <>
            <span>Avg <span className="font-semibold text-foreground tabular-nums">
              {knotsToKmh(route.reduce((s, p) => s + (Number(p.speed) || 0), 0) / route.length)} km/h
            </span></span>
            <span>Max <span className="font-semibold text-foreground tabular-nums">
              {knotsToKmh(Math.max(...route.map(p => Number(p.speed) || 0)))} km/h
            </span></span>
          </>
        )}
        <div className="ml-auto text-[9px] opacity-60">{deviceName} · {selectedDate}</div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────
export default function ReplayPage() {
  const { t } = useT();
  const { devices, vehicles } = useLiveData();
  const fallbackVehicleId = devices.length === 1 ? devices[0].id : null;
  const [searchParams, setSearchParams] = useSearchParams();
  const deviceIdFromUrl = searchParams.get('deviceId') || '';

  // Default to last selected vehicle from tracking when no explicit deviceId in URL
  const [deviceId, setDeviceId] = useState(deviceIdFromUrl || String(fallbackVehicleId ?? ''));
  const [basemap, setBasemap] = useState('road');
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [dailyKm, setDailyKm] = useState<Record<string, number>>({});
  const [loadingKm, setLoadingKm] = useState(false);
  const [kmError, setKmError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [route, setRoute] = useState<RoutePoint[]>([]);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [stops, setStops] = useState<StopPoint[]>([]);
  const [showData, setShowData] = useState(false);
  const [showChartPanel, setShowChartPanel] = useState(true);
  const showChartPrefedRef = useRef(false);
  const [mobileCalendarOpen, setMobileCalendarOpen] = useState(false);
  const [showGeofences, setShowGeofences] = useState(false);
  const [geofences, setGeofences] = useState<TraccarGeofence[]>([]);
  const [geofencesLoaded, setGeofencesLoaded] = useState(false);
  const [trips, setTrips] = useState<TraccarReportTrip[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const markerElRef = useRef<HTMLDivElement | null>(null);
  const stopMarkersRef = useRef<maplibregl.Marker[]>([]);
  const startEndMarkersRef = useRef<maplibregl.Marker[]>([]);
  const rafRef = useRef(0);
  const lastTsRef = useRef(0);
  const appliedBasemapRef = useRef(basemap);

  const dateFromUrl = searchParams.get('date') || '';

  // Sync URL param -> deviceId
  useEffect(() => {
    if (deviceIdFromUrl && deviceIdFromUrl !== deviceId) setDeviceId(deviceIdFromUrl);
  }, [deviceIdFromUrl]);

  // Auto-select today's date when ?date=today is in the URL (runs before restore effect)
  const autoDateRef = useRef(false);
  const autoPlayRef = useRef(false);
  useEffect(() => {
    if (dateFromUrl === 'today' && deviceId && !autoDateRef.current) {
      autoDateRef.current = true;
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      setSelectedDate(todayStr);
      // Clean up the URL param after applying it
      setSearchParams({ deviceId }, { replace: true });
    }
  }, [dateFromUrl, deviceId, setSearchParams]);

  // Auto-play when route finishes loading from "Replay Today"
  useEffect(() => {
    if (autoDateRef.current && route.length > 0 && !autoPlayRef.current) {
      autoPlayRef.current = true;
      setPlaying(true);
    }
  }, [route.length]);

  useEffect(() => {
    if (deviceId) setSearchParams({ deviceId }, { replace: true });
  }, [deviceId, setSearchParams]);

  // Restore replay state from IndexedDB + localStorage on mount
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || !deviceId) return;
    restoredRef.current = true;

    // Load UI preferences from IndexedDB first — source of truth
    // showChartPanel/showData are GLOBAL (shared across all devices)
    // basemap is per-device
    getReplayGlobalPrefs().then((global) => {
      if (global.showChartPanel !== undefined) setShowChartPanel(global.showChartPanel);
      if (global.showData !== undefined) setShowData(global.showData);
    });
    getReplayPrefs(deviceId).then((prefs) => {
      if (prefs.basemap !== undefined) setBasemap(prefs.basemap);
      showChartPrefedRef.current = true;
    });

    // Then restore ephemeral replay state from localStorage (route, date, cursor — NOT UI prefs)
    // Skip restore if we came from "Replay Today" (autoDateRef already set the date)
    if (!autoDateRef.current) {
      try {
        const raw = localStorage.getItem(`replay-state-${deviceId}`);
        if (!raw) return;
        const saved = JSON.parse(raw);
        if (saved.selectedDate) {
          setSelectedDate(saved.selectedDate);
          setCalYear(saved.calYear ?? new Date().getFullYear());
          setCalMonth(saved.calMonth ?? new Date().getMonth());
          setCursor(saved.cursor ?? 0);
          setSpeed(saved.speed ?? 1);
          // basemap/showChartPanel/showData are owned by IndexedDB — don't override from localStorage
          if (saved.route?.length) setRoute(saved.route);
          if (saved.stops?.length) setStops(saved.stops);
        }
      } catch { /* ignore */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  // Persist showChartPanel/showData immediately when toggled (global — not per-device)
  const prevChartPanelRef = useRef(showChartPanel);
  useEffect(() => {
    if (!showChartPrefedRef.current) return;
    if (prevChartPanelRef.current === showChartPanel) return;
    prevChartPanelRef.current = showChartPanel;
    setReplayGlobalPrefs({ showChartPanel, showData }).catch(() => {});
  }, [showChartPanel, showData]);

  // Persist basemap per-device
  useEffect(() => {
    if (!showChartPrefedRef.current || !deviceId) return;
    setReplayPrefs(deviceId, { basemap }).catch(() => {});
  }, [basemap, deviceId]);

  // Save replay state to localStorage on unmount (use refs to avoid stale closure)
  const saveRef = useRef({ deviceId, selectedDate, calYear, calMonth, cursor, speed, basemap, showChartPanel, showData, route, stops, showGeofences });
  useEffect(() => { saveRef.current = { deviceId, selectedDate, calYear, calMonth, cursor, speed, basemap, showChartPanel, showData, route, stops, showGeofences }; });
  useEffect(() => {
    return () => {
      const s = saveRef.current;
      try {
        if (s.deviceId && s.selectedDate) {
          localStorage.setItem(`replay-state-${s.deviceId}`, JSON.stringify(s));
        }
      } catch { /* ignore */ }
      // Also persist UI preferences to IndexedDB (outlives localStorage clears)
      setReplayGlobalPrefs({
        showChartPanel: s.showChartPanel,
        showData: s.showData,
      });
      if (s.deviceId) {
        setReplayPrefs(s.deviceId, { basemap: s.basemap });
      }
    };
  }, []);

  // Default to first vehicle
  useEffect(() => {
    if (!vehicles.length || deviceId) return;
    setDeviceId(String(vehicles[0]!.id));
  }, [vehicles, deviceId]);

  // Fetch daily km
  useEffect(() => {
    if (!deviceId) return;
    const mk = monthKey(calYear, calMonth);
    const kmKey = `replay-km-${deviceId}-${mk}`;
    const isCurrentMonth = calYear === new Date().getFullYear() && calMonth === new Date().getMonth();
    const ttl = isCurrentMonth ? 5 * 60 * 1000 : KM_CACHE_TTL;
    let cancelled = false;
    (async () => {
      const cached = await cacheGet<Record<string, number>>('mileage', kmKey);
      if (cancelled) return;
      if (cached) { setDailyKm(cached); return; }
      setLoadingKm(true); setKmError(null);
      const from = new Date(calYear, calMonth, 1).toISOString();
      const to = new Date(calYear, calMonth + 1, 0, 23, 59, 59).toISOString();
      try {
        const rows = await api.reports.summary({ from, to, deviceId: [Number(deviceId)], daily: true }) as Array<Record<string, unknown>>;
        if (cancelled) return;
        const map: Record<string, number> = {};
        (rows || []).forEach((r) => {
          if (!r.startTime) return;
          const d = String(r.startTime).slice(0, 10);
          const km = Math.max(0, Math.round((Number(r.distance) || 0) / 1000));
          map[d] = km;
        });
        setDailyKm(map);
        cacheSet('mileage', kmKey, map, ttl);
      } catch (e) { if (!cancelled) setKmError((e as Error).message || 'Summary API failed'); }
      finally { if (!cancelled) setLoadingKm(false); }
    })();
    return () => { cancelled = true; };
  }, [deviceId, calYear, calMonth]);

  // Fetch route + stops when selectedDate changes
  useEffect(() => {
    if (!deviceId || !selectedDate) { setRoute([]); setStops([]); return; }
    const cacheKey = `replay-route-${deviceId}-${selectedDate}`;
    let cancelled = false;

    // Check IndexedDB cache first
    (async () => {
      const cached = await cacheGet<{ route: RoutePoint[]; stops: StopPoint[] }>('tracks', cacheKey);
      if (cancelled) return;
      if (cached) {
        setRoute(cached.route);
        setStops(cached.stops);
        setCursor(0);
        setPlaying(false);
        return;
      }
      setLoadingRoute(true); setError(null); setRoute([]); setStops([]); setCursor(0); setPlaying(false);
      const from = `${selectedDate}T00:00:00Z`;
      const to = `${selectedDate}T23:59:59Z`;
      try {
        const [routeRows, stopRows] = await Promise.all([
          api.reports.route({ from, to, deviceId: [Number(deviceId)] }),
          api.reports.stops({ from, to, deviceId: [Number(deviceId)] }),
        ]);
        if (cancelled) return;
        const routeArr = (routeRows as RoutePoint[]) || [];
        const clean = routeArr.filter(
          (p) => Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude)) && (Number(p.speed) || 0) > 0
        );
        const finalRoute = clean.length > 0 ? clean : routeArr.filter(
          (p) => Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude))
        );
        const finalStops = ((stopRows as StopPoint[]) || []).filter(
          (s) => Number.isFinite(Number(s.latitude)) && Number.isFinite(Number(s.longitude)) && !(Number(s.latitude) === 0 && Number(s.longitude) === 0)
        );
        setRoute(finalRoute);
        setStops(finalStops);
        // Cache both route and stops in IndexedDB
        cacheSet('tracks', cacheKey, { route: finalRoute, stops: finalStops }, ROUTE_CACHE_TTL);

        // Resolve missing addresses via geocoder (cached + Nominatim)
        const allPts = [...routeArr, ...((stopRows as StopPoint[]) || [])];
        let routeUpdated = false;
        let stopsUpdated = false;
        const routeWithAddr = routeArr.map((p) => {
          if (p.address) return p;
          const lat = Number(p.latitude);
          const lng = Number(p.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return p;
          const cached = lookupCached(lat, lng);
          if (cached) { routeUpdated = true; return { ...p, address: cached }; }
          reverseGeocode(lat, lng).then((addr) => {
            if (addr) {
              setRoute((prev) => prev.map((r) =>
                Number(r.latitude) === lat && Number(r.longitude) === lng && !r.address
                  ? { ...r, address: addr } : r
              ));
            }
          });
          return p;
        });
        const stopsWithAddr = ((stopRows as StopPoint[]) || []).map((s) => {
          if (s.address) return s;
          const lat = Number(s.latitude);
          const lng = Number(s.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return s;
          const cached = lookupCached(lat, lng);
          if (cached) { stopsUpdated = true; return { ...s, address: cached }; }
          reverseGeocode(lat, lng).then((addr) => {
            if (addr) {
              setStops((prev) => prev.map((sp) =>
                Number(sp.latitude) === lat && Number(sp.longitude) === lng && !sp.address
                  ? { ...sp, address: addr } : sp
              ));
            }
          });
          return s;
        });
        if (routeUpdated) {
          setRoute(clean.length > 0
            ? routeWithAddr.filter((p) => Number(p.speed) > 0)
            : routeWithAddr);
        }
        if (stopsUpdated) setStops(stopsWithAddr);
      } catch (e) {
        if (!cancelled) setError((e as Error).message || t('failedToLoadRoute'));
      } finally { if (!cancelled) setLoadingRoute(false); }
    })();
    return () => { cancelled = true; };
  }, [deviceId, selectedDate, t]);

  const deviceName = useMemo(() => vehicles.find((v) => String(v.id) === String(deviceId))?.name || 'Device', [vehicles, deviceId]);

  // Subscribe to geocode resolutions (real-time address updates)
  useEffect(() => {
    const unsub = subscribeGeocode((hash, address) => {
      setRoute((prev) => prev.map((p) => {
        if (p.address) return p;
        const h = geocodeKey(Number(p.latitude), Number(p.longitude));
        return h === hash ? { ...p, address } : p;
      }));
      setStops((prev) => prev.map((s) => {
        if (s.address) return s;
        const h = geocodeKey(Number(s.latitude), Number(s.longitude));
        return h === hash ? { ...s, address } : s;
      }));
    });
    return unsub;
  }, []);

  // Fetch trips for selected date
  useEffect(() => {
    if (!deviceId || !selectedDate) { setTrips([]); return; }
    const from = `${selectedDate}T00:00:00Z`;
    const to = `${selectedDate}T23:59:59Z`;
    let cancelled = false;
    (async () => {
      setLoadingTrips(true);
      try {
        const rows = await api.reports.trips({ from, to, deviceId: [Number(deviceId)] }) as TraccarReportTrip[];
        if (!cancelled) setTrips(rows || []);
      } catch {
        if (!cancelled) setTrips([]);
      } finally {
        if (!cancelled) setLoadingTrips(false);
      }
    })();
    return () => { cancelled = true; };
  }, [deviceId, selectedDate]);

  const handleTripClick = useCallback((trip: TraccarReportTrip) => {
    // Navigate to the trip's start time on the route
    if (trip.startTime && route.length > 0) {
      const idx = route.findIndex((p) => {
        const pt = p.fixTime || p.deviceTime;
        return pt && new Date(pt).getTime() >= new Date(trip.startTime).getTime();
      });
      if (idx >= 0) { setCursor(idx); setPlaying(false); }
    }
  }, [route]);

  // Init map
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;
    const map = new maplibregl.Map({
      container,
      style: styleForBasemap(basemap),
      center: [96, 21],
      zoom: 5,
      scrollZoom: true,
      doubleClickZoom: true,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => {
      mapRef.current = map;
      addArrowImage(map);
    });
    const ro = new ResizeObserver(() => { map.resize(); });
    ro.observe(container);
    return () => {
      ro.disconnect();
      stopMarkersRef.current.forEach((m) => m.remove());
      stopMarkersRef.current = [];
      startEndMarkersRef.current.forEach((m) => m.remove());
      startEndMarkersRef.current = [];
      mapRef.current = null;
      map.remove();
    };
  }, []);

  function drawRoute(coordsArray: RoutePoint[]) {
    const map = mapRef.current;
    if (!map) return;
    const coords: [number, number][] = coordsArray.map((p) => [Number(p.longitude), Number(p.latitude)]);
    if (map.getLayer('route-line')) map.removeLayer('route-line');
    if (map.getLayer('route-arrows')) map.removeLayer('route-arrows');
    if (map.getSource('route')) map.removeSource('route');
    if (map.getSource('route-arrows')) map.removeSource('route-arrows');
    if (coords.length < 1) return;
    map.addSource('route', {
      type: 'geojson',
      data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} },
    });
    map.addLayer({
      id: 'route-line', type: 'line', source: 'route',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#2563eb', 'line-width': 4, 'line-opacity': 0.85 },
    });

    // Direction arrows along the route
    if (map.hasImage('replay-arrow')) {
      const arrowInterval = Math.max(1, Math.floor(coords.length / 40));
      const arrowFeatures: GeoJSON.Feature[] = [];
      for (let i = arrowInterval; i < coords.length; i += arrowInterval) {
        const prev = coords[i - 1]!;
        const curr = coords[i]!;
        const midLng = (prev[0] + curr[0]) / 2;
        const midLat = (prev[1] + curr[1]) / 2;
        const angle = (Math.atan2(curr[1] - prev[1], curr[0] - prev[0]) * 180) / Math.PI;
        arrowFeatures.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [midLng, midLat] },
          properties: { angle },
        });
      }
      if (arrowFeatures.length > 0) {
        map.addSource('route-arrows', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: arrowFeatures },
        });
        map.addLayer({
          id: 'route-arrows',
          type: 'symbol',
          source: 'route-arrows',
          layout: {
            'icon-image': 'replay-arrow',
            'icon-size': 1,
            'icon-rotate': ['get', 'angle'],
            'icon-rotation-alignment': 'map',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
          paint: { 'icon-opacity': 0.7 },
        });
      }
    }
    const firstPt = coordsArray[0];
    function replayVehicle(v: any) {
      return {
        id: Number(deviceId), name: deviceName, model: v?.model || 'Unknown', status: 'moving',
        driver: v?.driver || '—', driverId: v?.driverId || null, fuel: v?.fuel ?? null, ignition: v?.ignition ?? false,
        odometer: v?.odometer || 0, lastUpdate: v?.lastUpdate || null, currentTripId: null,
        iconType: v?.iconType || 'default', phone: v?.phone || '', contact: v?.contact || '',
        vin: v?.vin || '', plate: v?.plate || '', group: v?.group || '',
        lat: firstPt?.latitude ?? v?.lat ?? 0, lng: firstPt?.longitude ?? v?.lng ?? 0,
        course: firstPt?.course ?? v?.course ?? 0, speed: firstPt?.speed ?? v?.speed ?? 0,
        address: v?.address || null, battery: v?.battery ?? null,
        _raw: { device: v?._raw?.device || {} as any, position: v?._raw?.position || null as any },
      };
    }
    if (!markerRef.current) {
      const v = vehicles.find((d) => String(d.id) === String(deviceId));
      const el = createCarMarkerElement(replayVehicle(v) as any, false);
      markerElRef.current = el;
      markerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(coords[0]!).addTo(map);
    } else {
      markerRef.current.setLngLat(coords[0]!);
      const v = vehicles.find((d) => String(d.id) === String(deviceId));
      if (markerElRef.current) {
        updateCarMarkerElement(markerElRef.current, replayVehicle(v) as any, false);
      }
    }

    // Stop markers
    stopMarkersRef.current.forEach((m) => m.remove());
    stopMarkersRef.current = [];
    const basePath = (import.meta as any).env?.BASE_URL || '/';
    if (stops.length > 0) {
      stops.forEach((s) => {
        const lat = Number(s.latitude);
        const lng = Number(s.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        const stopEl = document.createElement('div');
        stopEl.style.cssText = 'width:28px;height:28px;cursor:pointer;';
        stopEl.innerHTML = `<img src="${basePath}markers/parking.svg" width="28" height="28" alt="" draggable="false" style="width:28px;height:28px;display:block;pointer-events:none;" />`;
        stopMarkersRef.current.push(
          new maplibregl.Marker({ element: stopEl, anchor: 'bottom' }).setLngLat([lng, lat]).addTo(map)
        );
      });
    }

    // Start/End markers
    startEndMarkersRef.current.forEach((m) => m.remove());
    startEndMarkersRef.current = [];
    if (coordsArray.length > 0) {
      const first = coordsArray[0]!;
      const last = coordsArray[coordsArray.length - 1]!;
      if (first && Number.isFinite(Number(first.latitude)) && Number.isFinite(Number(first.longitude))) {
        const startEl = document.createElement('div');
        startEl.style.cssText = 'width:32px;height:42px;cursor:pointer;';
        startEl.innerHTML = `<img src="${basePath}markers/start.svg" width="32" height="42" alt="" draggable="false" style="width:32px;height:42px;display:block;pointer-events:none;" />`;
        startEndMarkersRef.current.push(
          new maplibregl.Marker({ element: startEl, anchor: 'bottom' }).setLngLat([Number(first.longitude), Number(first.latitude)]).addTo(map)
        );
      }
      if (last && Number.isFinite(Number(last.latitude)) && Number.isFinite(Number(last.longitude))) {
        const isSame = first === last || (Number(first?.latitude) === Number(last.latitude) && Number(first?.longitude) === Number(last.longitude));
        if (!isSame) {
          const endEl = document.createElement('div');
          endEl.style.cssText = 'width:32px;height:42px;cursor:pointer;';
          endEl.innerHTML = `<img src="${basePath}markers/end.svg" width="32" height="42" alt="" draggable="false" style="width:32px;height:42px;display:block;pointer-events:none;" />`;
          startEndMarkersRef.current.push(
            new maplibregl.Marker({ element: endEl, anchor: 'bottom' }).setLngLat([Number(last.longitude), Number(last.latitude)]).addTo(map)
          );
        }
      }
    }

    const bounds = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coords[0]!, coords[0]!));
    const isMobile = window.innerWidth < 768;
    map.fitBounds(bounds, { padding: { top: 60, bottom: isMobile ? 140 : 60, left: 60, right: 60 }, duration: 500 });
  }

  // Switch basemap
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (appliedBasemapRef.current === basemap) return;
    appliedBasemapRef.current = basemap;
    const prevRoute = route;
    const redraw = () => {
      addArrowImage(map);
      if (prevRoute.length > 0 || stops.length > 0) drawRoute(prevRoute);
    };
    map.once('style.load', redraw);
    map.setStyle(styleForBasemap(basemap));
    setTimeout(redraw, 500);
  }, [basemap, route, stops, geofences, showGeofences]);

  // Sync geofences
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove existing geofence layers
    ['geofences-fill', 'geofences-line'].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    if (map.getSource('geofences')) map.removeSource('geofences');

    if (!showGeofences || !geofences.length) return;

    const GEOFENCE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4', '#ec4899'];
    const features = geofences.map((g, i) => {
      const feature = wktToGeoJson(g.area);
      if (!feature) return null;
      const attrColor = g.attributes?.color as string | undefined;
      const color = attrColor || GEOFENCE_COLORS[i % GEOFENCE_COLORS.length];
      feature.properties = { ...feature.properties, name: g.name, id: g.id, color, fill: `${color}22` };
      return feature;
    }).filter(Boolean) as GeoJSON.Feature[];

    map.addSource('geofences', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features },
    });

    map.addLayer({
      id: 'geofences-fill',
      type: 'fill',
      source: 'geofences',
      paint: { 'fill-color': ['get', 'fill'], 'fill-opacity': 0.3 },
    });

    map.addLayer({
      id: 'geofences-line',
      type: 'line',
      source: 'geofences',
      paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-opacity': 0.8 },
    });
  }, [showGeofences, geofences]);

  // Handle geofence toggle
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

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.loaded()) drawRoute(route);
    else map.once('load', () => drawRoute(route));
  }, [route, stops]);

  // Update marker position + rotation on cursor change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !markerRef.current || !route.length) return;
    const p = route[Math.min(cursor, route.length - 1)]!;
    if (!p) return;
    const lng = Number(p.longitude);
    const lat = Number(p.latitude);
    markerRef.current.setLngLat([lng, lat]);
    try {
      const canvas = map.getCanvas();
      const isMobile = window.innerWidth < 768;
      const margin = 120;
      const bottomMargin = isMobile ? 180 : 120;
      const pt = map.project([lng, lat]);
      const w = canvas.width;
      const h = canvas.height;
      if (pt.x < margin || pt.x > w - margin || pt.y < margin || pt.y > h - bottomMargin) {
        // Use easeTo with short duration + offset to avoid flashing from interrupted flyTo
        const offsetY = isMobile ? 80 : 0;
        map.easeTo({ center: [lng, lat], duration: 100, offset: [0, offsetY] });
      }
    } catch { /* ignore */ }
    const course = Number(p.course);
    if (Number.isFinite(course) && markerElRef.current) {
      const v = vehicles.find((d) => String(d.id) === String(deviceId));
      updateCarMarkerElement(markerElRef.current, {
        id: Number(deviceId), name: deviceName, model: v?.model || 'Unknown', status: 'moving',
        driver: v?.driver || '—', driverId: v?.driverId || null, fuel: v?.fuel ?? null, ignition: v?.ignition ?? false,
        odometer: v?.odometer || 0, lastUpdate: v?.lastUpdate || null, currentTripId: null,
        iconType: v?.iconType || 'default', phone: v?.phone || '', contact: v?.contact || '',
        vin: v?.vin || '', plate: v?.plate || '', group: v?.group || '',
        lat, lng,
        course, speed: p.speed || v?.speed || 0,
        address: v?.address || null, battery: v?.battery ?? null,
        _raw: { device: v?._raw?.device || {} as any, position: v?._raw?.position || null as any },
      } as any, false);
    }
  }, [cursor, route]);

  // Playback animation
  useEffect(() => {
    if (!playing) { cancelAnimationFrame(rafRef.current); return; }
    lastTsRef.current = 0;
    const tick = (ts: number) => {
      if (!lastTsRef.current) lastTsRef.current = ts;
      const dt = ts - lastTsRef.current;
      const stepMs = 120 / speed;
      if (dt >= stepMs) {
        lastTsRef.current = ts;
        setCursor((c) => {
          if (c + 1 >= route.length) { setPlaying(false); return route.length - 1; }
          return c + 1;
        });
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, speed, route.length]);

  const current = route[cursor] || null;
  const total = route.length;

  const goPrevMonth = () => {
    if (calMonth === 0) { setCalYear((y) => y - 1); setCalMonth(11); }
    else setCalMonth((m) => m - 1);
    setSelectedDate(null);
  };
  const goNextMonth = () => {
    if (calMonth === 11) { setCalYear((y) => y + 1); setCalMonth(0); }
    else setCalMonth((m) => m + 1);
    setSelectedDate(null);
  };

  const handleDayClick = useCallback((day: number) => {
    const d = dayKey(calYear, calMonth, day);
    setSelectedDate((prev) => (prev === d ? null : d));
  }, [calYear, calMonth]);

  return (
    <div className="flex h-full min-h-[640px] flex-col pb-safe-lg md:pb-0">
      <div className="flex flex-1 min-h-0">
        {/* Left Sidebar */}
        <aside className="hidden w-[320px] shrink-0 border-r border-border bg-card lg:flex lg:flex-col overflow-hidden">
          <ReplaySidebar
            vehicles={vehicles}
            deviceId={deviceId}
            onDeviceChange={setDeviceId}
            calYear={calYear}
            calMonth={calMonth}
            onPrevMonth={goPrevMonth}
            onNextMonth={goNextMonth}
            dailyKm={dailyKm}
            loadingKm={loadingKm}
            kmError={kmError}
            selectedDate={selectedDate}
            onDayClick={handleDayClick}
            trips={trips}
            loadingTrips={loadingTrips}
            onTripClick={handleTripClick}
          />
        </aside>

        {/* Map Area */}
        <div className="relative flex min-h-0 flex-1">
          <div ref={mapContainerRef} className="min-h-0 flex-1" />

          {/* Mobile: calendar button below map controls */}
          <div className="absolute left-2 top-14 z-20 md:hidden">
            {selectedDate && (
              <button type="button" onClick={() => setMobileCalendarOpen(true)}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-card/95 px-2.5 py-1.5 text-xs font-medium text-foreground shadow-md backdrop-blur transition-colors hover:bg-accent">
                <CalendarIcon className="h-3.5 w-3.5 text-primary" />
                <span>{selectedDate.slice(5)}</span>
              </button>
            )}
            {!selectedDate && (
              <button type="button" onClick={() => setMobileCalendarOpen(true)}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-card/95 px-2.5 py-1.5 text-xs font-medium text-foreground shadow-md backdrop-blur transition-colors hover:bg-accent">
                <CalendarIcon className="h-3.5 w-3.5 text-primary" />
                <span>{t('selectDate')}</span>
              </button>
            )}
          </div>

          {/* Mobile calendar date picker overlay */}
          {mobileCalendarOpen && (
            <MobileDatePicker
              calYear={calYear}
              calMonth={calMonth}
              onPrevMonth={goPrevMonth}
              onNextMonth={goNextMonth}
              dailyKm={dailyKm}
              selectedDate={selectedDate}
              onDayClick={(day) => { handleDayClick(day); setMobileCalendarOpen(false); }}
              onClose={() => setMobileCalendarOpen(false)}
            />
          )}

          {/* Map controls overlay (top-left) — top-2 on mobile when Topbar hidden, top-4 on desktop */}
          <div className="absolute left-2 top-2 z-20 flex items-center gap-0.5 rounded-lg border border-border bg-card/95 p-0.5 shadow-md backdrop-blur sm:left-4 sm:top-4">
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
            <button type="button" onClick={handleToggleGeofences}
              className={cn('flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                showGeofences ? 'bg-primary/15 text-primary hover:bg-primary/20' : 'text-muted-foreground hover:bg-accent')}
              title={showGeofences ? t('hideGeofences') : t('showGeofences')}>
              <Shield className={cn('h-3.5 w-3.5', showGeofences ? 'fill-primary/20' : '')} /> {t('zones')}
            </button>
            <div className="mx-0.5 h-5 w-px bg-border" />
            <button type="button" onClick={() => {}}
              className={cn('flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                'text-muted-foreground hover:bg-accent')}
              title={t('ruler')}>
              <Ruler className="h-3.5 w-3.5" /> {t('ruler')}
            </button>
          </div>

          {/* Error overlay */}
          {error && (
            <div className="absolute right-2 top-2 z-20 rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] text-destructive shadow-md backdrop-blur sm:right-4 sm:top-4">
              {error}
            </div>
          )}

          {/* No data overlay */}
          {selectedDate && total === 0 && !loadingRoute && stops.length === 0 && (
            <div className="absolute inset-0 z-10 flex items-center justify-center">
              <div className="rounded-lg border border-border bg-card/80 px-4 py-2 shadow-lg backdrop-blur-sm">
                <p className="text-xs text-muted-foreground">{t('noPositionsInRange')}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom controls — on mobile: absolute at bottom of map area, above nav */}
      {selectedDate && total > 0 && (
        <div className="shrink-0 border-t border-border bg-card/95 px-2 py-1.5 shadow-lg backdrop-blur-sm md:px-3 md:py-2 max-md:absolute max-md:bottom-12 max-md:left-0 max-md:right-0 max-md:z-30 max-md:border-t max-md:border-border max-md:pb-safe">
          <div className="flex items-center gap-1 md:gap-2">
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 md:h-7 md:w-7" onClick={() => { setPlaying(false); setCursor(0); }} disabled={!total}>
              <SkipBack className="h-4 w-4 md:h-3.5 md:w-3.5" />
            </Button>
            <Button size="sm" className="h-8 w-8 p-0 md:h-7 md:w-7" onClick={() => setPlaying((p) => !p)} disabled={!total || cursor >= total - 1}>
              {playing ? <Pause className="h-4 w-4 md:h-3.5 md:w-3.5" /> : <Play className="h-4 w-4 md:h-3.5 md:w-3.5" />}
            </Button>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 md:h-7 md:w-7" onClick={() => { setPlaying(false); setCursor(total ? total - 1 : 0); }} disabled={!total}>
              <SkipForward className="h-4 w-4 md:h-3.5 md:w-3.5" />
            </Button>
            {/* Speed — show full selector on desktop, current speed badge on mobile */}
            <div className="hidden md:flex items-center gap-0.5 rounded border border-input bg-background p-0.5">
              {SPEEDS.map((s) => (
                <button key={s} type="button" onClick={() => setSpeed(s)}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${speed === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                  {s}×
                </button>
              ))}
            </div>
            <span className="rounded border border-input bg-background px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground md:hidden">
              {speed}×
            </span>
            <span className="text-[10px] tabular-nums text-muted-foreground md:text-[11px]">
              {total ? `${cursor + 1}/${total}` : '—'}
            </span>
            {/* Desktop: date + chart/data toggles */}
            <span className="hidden text-[11px] text-muted-foreground md:inline ml-auto">{selectedDate}</span>
            <Button size="sm" variant={showChartPanel ? 'default' : 'outline'} className="hidden h-7 gap-1 px-2 text-[10px] font-semibold md:inline-flex"
              onClick={() => setShowChartPanel((v) => !v)}>
              <BarChart3 className="h-3 w-3" /> {t('chart')}
            </Button>
            <Button size="sm" variant={showData ? 'default' : 'outline'} className="hidden h-7 gap-1 px-2 text-[10px] font-semibold md:inline-flex"
              onClick={() => setShowData((v) => !v)}>
              <Table2 className="h-3 w-3" /> {t('data')}
            </Button>
          </div>

          {/* Range slider */}
          <input type="range" min={0} max={Math.max(0, total - 1)} value={cursor}
            onChange={(e) => { setPlaying(false); setCursor(Number(e.target.value)); }}
            disabled={!total} className="mt-1 h-1.5 w-full accent-primary md:h-1" />

          {/* Current point info — desktop only */}
          {current && (
            <div className="mt-1 hidden gap-3 text-[10px] text-muted-foreground md:flex">
              <span><span className="uppercase">{t('time')}</span> <span className="text-foreground">{formatDate(current.fixTime || current.deviceTime)}</span></span>
              <span><span className="uppercase">{t('speed')}</span> <span className="text-foreground tabular-nums">{Math.round((Number(current.speed) || 0) * 1.852)} {t('unitKmh')}</span></span>
              <span className="hidden sm:inline"><span className="uppercase">{t('coords')}</span> <span className="font-mono text-foreground">{Number(current.latitude).toFixed(4)},{Number(current.longitude).toFixed(4)}</span></span>
              <span className="hidden lg:inline"><span className="uppercase">{t('address')}</span> <span className="line-clamp-1 text-foreground">{current.address || '—'}</span></span>
            </div>
          )}
        </div>
      )}

      {/* Bottom Chart Panel — hidden on mobile */}
      {selectedDate && total > 0 && showChartPanel && (
        <div className="hidden h-[200px] shrink-0 border-t border-border md:block">
          <ReplayBottomPanel route={route} deviceName={deviceName} selectedDate={selectedDate} cursor={cursor} />
        </div>
      )}

      {/* Data Panel (route/stops table) — hidden on mobile */}
      {selectedDate && total > 0 && showData && (
        <div className="hidden h-[300px] shrink-0 border-t border-border md:block">
          <DataPanel route={route} stops={stops} cursor={cursor} deviceName={deviceName} selectedDate={selectedDate} onSeek={(i) => { setCursor(i); setPlaying(false); }} />
        </div>
      )}

      {/* Stops only (no route points) — hidden on mobile */}
      {selectedDate && total === 0 && stops.length > 0 && (
        <div className="hidden h-[300px] shrink-0 border-t border-border md:block">
          <DataPanel route={route} stops={stops} cursor={cursor} deviceName={deviceName} selectedDate={selectedDate} />
        </div>
      )}
    </div>
  );
}

/* ── Mobile date picker overlay ── */
function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function MobileDatePicker({ calYear, calMonth, onPrevMonth, onNextMonth, dailyKm, selectedDate, onDayClick, onClose }: {
  calYear: number;
  calMonth: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  dailyKm: Record<string, number>;
  selectedDate: string | null;
  onDayClick: (day: number) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const today = new Date();
  const dim = daysInMonth(calYear, calMonth);
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= dim; i++) days.push(i);

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 md:hidden" onClick={onClose}>
      <div className="mx-4 w-full max-w-xs rounded-xl border border-border bg-card p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <button type="button" onClick={onPrevMonth} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold">
            {t(MONTHS[calMonth])} {calYear}
          </span>
          <button type="button" onClick={onNextMonth} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Weekday headers */}
        <div className="mb-1 grid grid-cols-7 text-center text-[10px] font-medium uppercase text-muted-foreground">
          {['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => (
            <span key={d}>{t(d)}</span>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-0.5">
          {days.map((day, i) => {
            if (day == null) return <div key={`empty-${i}`} />;
            const dk = dayKey(calYear, calMonth, day);
            const isToday = calYear === today.getFullYear() && calMonth === today.getMonth() && day === today.getDate();
            const isSelected = dk === selectedDate;
            const km = dailyKm[dk];
            const inFuture = new Date(calYear, calMonth, day) > today;
            return (
              <button key={dk} type="button" disabled={inFuture}
                onClick={() => onDayClick(day)}
                className={cn(
                  'flex flex-col items-center rounded-lg py-1 text-xs font-medium transition-colors',
                  isSelected ? 'bg-primary text-primary-foreground' : isToday ? 'border border-primary/40 text-foreground' : 'text-muted-foreground hover:bg-accent',
                  inFuture && 'opacity-20 pointer-events-none',
                )}
              >
                <span>{day}</span>
                {km !== undefined && (
                  <span className={cn('text-[8px] leading-none', isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground/50')}>
                    {km >= 1000 ? `${(km / 1000).toFixed(0)}k` : km}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
