import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Check, ChevronDown, GripHorizontal, Search } from 'lucide-react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import EmptyState from '@/components/common/EmptyState';
import { formatDate } from '@/lib/utils';
import { api } from '@/lib/api';
import { useLiveData } from '@/context/LiveDataContext';
import { useReportFilter } from '@/context/ReportFilterContext';
import { useT } from '@/lib/i18n';
import ExportButton from '@/components/reports/ExportButton';
import { downloadCsv, downloadExcel, downloadPdf } from '@/lib/exportUtils';

const STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

/* ── Period presets (like traccar-web) ── */
type PeriodKey = 'today' | 'yesterday' | 'thisWeek' | 'prevWeek' | 'thisMonth' | 'prevMonth' | 'custom';

const PERIODS: { key: PeriodKey; }[] = [
  { key: 'today' },
  { key: 'yesterday' },
  { key: 'thisWeek' },
  { key: 'prevWeek' },
  { key: 'thisMonth' },
  { key: 'prevMonth' },
  { key: 'custom' },
];

function periodToRange(key: PeriodKey): { from: Date; to: Date } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const day = now.getDay();

  switch (key) {
    case 'today':
      return { from: new Date(y, m, d), to: now };
    case 'yesterday': {
      const yest = new Date(y, m, d - 1);
      return { from: yest, to: new Date(y, m, d, 0, 0, 0, -1) };
    }
    case 'thisWeek': {
      const mon = new Date(y, m, d - (day === 0 ? 6 : day - 1));
      return { from: mon, to: now };
    }
    case 'prevWeek': {
      const prevMon = new Date(y, m, d - (day === 0 ? 6 : day - 1) - 7);
      const prevSun = new Date(prevMon);
      prevSun.setDate(prevSun.getDate() + 6);
      prevSun.setHours(23, 59, 59, 999);
      return { from: prevMon, to: prevSun };
    }
    case 'thisMonth':
      return { from: new Date(y, m, 1), to: now };
    case 'prevMonth':
      return { from: new Date(y, m - 1, 1), to: new Date(y, m, 0, 23, 59, 59, 999) };
    default:
      return { from: new Date(Date.now() - 86400000), to: now };
  }
}

/* ── Event type label ── */
function eventTypeLabel(type: string | undefined | null, t: (s: string) => string): string {
  if (!type) return '—';
  const translated = t(`eventType_${type}`);
  if (translated !== `eventType_${type}`) return translated;
  return type.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim();
}

/* ── Dropdown component ── */
function Dropdown({ label, icon: Icon, children, align = 'left' }: { label: string; icon?: any; children: React.ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div ref={ref} className="relative" onBlur={(e) => { if (!ref.current?.contains(e.relatedTarget)) setOpen(false); }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium text-foreground hover:bg-accent transition-colors whitespace-nowrap"
      >
        {Icon && <Icon className="h-4 w-4" />}
        {label}
        <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className={`absolute z-20 mt-1 min-w-[200px] rounded-lg border bg-popover p-1 shadow-md ${align === 'right' ? 'right-0' : 'left-0'}`}>
            {children}
          </div>
        </>
      )}
    </div>
  );
}

interface CombinedDeviceGroup {
  deviceId: number;
  deviceName?: string;
  route?: any[];
  positions?: any[];
  events?: CombinedEvent[];
}

interface CombinedEvent {
  id: number;
  type?: string;
  eventTime?: string;
  serverTime?: string;
  positionId?: number;
  geofenceId?: number;
  maintenanceId?: number;
  address?: string;
  attributes?: Record<string, unknown>;
}

interface CombinedRow {
  id: number;
  type?: string;
  eventTime?: string;
  serverTime?: string;
  positionId?: number;
  geofenceId?: number;
  deviceId: number;
  deviceName: string;
  address?: string;
  isFirstInGroup?: boolean;
}

