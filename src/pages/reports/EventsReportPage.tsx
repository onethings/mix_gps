import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, MapPin, Crosshair } from 'lucide-react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import PageHeader from '@/components/common/PageHeader';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import EmptyState from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils';
import { api } from '@/lib/api';
import { useLiveData } from '@/context/LiveDataContext';
import { useT } from '@/lib/i18n';
import ReportFilter from '@/components/reports/ReportFilterV2';
import type { ReportFilterValue } from '@/components/reports/ReportFilterV2';
import ExportButton from '@/components/reports/ExportButton';
import { downloadCsv, downloadExcel, downloadPdf } from '@/lib/exportUtils';

const STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

const COLUMNS = [
  { key: 'eventTime', labelKey: 'Fix Time' },
  { key: 'type', labelKey: 'Type' },
  { key: 'geofenceId', labelKey: 'Geofence' },
  { key: 'maintenanceId', labelKey: 'Maintenance' },
  { key: 'address', labelKey: 'Address' },
  { key: 'attributes', labelKey: 'attributes' },
];

function eventTypeLabel(type: string | undefined | null, t: (s: string) => string): string {
  if (!type) return '—';
  const translated = t(`eventType_${type}`);
  if (translated !== `eventType_${type}`) return translated;
  return type.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim();
}

