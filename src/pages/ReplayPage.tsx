import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ChevronLeft, ChevronRight, Download, Map as MapIcon, Pause, Play, Satellite, SkipBack, SkipForward, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import { useLiveData } from '@/context/LiveDataContext';
import { useT } from '@/lib/i18n';
import { createCarMarkerElement, updateCarMarkerElement } from '@/components/tracking/carMarkerSvg';

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
const ROUTE_CACHE_TTL = 14 * 24 * 60 * 60 * 1000;

function getCache(key: string, ttl: number) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > ttl) { localStorage.removeItem(key); return null; }
    return data;
  } catch { return null; }
}

function setCache(key: string, data: unknown) {
  try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch { /* ignore */ }
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function dayKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function knotsToMph(k: unknown) { return Math.round((Number(k) || 0) * 1.15078); }

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

function DataPanel({ route, stops, cursor, deviceName, selectedDate }: {
  route: RoutePoint[]; stops: StopPoint[]; cursor: number; deviceName: string; selectedDate: string;
}) {
  const [tab, setTab] = useState<'route' | 'stops'>('route');

  const routeHeaders = ['#', 'Time', 'Speed (mph)', 'Course (°)', 'Latitude', 'Longitude', 'Address'];
  const routeRows = useMemo(() =>
    (route || []).map((p, i) => [
      i + 1,
      p.fixTime || p.deviceTime || '',
      knotsToMph(p.speed),
      p.course != null ? Math.round(Number(p.course)) : '',
      p.latitude != null ? Number(p.latitude).toFixed(6) : '',
      p.longitude != null ? Number(p.longitude).toFixed(6) : '',
      p.address || '',
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
      s.address || '',
    ]),
  [stops]);

  const handleDownloadRoute = () => {
    downloadCSV(`${deviceName}_${selectedDate}_route.csv`, routeHeaders, routeRows);
  };
  const handleDownloadStops = () => {
    downloadCSV(`${deviceName}_${selectedDate}_stops.csv`, stopHeaders, stopRows);
  };
  const handleDownloadAll = () => {
    const allHeaders = ['Type', '#', 'Time/Start', 'End Time', 'Speed (mph)', 'Course (°)', 'Duration', 'Latitude', 'Longitude', 'Address'];
    const allRows = [
      ...(route || []).map((p, i) => [
        'Route', i + 1,
        p.fixTime || p.deviceTime || '', '', knotsToMph(p.speed),
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
            Route · {route.length} pts
          </button>
          <button type="button" onClick={() => setTab('stops')}
            className={cn('rounded px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors',
              tab === 'stops' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-accent/60')}>
            Stops · {stops.length}
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={handleDownloadAll}
            className="flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-emerald-700 transition-colors shadow-sm">
            <Download className="h-3 w-3" /> CSV
          </button>
          <button type="button" onClick={tab === 'route' ? handleDownloadRoute : handleDownloadStops}
            className="flex items-center gap-1 rounded border border-input bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <Download className="h-3 w-3" /> {tab === 'route' ? 'Route' : 'Stops'}
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {tab === 'route' && (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
              <tr className="border-b border-border">
                {['#', 'Time', 'MPH', '°', 'Latitude', 'Longitude', 'Address'].map(h => (
                  <th key={h} className="whitespace-nowrap px-2 py-1.5 text-left text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {route.map((p, i) => (
                <tr key={i} className={cn('border-b border-border/40 transition-colors', i === cursor ? 'bg-primary/10 ring-1 ring-inset ring-primary/30' : 'hover:bg-accent/40')}>
                  <td className={cn('px-2 py-1 font-mono text-[10px]', i === cursor ? 'text-primary font-bold' : 'text-muted-foreground')}>{i + 1}</td>
                  <td className="whitespace-nowrap px-2 py-1 font-mono text-[10px] text-foreground">{formatTime(p.fixTime || p.deviceTime)}</td>
                  <td className="px-2 py-1 font-mono text-[10px] tabular-nums text-foreground">{knotsToMph(p.speed)}</td>
                  <td className="px-2 py-1 font-mono text-[10px] text-muted-foreground">{p.course != null ? `${Math.round(Number(p.course))}°` : '—'}</td>
                  <td className="px-2 py-1 font-mono text-[10px] text-muted-foreground">{Number(p.latitude).toFixed(4)}</td>
                  <td className="px-2 py-1 font-mono text-[10px] text-muted-foreground">{Number(p.longitude).toFixed(4)}</td>
                  <td className="max-w-[200px] truncate px-2 py-1 text-[10px] text-muted-foreground" title={p.address}>{p.address || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === 'stops' && (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
              <tr className="border-b border-border">
                {['#', 'Start', 'End', 'Duration', 'Latitude', 'Longitude', 'Address'].map(h => (
                  <th key={h} className="whitespace-nowrap px-2 py-1.5 text-left text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stops.map((s, i) => (
                <tr key={i} className="border-b border-border/40 hover:bg-accent/40 transition-colors">
                  <td className="px-2 py-1 font-mono text-[10px] text-muted-foreground">{i + 1}</td>
                  <td className="whitespace-nowrap px-2 py-1 font-mono text-[10px] text-foreground">{formatTime(s.startTime)}</td>
                  <td className="whitespace-nowrap px-2 py-1 font-mono text-[10px] text-foreground">{formatTime(s.endTime)}</td>
                  <td className="px-2 py-1 font-mono text-[10px] tabular-nums text-amber-600 font-medium">{formatStoppedDuration(new Date(s.startTime || '').getTime(), new Date(s.endTime || '').getTime())}</td>
                  <td className="px-2 py-1 font-mono text-[10px] text-muted-foreground">{Number(s.latitude).toFixed(4)}</td>
                  <td className="px-2 py-1 font-mono text-[10px] text-muted-foreground">{Number(s.longitude).toFixed(4)}</td>
                  <td className="max-w-[200px] truncate px-2 py-1 text-[10px] text-muted-foreground" title={s.address}>{s.address || '—'}</td>
                </tr>
              ))}
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
              {knotsToMph(route.reduce((s, p) => s + (Number(p.speed) || 0), 0) / route.length)} mph
            </span></span>
            <span>Max <span className="font-semibold text-foreground tabular-nums">
              {knotsToMph(Math.max(...route.map(p => Number(p.speed) || 0)))} mph
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
  const [searchParams, setSearchParams] = useSearchParams();
  const deviceIdFromUrl = searchParams.get('deviceId') || '';

  const [deviceId, setDeviceId] = useState(deviceIdFromUrl);
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

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const markerElRef = useRef<HTMLDivElement | null>(null);
  const stopMarkersRef = useRef<maplibregl.Marker[]>([]);
  const startEndMarkersRef = useRef<maplibregl.Marker[]>([]);
  const rafRef = useRef(0);
  const lastTsRef = useRef(0);
  const appliedBasemapRef = useRef(basemap);

  // Sync URL param -> deviceId
  useEffect(() => {
    if (deviceIdFromUrl && deviceIdFromUrl !== deviceId) setDeviceId(deviceIdFromUrl);
  }, [deviceIdFromUrl]);

  useEffect(() => {
    if (deviceId) setSearchParams({ deviceId }, { replace: true });
  }, [deviceId, setSearchParams]);

  // Default to first vehicle
  useEffect(() => {
    if (!vehicles.length || deviceId) return;
    setDeviceId(String(vehicles[0]!.id));
  }, [vehicles, deviceId]);

  // Fetch daily km
  useEffect(() => {
    if (!deviceId) return;
    const mk = monthKey(calYear, calMonth);
    const isCurrentMonth = calYear === new Date().getFullYear() && calMonth === new Date().getMonth();
    const ttl = isCurrentMonth ? 5 * 60 * 1000 : KM_CACHE_TTL;
    const cached = getCache(`replay-km-${deviceId}-${mk}`, ttl);
    if (cached) { setDailyKm(cached as Record<string, number>); return; }
    let cancelled = false;
    setLoadingKm(true); setKmError(null);
    const from = new Date(calYear, calMonth, 1).toISOString();
    const to = new Date(calYear, calMonth + 1, 0, 23, 59, 59).toISOString();
    (async () => {
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
        setCache(`replay-km-${deviceId}-${mk}`, map);
      } catch (e) { if (!cancelled) setKmError((e as Error).message || 'Summary API failed'); }
      finally { if (!cancelled) setLoadingKm(false); }
    })();
    return () => { cancelled = true; };
  }, [deviceId, calYear, calMonth]);

  // Fetch route + stops when selectedDate changes
  useEffect(() => {
    if (!deviceId || !selectedDate) { setRoute([]); setStops([]); return; }
    const rk = `replay-route-${deviceId}-${selectedDate}`;
    const cached = getCache(rk, ROUTE_CACHE_TTL);
    if (cached) { setRoute(cached as RoutePoint[]); setCursor(0); setPlaying(false); return; }
    let cancelled = false;
    setLoadingRoute(true); setError(null); setRoute([]); setStops([]); setCursor(0); setPlaying(false);
    const from = `${selectedDate}T00:00:00Z`;
    const to = `${selectedDate}T23:59:59Z`;
    (async () => {
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
        setRoute(clean.length > 0 ? clean : routeArr.filter(
          (p) => Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude))
        ));
        setStops(((stopRows as StopPoint[]) || []).filter(
          (s) => Number.isFinite(Number(s.latitude)) && Number.isFinite(Number(s.longitude)) && !(Number(s.latitude) === 0 && Number(s.longitude) === 0)
        ));
        setCache(rk, clean);
      } catch (e) {
        if (!cancelled) setError((e as Error).message || t('failedToLoadRoute'));
      } finally { if (!cancelled) setLoadingRoute(false); }
    })();
    return () => { cancelled = true; };
  }, [deviceId, selectedDate, t]);

  const deviceName = useMemo(() => vehicles.find((v) => String(v.id) === String(deviceId))?.name || 'Device', [vehicles, deviceId]);

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
    map.on('load', () => { mapRef.current = map; });
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
    if (map.getSource('route')) map.removeSource('route');
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
    map.fitBounds(bounds, { padding: 60, duration: 500 });
  }

  // Switch basemap
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (appliedBasemapRef.current === basemap) return;
    appliedBasemapRef.current = basemap;
    const prevRoute = route;
    const redraw = () => { if (prevRoute.length > 0 || stops.length > 0) drawRoute(prevRoute); };
    map.once('style.load', redraw);
    map.setStyle(styleForBasemap(basemap));
    setTimeout(redraw, 500);
  }, [basemap, route, stops]);

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
      const margin = 120;
      const pt = map.project([lng, lat]);
      const w = canvas.width;
      const h = canvas.height;
      if (pt.x < margin || pt.x > w - margin || pt.y < margin || pt.y > h - margin) {
        map.panTo([lng, lat], { duration: 300 });
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
  const today = new Date();
  const dim = daysInMonth(calYear, calMonth);
  const firstDay = new Date(calYear, calMonth, 1).getDay();

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
    setSelectedDate((prev) => prev === d ? null : d);
  }, [calYear, calMonth]);

  const loading = loadingKm || loadingRoute;

  return (
    <div className="fixed inset-0 flex flex-col pointer-events-none">
      <div className="flex flex-1 pt-14">
        <div className="hidden lg:block w-60 shrink-0" />
        <div ref={mapContainerRef} className="flex-1 pointer-events-auto" />
      </div>

      {/* Top-left overlay */}
      <div className="absolute left-3 top-16 lg:left-64 z-20 flex flex-col gap-2 pointer-events-auto">
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card/90 px-3 py-2 shadow-lg backdrop-blur-sm">
          <span className="text-sm font-semibold text-foreground shrink-0">{t('replayTitle')}</span>
          <span className="h-4 w-px bg-border" />
          <label className="flex items-center gap-2 text-xs font-medium">
            <span className="text-muted-foreground shrink-0">{t('device')}</span>
            <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)}
              className="h-7 rounded border border-input bg-background px-2 text-xs outline-none">
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </label>
        </div>

        {/* Calendar */}
        <div className="w-[280px] rounded-lg border border-border bg-card/90 p-3 shadow-lg backdrop-blur-sm">
          <div className="mb-1.5 flex items-center justify-between">
            <button type="button" onClick={goPrevMonth} className="rounded p-1 hover:bg-accent">
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-xs font-semibold">
              {new Date(calYear, calMonth).toLocaleString('default', { month: 'short', year: 'numeric' })}
            </span>
            <button type="button" onClick={goNextMonth} className="rounded p-1 hover:bg-accent"
              disabled={calYear === today.getFullYear() && calMonth === today.getMonth()}>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-px text-center text-[11px] font-medium text-muted-foreground">
            {['Su','Mo','Tu','We','Th','Fr','Sa'].map((d) => <div key={d} className="py-0.5">{d}</div>)}
          </div>
          <div className="mt-px grid grid-cols-7 gap-px">
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: dim }, (_, i) => {
              const day = i + 1;
              const dk = dayKey(calYear, calMonth, day);
              const km = dailyKm[dk];
              const isToday = calYear === today.getFullYear() && calMonth === today.getMonth() && day === today.getDate();
              const isSelected = selectedDate === dk;
              const hasData = km != null;
              return (
                <button key={day} type="button" onClick={() => handleDayClick(day)}
                  disabled={!deviceId}
                  className={cn(
                    'flex flex-col items-center rounded px-1 py-1 text-[11px] leading-tight transition-colors',
                    isSelected && 'bg-primary text-primary-foreground',
                    !isSelected && isToday && 'ring-1 ring-inset ring-primary/40',
                    !isSelected && !isToday && 'hover:bg-accent',
                    !deviceId && 'opacity-40 cursor-not-allowed',
                  )}>
                  <span className="font-medium">{day}</span>
                  {loadingKm ? <span className="text-[9px] opacity-60">…</span>
                   : hasData ? <span className="text-[9px] tabular-nums">{km}km</span>
                   : <span className="text-[9px] opacity-30">—</span>}
                </button>
              );
            })}
          </div>
          {kmError && <div className="mt-1 rounded border border-destructive/30 bg-destructive/10 px-1 py-0.5 text-[9px] text-destructive">{kmError}</div>}
        </div>
        {error && <div className="rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] text-destructive">{error}</div>}
      </div>

      {/* Basemap toggle */}
      <div className="absolute right-16 top-16 z-20 flex items-center gap-0.5 rounded-lg border border-border bg-card/95 p-0.5 shadow-md backdrop-blur pointer-events-auto">
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
      </div>

      {/* Bottom controls */}
      {selectedDate && total > 0 && (
        <>
          <div className="absolute bottom-0 left-0 right-0 lg:left-60 z-20 border-t border-border bg-card/95 px-3 py-2 shadow-lg backdrop-blur-sm pointer-events-auto"
            style={{ bottom: showData ? '316px' : '0' }}>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setPlaying(false); setCursor(0); }} disabled={!total}>
                <SkipBack className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" className="h-7 w-7 p-0" onClick={() => setPlaying((p) => !p)} disabled={!total || cursor >= total - 1}>
                {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setPlaying(false); setCursor(total ? total - 1 : 0); }} disabled={!total}>
                <SkipForward className="h-3.5 w-3.5" />
              </Button>
              <div className="flex items-center gap-0.5 rounded border border-input bg-background p-0.5">
                {SPEEDS.map((s) => (
                  <button key={s} type="button" onClick={() => setSpeed(s)}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${speed === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                    {s}×
                  </button>
                ))}
              </div>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {total ? `${cursor + 1} / ${total}` : '—'}
              </span>
              <span className="text-[11px] text-muted-foreground ml-auto">{selectedDate}</span>
              <Button size="sm" variant={showData ? 'default' : 'outline'} className="h-7 gap-1 px-2 text-[10px] font-semibold"
                onClick={() => setShowData((v) => !v)}>
                <Table2 className="h-3 w-3" /> Data
              </Button>
            </div>

            <input type="range" min={0} max={Math.max(0, total - 1)} value={cursor}
              onChange={(e) => { setPlaying(false); setCursor(Number(e.target.value)); }}
              disabled={!total} className="mt-1 h-1 w-full accent-primary" />

            {current && (
              <div className="mt-1 flex gap-3 text-[10px] text-muted-foreground">
                <span><span className="uppercase">{t('time')}</span> <span className="text-foreground">{formatDate(current.fixTime || current.deviceTime)}</span></span>
                <span><span className="uppercase">{t('speed')}</span> <span className="text-foreground tabular-nums">{Math.round((Number(current.speed) || 0) * 1.15078)} {t('unitMph')}</span></span>
                <span className="hidden sm:inline"><span className="uppercase">Coords</span> <span className="font-mono text-foreground">{Number(current.latitude).toFixed(4)},{Number(current.longitude).toFixed(4)}</span></span>
                <span className="hidden lg:inline"><span className="uppercase">{t('address')}</span> <span className="line-clamp-1 text-foreground">{current.address || '—'}</span></span>
              </div>
            )}
          </div>

          {showData && (
            <div className="absolute bottom-0 left-0 right-0 lg:left-60 z-10 border-t border-border bg-card shadow-lg pointer-events-auto"
              style={{ height: '316px' }}>
              <DataPanel route={route} stops={stops} cursor={cursor} deviceName={deviceName} selectedDate={selectedDate} />
            </div>
          )}
        </>
      )}

      {selectedDate && total === 0 && !loadingRoute && stops.length === 0 && (
        <div className="absolute inset-0 top-14 lg:left-60 z-20 flex items-center justify-center pointer-events-none">
          <div className="rounded-lg border border-border bg-card/80 px-4 py-2 shadow-lg backdrop-blur-sm">
            <p className="text-xs text-muted-foreground">{t('noPositionsInRange')}</p>
          </div>
        </div>
      )}
      {selectedDate && total === 0 && stops.length > 0 && (
        <div className="absolute bottom-0 left-0 right-0 lg:left-60 z-20 border-t border-border bg-card shadow-lg pointer-events-auto" style={{ height: '316px' }}>
          <DataPanel route={route} stops={stops} cursor={cursor} deviceName={deviceName} selectedDate={selectedDate} />
        </div>
      )}
    </div>
  );
}
