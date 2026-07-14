import { useCallback, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Calendar, Check, ChevronDown, Download, Search, X } from 'lucide-react';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import EmptyState from '@/components/common/EmptyState';
import { formatDate, formatDistance, formatDuration } from '@/lib/utils';
import { useLiveData } from '@/context/LiveDataContext';
import { useReportFilter } from '@/context/ReportFilterContext';
import { useTripsReport } from '@/hooks/useTripsReport';
import { useT } from '@/lib/i18n';
import { downloadCsv } from '@/lib/csv';

/* ── Period presets (like traccar-web) ── */
type PeriodKey = 'today' | 'yesterday' | 'thisWeek' | 'prevWeek' | 'thisMonth' | 'prevMonth' | 'custom';

const PERIODS: PeriodKey[] = ['today', 'yesterday', 'thisWeek', 'prevWeek', 'thisMonth', 'prevMonth', 'custom'];

function periodToRange(key: PeriodKey): { from: Date; to: Date } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const day = now.getDay(); // 0=Sun

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

/* ── Available columns ── */
interface ColumnDef {
  key: string;
  labelKey: string;
  always?: boolean;
  render: (trip: any, t: (s: string) => string) => React.ReactNode;
}

const ALL_COLUMNS: ColumnDef[] = [
  { key: 'device', labelKey: 'deviceName', always: true, render: (trip, t) => (
    <Link to={`/devices/${trip.deviceId}`} className="font-medium hover:text-primary">{trip.vehicle}</Link>
  )},
  { key: 'startTime', labelKey: 'startTime', render: (trip, t) => (
    <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(trip.startTime)}</span>
  )},
  { key: 'endTime', labelKey: 'endTime', render: (trip, t) => (
    <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(trip.endTime)}</span>
  )},
  { key: 'distance', labelKey: 'distance', render: (trip, t) => (
    <span className="text-right tabular-nums block">{formatDistance(trip.distance)}</span>
  )},
  { key: 'avgSpeed', labelKey: 'averageSpeed', render: (trip, t) => (
    <span className="text-right tabular-nums block">{trip.avgSpeed} {t('unitKmh')}</span>
  )},
  { key: 'maxSpeed', labelKey: 'maximumSpeed', render: (trip, t) => (
    <span className="text-right tabular-nums block">{trip.maxSpeed} {t('unitKmh')}</span>
  )},
  { key: 'duration', labelKey: 'duration', render: (trip, t) => (
    <span className="text-right tabular-nums block">{formatDuration(trip.duration)}</span>
  )},
  { key: 'fuelUsed', labelKey: 'spentFuel', render: (trip, t) => (
    <span className="text-right tabular-nums block">{trip.fuelUsed?.toFixed(1)} L</span>
  )},
  { key: 'driver', labelKey: 'driver', render: (trip, t) => (
    <span className="text-muted-foreground">{trip.driver || '—'}</span>
  )},
  { key: 'route', labelKey: 'routeTab', render: (trip, t) => (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground max-w-[220px]">
      <span className="truncate">{trip.startAddress || '—'}</span>
      <ArrowRight className="h-3 w-3 shrink-0" />
      <span className="truncate">{trip.endAddress || '—'}</span>
    </div>
  )},
];