export default function EventsReportPage() {
  const { t } = useT();
  const { devices } = useLiveData();
  const nameByDeviceId = useMemo(() => { const m: Record<number, string> = {}; devices.forEach((d) => { m[d.id] = d.name; }); return m; }, [devices]);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(new Set(['eventTime', 'type', 'address', 'attributes']));
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [selectedEventTypes, setSelectedEventTypes] = useState<Set<string>>(new Set(['allEvents']));
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [selectedPosition, setSelectedPosition] = useState<any>(null);
  const [q, setQ] = useState('');
  const [showTriggered, setShowTriggered] = useState(false);
  const fetchKeyRef = useRef(0);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Fetch available event types
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/notifications/types');
        const types = await res.json();
        if (!cancelled) setEventTypes(Array.isArray(types) ? types.map((t: any) => t.type) : []);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Map for selected event
  useEffect(() => {
    if (!selectedPosition || !mapContainerRef.current) {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      return;
    }
    if (mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapContainerRef.current, style: STYLE,
      center: [selectedPosition.longitude, selectedPosition.latitude], zoom: 14,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    new maplibregl.Marker({ color: '#ef4444' }).setLngLat([selectedPosition.longitude, selectedPosition.latitude]).addTo(map);
    mapRef.current = map;
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, [selectedPosition]);

  const handleSelectItem = useCallback(async (item: any) => {
    if (selectedItem?.id === item.id) { setSelectedItem(null); setSelectedPosition(null); return; }
    setSelectedItem(item);
    setSelectedPosition(null);
    if (item.positionId) {
      try {
        const data = await api.positions.list({ id: item.positionId }) as any[];
        if (Array.isArray(data) && data[0]) setSelectedPosition(data[0]);
      } catch { /* ignore */ }
    }
  }, [selectedItem]);

  const handleShow = useCallback((value: ReportFilterValue) => {
    const key = ++fetchKeyRef.current;
    setShowTriggered(true);
    setLoading(true);
    setError(null);
    setSelectedItem(null);
    setSelectedPosition(null);
    (async () => {
      try {
        const params: any = { from: value.from, to: value.to, deviceId: value.deviceIds };
        if (!selectedEventTypes.has('allEvents')) params.type = Array.from(selectedEventTypes);
        const data = await api.reports.events(params) as any[];
        if (key !== fetchKeyRef.current) return;
        (data || []).sort((a: any, b: any) => ((b.eventTime || b.serverTime) || '').localeCompare((a.eventTime || a.serverTime) || ''));
        setRows(data || []);
      } catch (e) {
        if (key === fetchKeyRef.current) setError((e as Error).message || 'Failed');
      } finally {
        if (key === fetchKeyRef.current) setLoading(false);
      }
    })();
  }, [selectedEventTypes]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      (nameByDeviceId[r.deviceId] || '').toLowerCase().includes(needle) ||
      (r.type || '').toLowerCase().includes(needle) ||
      (r.address || '').toLowerCase().includes(needle)
    );
  }, [rows, q, nameByDeviceId]);

  function formatAttrValue(attrs: Record<string, unknown> | undefined | null): string {
    if (!attrs) return '—';
    const parts: string[] = [];
    for (const [k, v] of Object.entries(attrs)) {
      parts.push(`${k}: ${v}`);
    }
    return parts.join('; ') || '—';
  }

  function formatEventCell(key: string, r: any): string {
    if (key === 'eventTime') return formatDate(r.eventTime || r.serverTime || '');
    if (key === 'type') return eventTypeLabel(r.type, t);
    if (key === 'geofenceId') return r.geofenceId != null ? `#${r.geofenceId}` : '—';
    if (key === 'maintenanceId') return r.maintenanceId != null ? `#${r.maintenanceId}` : '—';
    if (key === 'address') return r.address || '—';
    if (key === 'attributes') return formatAttrValue(r.attributes);
    return String(r[key] ?? '—');
  }

  const activeColumns = useMemo(() => COLUMNS.filter((c) => visibleCols.has(c.key)), [visibleCols]);

  const toggleColumn = useCallback((key: string) => {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  return (
    <div className="space-y-5">
      <PageHeader title={t('events')} description={t('reportApiDesc')} />

      <ReportFilter loading={loading} onShow={handleShow}
        columnDefs={COLUMNS} visibleColumns={visibleCols} onToggleColumn={toggleColumn}
        extraFilters={
          <div className="inline-flex h-9 items-center gap-1 rounded-md border border-input bg-background px-2 text-xs">
            <span className="text-muted-foreground">{t('type')}:</span>
            <select
              value={selectedEventTypes.has('allEvents') ? 'allEvents' : Array.from(selectedEventTypes)[0] || 'allEvents'}
              onChange={(e) => setSelectedEventTypes(new Set(e.target.value === 'allEvents' ? ['allEvents'] : [e.target.value]))}
              className="bg-transparent text-foreground outline-none text-xs max-w-[120px]"
            >
              <option value="allEvents">{t('eventAllEvents')}</option>
              {eventTypes.map((et) => <option key={et} value={et}>{eventTypeLabel(et, t)}</option>)}
            </select>
          </div>
        }
      >
        <ExportButton disabled={!filtered.length}
          csv={{
            onClick: () => {
              const csvHeaders = ['Device', ...activeColumns.map((c) => t(c.labelKey))];
              downloadCsv(`events-${new Date().toISOString().slice(0, 10)}.csv`, csvHeaders,
                filtered.map((r) => [nameByDeviceId[r.deviceId] || `Device ${r.deviceId}`, ...activeColumns.map((c) => formatEventCell(c.key, r))])
              );
            }
          }}
          excel={{
            onClick: () => {
              const excelHeaders = ['Device', ...activeColumns.map((c) => t(c.labelKey))];
              downloadExcel(`events-${new Date().toISOString().slice(0, 10)}.xlsx`, 'Events Report',
                [{ name: 'Events', rows: filtered.map((r) => {
                  const obj: Record<string, string> = { 'Device': nameByDeviceId[r.deviceId] || `Device ${r.deviceId}` };
                  activeColumns.forEach((c) => { obj[t(c.labelKey)] = formatEventCell(c.key, r); });
                  return obj;
                })}]
              );
            }
          }}
          pdf={{
            onClick: () => {
              const pdfHeaders = ['Device', ...activeColumns.map((c) => t(c.labelKey))];
              const groupsMap = new Map<string, typeof filtered>();
              filtered.forEach((r) => {
                const name = nameByDeviceId[r.deviceId] || `Device ${r.deviceId}`;
                if (!groupsMap.has(name)) groupsMap.set(name, []);
                groupsMap.get(name)!.push(r);
              });
              const pdfGroups = Array.from(groupsMap.entries()).map(([deviceName, rows]) => ({
                title: deviceName,
                headers: pdfHeaders,
                rows: rows.map((r) => [nameByDeviceId[r.deviceId] || `Device ${r.deviceId}`, ...activeColumns.map((c) => formatEventCell(c.key, r))]),
              }));
              downloadPdf(`events-${new Date().toISOString().slice(0, 10)}.pdf`, 'Events Report', pdfGroups);
            }
          }}
        />
      </ReportFilter>

      {/* Map for selected event */}
      {selectedPosition && (
        <div ref={mapContainerRef} className="h-[250px] w-full rounded-lg border overflow-hidden" />
      )}

      <Card>
        <CardHeader className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{t('events')}</CardTitle>
            <CardDescription>
              {!showTriggered ? t('setFiltersAndShow') : loading ? t('loading') : `${filtered.length} results`}
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
          {!showTriggered ? <div className="p-6"><EmptyState title={t('setFiltersAndShow')} /></div>
          : loading ? (
            <div className="p-0">
              <Table><TableHeader><TableRow><TableHead className="w-10" /><TableHead>{t('device')}</TableHead><TableHead>{t('reportColEventTime')}</TableHead><TableHead>{t('type')}</TableHead></TableRow></TableHeader><TableBody>
                {[1,2,3,4,5].map((i) => (
                  <TableRow key={i}>{[1,2,3,4].map((j) => <TableCell key={j}><div className="h-4 w-full animate-pulse rounded bg-muted" /></TableCell>)}</TableRow>
                ))}
              </TableBody></Table>
            </div>
          ) : error ? <div className="p-6 text-center text-sm text-destructive">{error}</div>
          : filtered.length === 0 ? <div className="p-6"><EmptyState title={t('noEventsInRange')} /></div>
          : (
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-10" />
                <TableHead>{t('device')}</TableHead>
                {activeColumns.map((c) => <TableHead key={c.key}>{t(c.labelKey)}</TableHead>)}
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map((row, i) => (
                  <TableRow key={row.id || i} onClick={() => handleSelectItem(row)}
                    className={`cursor-pointer transition-colors ${selectedItem?.id === row.id ? 'bg-primary/5' : 'hover:bg-muted/50'}`}
                  >
                    <TableCell>
                      {row.positionId ? (
                        <button type="button" className="rounded p-1 text-muted-foreground hover:text-primary transition-colors" title="Show on map">
                          {selectedItem?.id === row.id ? <Crosshair className="h-3.5 w-3.5 text-primary" /> : <MapPin className="h-3.5 w-3.5" />}
                        </button>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs font-medium">{nameByDeviceId[row.deviceId] || `Device ${row.deviceId}`}</TableCell>
                    {activeColumns.map((c) => (
                      <TableCell key={c.key} className="text-xs text-muted-foreground">
                        {c.key === 'eventTime' ? formatDate(row.eventTime || row.serverTime || '') :
                         c.key === 'type' ? <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">{eventTypeLabel(row.type, t)}</span> :
                         c.key === 'geofenceId' ? (row.geofenceId != null ? `#${row.geofenceId}` : '—') :
                         c.key === 'maintenanceId' ? (row.maintenanceId != null ? `#${row.maintenanceId}` : '—') :
                         c.key === 'address' ? (row.address || '—') :
                         c.key === 'attributes' ? formatAttrValue(row.attributes) :
                         String(row[c.key] ?? '—')}
                      </TableCell>
                    ))}
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
