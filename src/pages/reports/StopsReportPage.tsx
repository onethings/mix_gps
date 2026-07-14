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
import { formatDate, formatDuration } from '@/lib/utils';
import { api } from '@/lib/api';
import { useLiveData } from '@/context/LiveDataContext';
import { useT } from '@/lib/i18n';
import ReportFilter, { downloadCsvBlob } from '@/components/reports/ReportFilterV2';
import type { ReportFilterValue } from '@/components/reports/ReportFilterV2';

const STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

const COLUMNS = [
  { key: 'deviceName', labelKey: 'deviceName', always: true },
  { key: 'startTime', labelKey: 'startTime' },
  { key: 'address', labelKey: 'address' },
  { key: 'endTime', labelKey: 'endTime' },
  { key: 'duration', labelKey: 'duration' },
  { key: 'spentFuel', labelKey: 'spentFuel' },
  { key: 'engineHours', labelKey: 'engineHours' },
];

export default function StopsReportPage() {
  const { t } = useT();
  const { devices } = useLiveData();
  const nameByDeviceId = useMemo(() => { const m: Record<number, string> = {}; devices.forEach((d) => { m[d.id] = d.name; }); return m; }, [devices]);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(new Set(['startTime', 'endTime', 'address']));
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [selectedPosition, setSelectedPosition] = useState<any>(null);
  const [q, setQ] = useState('');
  const [showTriggered, setShowTriggered] = useState(false);
  const fetchKeyRef = useRef(0);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Map for selected stop
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
    new maplibregl.Marker({ color: '#10b981' }).setLngLat([selectedPosition.longitude, selectedPosition.latitude]).addTo(map);
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
        const data = await api.reports.stops({ from: value.from, to: value.to, deviceId: value.deviceIds }) as any[];
        if (key !== fetchKeyRef.current) return;
        const enriched = (data || []).map((row: any) => ({
          ...row,
          deviceName: nameByDeviceId[row.deviceId] || `Device ${row.deviceId}`,
        }));
        enriched.sort((a: any, b: any) => ((b.startTime) || '').localeCompare((a.startTime) || ''));
        setRows(enriched);
      } catch (e) {
        if (key === fetchKeyRef.current) setError((e as Error).message || 'Failed');
      } finally {
        if (key === fetchKeyRef.current) setLoading(false);
      }
    })();
  }, [nameByDeviceId]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      (r.deviceName || '').toLowerCase().includes(needle) ||
      (r.address || '').toLowerCase().includes(needle)
    );
  }, [rows, q]);

  const activeColumns = useMemo(() => COLUMNS.filter((c) => visibleCols.has(c.key) || c.always), [visibleCols]);
  const toggleColumn = useCallback((key: string) => {
    setVisibleCols((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  }, []);

  return (
    <div className="space-y-5">
      <PageHeader title={t('stops')} description={t('reportApiDesc')} />
      <ReportFilter loading={loading} onShow={handleShow}
        columnDefs={COLUMNS} visibleColumns={visibleCols} onToggleColumn={toggleColumn}
      >
        <Button variant="outline" size="sm" disabled={!filtered.length}
          onClick={() => downloadCsvBlob(`stops-${new Date().toISOString().slice(0, 10)}.csv`,
            activeColumns.map((c) => t(c.labelKey)),
            filtered.map((r) => activeColumns.map((c) => {
              if (c.key === 'startTime' || c.key === 'endTime') return formatDate(r[c.key] || '');
              if (c.key === 'duration') return formatDuration(r.duration || 0);
              if (c.key === 'spentFuel') return `${(r.spentFuel || 0).toFixed(1)} L`;
              if (c.key === 'engineHours') return `${((r.engineHours || 0) / 3600).toFixed(1)} h`;
              return String(r[c.key] ?? '—');
            }))
          )}>
          {t('exportCsv')}
        </Button>
      </ReportFilter>

      {/* Map for selected stop */}
      {selectedPosition && (
        <div ref={mapContainerRef} className="h-[250px] w-full rounded-lg border overflow-hidden" />
      )}
      <Card>
        <CardHeader className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{t('stops')}</CardTitle>
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
          {!showTriggered ? <div className="p-6"><EmptyState title={t('setFiltersAndShow')} /></div>
          : loading ? (
            <div className="p-0">
              <Table><TableHeader><TableRow>{activeColumns.map((c) => <TableHead key={c.key}>{t(c.labelKey)}</TableHead>)}</TableRow></TableHeader><TableBody>
                {[1,2,3,4,5].map((i) => (
                  <TableRow key={i}>{activeColumns.map((_, j) => <TableCell key={j}><div className="h-4 w-full animate-pulse rounded bg-muted" /></TableCell>)}</TableRow>
                ))}
              </TableBody></Table>
            </div>
          ) : error ? <div className="p-6 text-center text-sm text-destructive">{error}</div>
          : filtered.length === 0 ? <div className="p-6"><EmptyState title={t('noStopsInRange')} /></div>
          : <Table><TableHeader><TableRow>
            {activeColumns.map((c) => <TableHead key={c.key}>{t(c.labelKey)}</TableHead>)}
          </TableRow></TableHeader><TableBody>
            {filtered.map((row, i) => (
              <TableRow key={row.id || i} onClick={() => handleSelectItem(row)}
                className={`cursor-pointer transition-colors ${selectedItem?.id === row.id ? 'bg-primary/5' : 'hover:bg-muted/50'}`}
              >
                {activeColumns.map((c) => (
                  <TableCell key={c.key} className="text-xs text-muted-foreground">
                    {c.key === 'deviceName' ? <span className="font-medium text-foreground">{row.deviceName}</span> :
                     c.key === 'startTime' || c.key === 'endTime' ? formatDate(row[c.key] || '') :
                     c.key === 'duration' ? formatDuration(row.duration || 0) :
                     c.key === 'spentFuel' ? `${(row.spentFuel || 0).toFixed(1)} L` :
                     c.key === 'engineHours' ? `${((row.engineHours || 0) / 3600).toFixed(1)} h` :
                     String(row[c.key] ?? '—')}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody></Table>}
        </CardContent>
      </Card>
    </div>
  );
}