/* ── Page ── */
export default function CombinedReportPage() {
  const { t } = useT();
  const { devices } = useLiveData();
  const nameByDeviceId = useMemo(() => { const m: Record<number, string> = {}; devices.forEach((d) => { m[d.id] = d.name; }); return m; }, [devices]);

  // Filters (shared via context)
  const { filters: { selectedDeviceIds, period }, setSelectedDeviceIds, setPeriod } = useReportFilter();
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showTriggered, setShowTriggered] = useState(0);
  const [deviceGroups, setDeviceGroups] = useState<CombinedDeviceGroup[]>([]);
  const [rows, setRows] = useState<CombinedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapHeight, setMapHeight] = useState(300);
  const [selectedEvent, setSelectedEvent] = useState<CombinedRow | null>(null);
  const emptyIdsRef = useRef<number[]>([]);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapInitRef = useRef(false);


  // Compute date range from period
  const dateRange = useMemo(() => {
    if (period === 'custom') {
      return {
        fromIso: customFrom ? new Date(customFrom).toISOString() : '',
        toIso: customTo ? new Date(customTo).toISOString() : '',
      };
    }
    const range = periodToRange(period);
    return { fromIso: range.from.toISOString(), toIso: range.to.toISOString() };
  }, [period, customFrom, customTo]);

  // Fetch — only when showTriggered changes
  const fetchKey = useMemo(() => {
    if (showTriggered === 0) return '';
    const ids = selectedDeviceIds.length === 0
      ? devices.map((d) => d.id)
      : selectedDeviceIds[0] === -1 ? [] : selectedDeviceIds;
    return `${dateRange.fromIso}|${dateRange.toIso}|${ids.join(',')}|${showTriggered}`;
  }, [showTriggered, dateRange, selectedDeviceIds, devices]);

  useEffect(() => {
    if (!fetchKey) return;
    const [fromIso, toIso, idsStr] = fetchKey.split('|');
    const deviceIds = idsStr.split(',').map(Number).filter(Boolean);
    if (!fromIso || !toIso || !deviceIds.length) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        // Combined API returns: [{ deviceId, route: [...], events: [...] }, ...]
        const data = await api.reports.combined({ from: fromIso, to: toIso, deviceId: deviceIds }) as CombinedDeviceGroup[];
        if (cancelled) return;
        // Flatten events from all device groups
        const groups = (data || []).map((group) => ({
          ...group,
          deviceName: nameByDeviceId[group.deviceId] || `Device ${group.deviceId}`,
        }));
        setDeviceGroups(groups);
        // Flatten events — group by device like traccar-web
        const flattened: CombinedRow[] = [];
        groups.forEach((group) => {
          (group.events || []).forEach((event, idx) => {
            flattened.push({
              id: event.id,
              type: event.type,
              eventTime: event.eventTime,
              serverTime: event.serverTime,
              positionId: event.positionId,
              geofenceId: event.geofenceId,
              deviceId: group.deviceId,
              deviceName: group.deviceName,
              isFirstInGroup: idx === 0,
            });
          });
        });
        // Sort by time descending
        flattened.sort((a, b) => ((b.eventTime || b.serverTime) || '').localeCompare((a.eventTime || a.serverTime) || ''));
        setRows(flattened);
      } catch (e) {
        if (!cancelled) setError((e as Error).message || 'Failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fetchKey, nameByDeviceId]);

  // Local search
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      (r.deviceName || '').toLowerCase().includes(needle) ||
      (r.type || '').toLowerCase().includes(needle) ||
      (r.address || '').toLowerCase().includes(needle)
    );
  }, [rows, q]);

  const handleShow = useCallback(() => {
    setShowTriggered((n) => n + 1);
  }, []);

  const allDeviceIds = useMemo(() => devices.map((d) => d.id), [devices]);
  const selectedDeviceCount = selectedDeviceIds.length === 0
    ? allDeviceIds.length
    : selectedDeviceIds[0] === -1 ? 0 : selectedDeviceIds.length;
  const selectedPeriodLabel = t(period);

  // ── Build GeoJSON features from device groups ──
  const buildFeatures = useCallback((groups: CombinedDeviceGroup[], highlightEvent?: CombinedRow | null) => {
    const features: any[] = [];
    const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1'];
    const bounds = new maplibregl.LngLatBounds();
    let hasBounds = false;

    const isValidCoord = (lng: unknown, lat: unknown): boolean =>
      Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng as number) <= 180 && Math.abs(lat as number) <= 90;

    groups.forEach((group, i) => {
      const color = colors[i % colors.length];
      const posPool = group.positions || group.route || [];
      let hasRoute = false;

      // Route line
      if (posPool.length > 1) {
        const coords: [number, number][] = posPool
          .map((p: any) => [p.longitude, p.latitude] as [number, number])
          .filter(([lng, lat]) => isValidCoord(lng, lat));
        if (coords.length > 1) {
          coords.forEach((c) => { bounds.extend(c); hasBounds = true; });
          hasRoute = true;
          features.push({
            type: 'Feature', geometry: { type: 'LineString', coordinates: coords },
            properties: { color, name: group.deviceName },
          });
        }
      }

      // Event markers — try positionId match first, then use event lat/lon if available
      (group.events || []).forEach((ev: any) => {
        let lat = ev.latitude;
        let lon = ev.longitude;
        if (!isValidCoord(lon, lat)) {
          const pos = posPool.find((p: any) => p.id === ev.positionId);
          if (pos) { lat = pos.latitude; lon = pos.longitude; }
        }
        if (isValidCoord(lon, lat)) {
          bounds.extend([lon, lat]); hasBounds = true;
          const isHighlight = highlightEvent?.id === ev.id;
          features.push({
            type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] },
            properties: {
              type: ev.type, time: ev.eventTime, color,
              highlighted: isHighlight ? 'true' : 'false',
              eventId: ev.id, lat, lng: lon,
            },
          });
        }
      });

      // If no route or event markers, try plotting all positions as a line anyway
      if (!hasRoute && !features.some((f: any) => f.properties?.name === group.deviceName)) {
        // Single point fallback: use first valid position
        const first = posPool.find((p: any) => isValidCoord(p.longitude, p.latitude));
        if (first) {
          bounds.extend([first.longitude, first.latitude]); hasBounds = true;
        }
      }
    });

    return { features, bounds: hasBounds ? bounds : null };
  }, []);

  // ── Create map once ──
  useEffect(() => {
    if (!deviceGroups.length || !mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: STYLE,
      center: [96.15, 16.85],
      zoom: 10,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    mapRef.current = map;

    map.on('load', () => {
      const { features, bounds } = buildFeatures(deviceGroups, null);
      map.addSource('routes', { type: 'geojson', data: { type: 'FeatureCollection', features } });
      map.addLayer({
        id: 'route-lines', type: 'line', source: 'routes',
        paint: { 'line-color': ['get', 'color'], 'line-width': 3, 'line-opacity': 0.8 },
        filter: ['==', ['geometry-type'], 'LineString'],
      });
      map.addLayer({
        id: 'event-markers', type: 'circle', source: 'routes',
        paint: {
          'circle-color': ['case', ['==', ['get', 'highlighted'], 'true'], '#f59e0b', ['get', 'color']],
          'circle-radius': ['case', ['==', ['get', 'highlighted'], 'true'], 10, 6],
          'circle-stroke-width': ['case', ['==', ['get', 'highlighted'], 'true'], 3, 2],
          'circle-stroke-color': ['case', ['==', ['get', 'highlighted'], 'true'], '#000', '#fff'],
        },
        filter: ['==', ['geometry-type'], 'Point'],
      });
      map.addLayer({
        id: 'event-labels', type: 'symbol', source: 'routes',
        layout: { 'text-field': ['get', 'type'], 'text-size': 10, 'text-offset': [0, -1.5] },
        paint: { 'text-color': '#374151' },
        filter: ['==', ['geometry-type'], 'Point'],
      });
      if (bounds) map.fitBounds(bounds, { padding: 40, maxZoom: 15 });
    });

    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  // Only create once when data arrives
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceGroups.length > 0]);

  // ── Update map data + selected event highlight ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.loaded() || !deviceGroups.length) return;
    const { features, bounds } = buildFeatures(deviceGroups, selectedEvent);
    const src = map.getSource('routes') as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData({ type: 'FeatureCollection', features });
    if (bounds) map.fitBounds(bounds, { padding: 40, maxZoom: 15 });
  }, [deviceGroups, selectedEvent, buildFeatures]);

  // ── Fly to selected event on map ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedEvent || !deviceGroups.length) return;
    // Find position from positions or route data
    for (const group of deviceGroups) {
      const positions = group.positions || group.route || [];
      const pos = positions.find((p: any) => p.id === selectedEvent.positionId);
      if (pos && Number.isFinite(pos.longitude) && Number.isFinite(pos.latitude)
        && Math.abs(pos.longitude) <= 180 && Math.abs(pos.latitude) <= 90) {
        map.flyTo({ center: [pos.longitude, pos.latitude], zoom: 14 });
        break;
      }
    }
  }, [selectedEvent, deviceGroups]);

  return (
    <div className="space-y-3 md:space-y-5">
      <PageHeader title={t('combined')} description={t('reportApiDesc')} className="max-md:hidden" />

      {/* ── Filter bar ── */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
        {/* Devices */}
        <Dropdown label={selectedDeviceIds.length === 0 ? `${t('allDevices')} (${allDeviceIds.length})` : t('deviceSelected').replace('{n}', String(selectedDeviceCount))} icon={null}>
          <div className="overflow-y-auto">
            <button
              type="button"
              className={`flex w-full items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-accent transition-colors ${selectedDeviceIds.length === 0 ? 'bg-accent/50' : ''}`}
              onClick={() => {
                // Toggle: All ↔ None
                setSelectedDeviceIds(selectedDeviceIds.length === 0 ? [-1] : []);
              }}
            >
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selectedDeviceIds.length === 0 ? 'border-primary bg-primary' : 'border-input'}`}>
                {selectedDeviceIds.length === 0 && <Check className="h-3 w-3 text-primary-foreground" />}
              </span>
              <span className="font-medium">{t('allDevices')}</span>
            </button>
            <div className="border-t my-1" />
            {devices.map((d) => {
              const checked = selectedDeviceIds.length === 0 || selectedDeviceIds.includes(d.id);
              return (
                <button
                  key={d.id}
                  type="button"
                  className={`flex w-full items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-accent transition-colors ${checked ? 'bg-accent/50' : ''}`}
                  onClick={() => {
                    setSelectedDeviceIds((prev) => {
                      if (prev.length === 0) {
                        // All mode → switch to selecting only this device
                        return [d.id];
                      }
                      if (prev[0] === -1) {
                        // None mode → select only this device
                        return [d.id];
                      }
                      const next = checked
                        ? prev.filter((id) => id !== d.id)
                        : [...prev, d.id];
                      // If all manually selected, simplify back to All mode
                      return next.length === allDeviceIds.length ? [] : next;
                    });
                  }}
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? 'border-primary bg-primary' : 'border-input'}`}>
                    {checked && <Check className="h-3 w-3 text-primary-foreground" />}
                  </span>
                  <span className="flex-1 truncate text-left">{d.name}</span>
                  <span className="text-[10px] text-muted-foreground">{d.uniqueId}</span>
                </button>
              );
            })}
          </div>
        </Dropdown>

        {/* Groups placeholder */}
        <div className="flex h-9 items-center rounded-md border border-input bg-background px-3 text-xs font-medium text-muted-foreground">
          {t('groups')}
        </div>

        {/* Period */}
        <Dropdown label={selectedPeriodLabel} icon={Calendar}>
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              className={`flex w-full items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-accent transition-colors ${period === p.key ? 'bg-accent font-medium' : ''}`}
              onClick={() => { setPeriod(p.key); if (p.key !== 'custom') setShowTriggered(0); }}
            >
              {period === p.key && <Check className="h-3.5 w-3.5 text-primary" />}
              <span className={period === p.key ? '' : 'ml-5'}>{t(p.key)}</span>
            </button>
          ))}
        </Dropdown>

        {/* Custom date inputs */}
        {period === 'custom' && (
          <div className="flex items-center gap-1.5">
            <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-9 w-36 text-xs" />
            <span className="text-xs text-muted-foreground">—</span>
            <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-9 w-36 text-xs" />
          </div>
        )}

        {/* SHOW button */}
        <Button size="sm" onClick={handleShow} disabled={loading || selectedDeviceIds[0] === -1 || (period === 'custom' && (!customFrom || !customTo))}>
          {loading ? t('loading') : t('show')}
        </Button>

        {/* Export */}
        <ExportButton disabled={!filtered.length}
          csv={{
            onClick: () => downloadCsv(`combined-${new Date().toISOString().slice(0, 10)}.csv`,
              [t('deviceName'), t('fixTime'), t('type'), t('address')],
              filtered.map((r) => [r.deviceName || '—', formatDate(r.eventTime || r.serverTime || ''), eventTypeLabel(r.type, t), r.address || '—'])
            )
          }}
          excel={{
            onClick: () => downloadExcel(`combined-${new Date().toISOString().slice(0, 10)}.xlsx`, 'Combined Report',
              [{ name: 'Events', rows: filtered.map((r) => ({
                [t('deviceName')]: r.deviceName || '—',
                [t('fixTime')]: formatDate(r.eventTime || r.serverTime || ''),
                [t('type')]: eventTypeLabel(r.type, t),
                [t('address')]: r.address || '—',
              })) }]
            )
          }}
          pdf={{
            onClick: () => {
              const pdfHeaders = [t('deviceName'), t('fixTime'), t('type'), t('address')];
              const groupsMap = new Map<string, typeof filtered>();
              filtered.forEach((r) => {
                const name = r.deviceName || `Device ${r.deviceId}`;
                if (!groupsMap.has(name)) groupsMap.set(name, []);
                groupsMap.get(name)!.push(r);
              });
              const pdfGroups = Array.from(groupsMap.entries()).map(([deviceName, rows]) => ({
                title: deviceName,
                headers: pdfHeaders,
                rows: rows.map((r) => [r.deviceName || '—', formatDate(r.eventTime || r.serverTime || ''), eventTypeLabel(r.type, t), r.address || '—']),
              }));
              downloadPdf(`combined-${new Date().toISOString().slice(0, 10)}.pdf`, 'Combined Report', pdfGroups);
            }
          }}
        />
      </div>

      {/* ── Map ── */}
      {showTriggered && !loading && rows.length > 0 && (
        <div className="space-y-1">
          <div
            ref={mapContainerRef}
            className="w-full rounded-lg border overflow-hidden"
            style={{ height: mapHeight }}
          />
          {/* ── ResizeHandle (drag to resize map/table) ── */}
          <div
            onMouseDown={(e) => {
              const startY = e.clientY;
              const startH = mapHeight;
              const onMove = (ev: MouseEvent) => {
                const delta = ev.clientY - startY;
                setMapHeight(Math.max(100, Math.min(600, startH + delta)));
              };
              const onUp = () => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
              };
              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            }}
            className="flex cursor-row-resize items-center justify-center gap-1 rounded-md border bg-muted/30 py-1 text-[10px] text-muted-foreground hover:bg-accent transition-colors select-none"
          >
            <GripHorizontal className="h-3 w-3" />
            Drag to resize
          </div>
        </div>
      )}

      {/* ── Results table ── */}
      <Card>
        <CardHeader className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{t('combined')}</CardTitle>
            <CardDescription>
              {!showTriggered ? t('setFiltersAndShow') : loading ? t('loading') : `${filtered.length} ${t('results')}`}
            </CardDescription>
          </div>
          {showTriggered && !loading && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} className="h-9 w-60 pl-9" />
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {!showTriggered ? (
            <div className="p-6"><EmptyState title={t('setFiltersAndShow')} /></div>
          ) : loading ? (
            /* ── TableShimmer (like traccar-web) ── */
            <div className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Device</TableHead>
                    <TableHead>Fix Time</TableHead>
                    <TableHead>Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <TableRow key={i}>
                      {[1, 2, 3].map((j) => (
                        <TableCell key={j}>
                          <div className="h-4 w-full animate-pulse rounded bg-muted" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : error ? (
            <div className="p-6 text-center text-sm text-destructive">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="p-6"><EmptyState title={t('noEventsInRange')} /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('deviceName')}</TableHead>
                  <TableHead>{t('fixTime')}</TableHead>
                  <TableHead>{t('type')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.id} onClick={() => setSelectedEvent(row)}
                    className={`cursor-pointer transition-colors ${selectedEvent?.id === row.id ? 'bg-primary/5' : 'hover:bg-muted/50'}`}
                  >
                    <TableCell className="text-xs">
                      {row.isFirstInGroup ? (
                        <Link to={`/devices/${row.deviceId}`} className="font-medium hover:text-primary">{row.deviceName}</Link>
                      ) : ''}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                      {formatDate(row.eventTime || row.serverTime || '')}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                        {eventTypeLabel(row.type, t)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