/* ── Helpers ── */
function toggleSet<T>(set: Set<T>, item: T): Set<T> {
  const next = new Set(set);
  if (next.has(item)) next.delete(item); else next.add(item);
  return next;
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
          <div className={`absolute z-20 mt-1 min-w-[180px] rounded-lg border bg-popover p-1 shadow-md ${align === 'right' ? 'right-0' : 'left-0'}`}>
            {children}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Page ── */
export default function TripsPage() {
  const { t } = useT();
  const { devices } = useLiveData();
  const nameByDeviceId = useMemo(() => { const m: Record<number, string> = {}; devices.forEach((d) => { m[d.id] = d.name; }); return m; }, [devices]);

  // Filters (shared via context)
  const { filters: { selectedDeviceIds, period }, setSelectedDeviceIds, setPeriod } = useReportFilter();
  const [visibleCols, setVisibleCols] = useState<Set<string>>(new Set(['device', 'startTime', 'endTime', 'distance', 'avgSpeed']));
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showTriggered, setShowTriggered] = useState(0); // increment to trigger

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

  // Stable empty values to prevent flashing
  const emptyIdsRef = useRef<number[]>([]);
  const emptyStrRef = useRef<string>('');

  // Fetch only when showTriggered changes
  const deviceIds = useMemo(() => {
    if (selectedDeviceIds.length === 0) return devices.map((d) => d.id);
    return selectedDeviceIds;
  }, [selectedDeviceIds, devices]);

  const { trips, loading } = useTripsReport({
    deviceIds: showTriggered > 0 ? deviceIds : emptyIdsRef.current,
    fromIso: showTriggered > 0 ? dateRange.fromIso : emptyStrRef.current,
    toIso: showTriggered > 0 ? dateRange.toIso : emptyStrRef.current,
    nameByDeviceId,
  });

  // Local search
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return trips;
    return trips.filter((t) =>
      String(t.vehicle).toLowerCase().includes(needle) ||
      String(t.driver).toLowerCase().includes(needle) ||
      String(t.startAddress || '').toLowerCase().includes(needle) ||
      String(t.endAddress || '').toLowerCase().includes(needle)
    );
  }, [trips, q]);

  const handleShow = useCallback(() => {
    setShowTriggered((n) => n + 1);
  }, []);

  const allDeviceIds = useMemo(() => devices.map((d) => d.id), [devices]);
  const selectedDeviceCount = selectedDeviceIds.length === 0 ? allDeviceIds.length : selectedDeviceIds.length;
  const selectedPeriodLabel = t(period);

  // Columns for CSV
  const csvColumns = useMemo(() => ALL_COLUMNS.filter((c) => visibleCols.has(c.key) || c.always).map((c) => {
    const label = t(c.labelKey);
    if (c.key === 'distance') return { key: c.key, label, format: (r: any) => r.distance?.toFixed(2) };
    if (c.key === 'duration') return { key: c.key, label, format: (r: any) => formatDuration(r.duration) };
    if (c.key === 'avgSpeed') return { key: c.key, label };
    if (c.key === 'maxSpeed') return { key: c.key, label };
    return { key: c.key, label };
  }), [visibleCols, t]);

  const activeColumns = useMemo(() => ALL_COLUMNS.filter((c) => visibleCols.has(c.key) || c.always), [visibleCols]);

  return (
    <div className="space-y-5">
      <PageHeader title={t('trips')} description={t('everyMovement')} />

      {/* ── Filter bar (like traccar-web) ── */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
        {/* Devices */}
        <Dropdown label={selectedDeviceIds.length === 0 ? `${t('allDevices')} (${allDeviceIds.length})` : t('deviceSelected').replace('{n}', String(selectedDeviceCount))} icon={null}>
          <div className="max-h-56 overflow-y-auto">
            <button
              type="button"
              className={`flex w-full items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-accent transition-colors ${selectedDeviceIds.length === 0 ? 'bg-accent/50' : ''}`}
              onClick={() => setSelectedDeviceIds([])}
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
                      // In All Devices mode → switch to selecting only this device
                      if (prev.length === 0) return [d.id];
                      return checked ? prev.filter((id) => id !== d.id) : [...prev, d.id];
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
          {PERIODS.map((key) => (
            <button
              key={key}
              type="button"
              className={`flex w-full items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-accent transition-colors ${period === key ? 'bg-accent font-medium' : ''}`}
              onClick={() => { setPeriod(key); if (key !== 'custom') setShowTriggered(0); }}
            >
              {period === key && <Check className="h-3.5 w-3.5 text-primary" />}
              <span className={period === key ? '' : 'ml-5'}>{t(key)}</span>
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

        {/* Columns */}
        <Dropdown label={`${activeColumns.length} ${t('columns')}`} icon={null} align="right">
          <div className="max-h-64 overflow-y-auto">
            {ALL_COLUMNS.filter((c) => !c.always).map((c) => (
              <label key={c.key} className="flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-accent rounded cursor-pointer">
                <input
                  type="checkbox"
                  checked={visibleCols.has(c.key)}
                  onChange={() => setVisibleCols((prev) => toggleSet(prev, c.key))}
                  className="rounded"
                />
                {t(c.labelKey)}
              </label>
            ))}
          </div>
        </Dropdown>

        {/* SHOW button */}
        <Button size="sm" onClick={handleShow} disabled={loading || (period === 'custom' && (!customFrom || !customTo))}>
          {loading ? t('loading') : t('show')}
        </Button>

        {/* Export */}
        <Button variant="outline" size="sm" disabled={!filtered.length}
          onClick={() => downloadCsv(
            `trips-${period}-${new Date().toISOString().slice(0, 10)}.csv`,
            csvColumns as any,
            filtered as any,
          )}
        >
          <Download className="h-4 w-4" /> {t('exportCsv')}
        </Button>
      </div>

      {/* ── Results table ── */}
      <Card>
        <CardHeader className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{t('trips')}</CardTitle>
            <CardDescription>
              {!showTriggered ? t('setFiltersAndShow') : loading ? t('loading') : `${filtered.length} ${t('results')}`}
            </CardDescription>
          </div>
          {showTriggered > 0 && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} className="h-9 w-60 pl-9" />
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {!showTriggered ? (
            <div className="p-6"><EmptyState title={t('setFiltersAndShow')} description={t('chooseDevicesPeriodColumns')} /></div>
          ) : loading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">{t('loading')}</div>
          ) : filtered.length === 0 ? (
            <div className="p-6"><EmptyState title={t('noTripsInRange')} description={t('tryWiderRange')} /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {activeColumns.map((c) => (
                    <TableHead key={c.key} className={c.key === 'distance' || c.key === 'avgSpeed' || c.key === 'maxSpeed' || c.key === 'duration' || c.key === 'fuelUsed' ? 'text-right' : ''}>
                      {t(c.labelKey)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((trip) => (
                  <TableRow key={trip.id}>
                    {activeColumns.map((c) => (
                      <TableCell key={c.key}>{c.render(trip, t)}</TableCell>
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
