import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Calendar, Download, Filter, Search } from 'lucide-react';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import StatusBadge from '@/components/common/StatusBadge';
import EmptyState from '@/components/common/EmptyState';
import { formatDate, formatDistance, formatDuration } from '@/lib/utils';
import { useLiveData } from '@/context/LiveDataContext';
import { useTripsReport } from '@/hooks/useTripsReport';
import { useT } from '@/lib/i18n';
import { downloadCsv } from '@/lib/csv';

export default function TripsPage() {
  const { t } = useT();
  const { devices } = useLiveData();
  const deviceIds = useMemo(() => devices.map((d) => d.id), [devices]);
  const nameByDeviceId = useMemo(() => { const m: Record<number, string> = {}; devices.forEach((d) => { m[d.id] = d.name; }); return m; }, [devices]);
  const [rangeDays, setRangeDays] = useState(7);
  const fromIso = useMemo(() => new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString(), [rangeDays]);
  const toIso = useMemo(() => new Date().toISOString(), [rangeDays]);
  const { trips, loading } = useTripsReport({ deviceIds, fromIso, toIso, nameByDeviceId });
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return trips;
    return trips.filter((t) => String(t.id).toLowerCase().includes(needle) || String(t.vehicle).toLowerCase().includes(needle) || String(t.driver).toLowerCase().includes(needle));
  }, [trips, q]);

  return (
    <div className="space-y-5">
      <PageHeader title={t('trips')} description={t('everyMovement')}
        actions={<><label className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-xs font-medium text-muted-foreground">
          <Calendar className="h-4 w-4" />
          <select value={rangeDays} onChange={(e) => setRangeDays(Number(e.target.value))} className="bg-transparent text-foreground outline-none">
            <option value={1}>{t('last24h')}</option><option value={7}>{t('last7days')}</option><option value={30}>{t('last30days')}</option><option value={90}>{t('last30days')}</option>
          </select></label>
          <Button variant="outline" size="sm" disabled={!filtered.length}
            onClick={() => downloadCsv(`trips-${rangeDays}d-${new Date().toISOString().slice(0, 10)}.csv`,
              [{ key: 'id', label: t('tripId') }, { key: 'vehicle', label: t('vehicle') }, { key: 'driver', label: t('driver') },
                { key: 'from', label: t('from') }, { key: 'to', label: t('to') }, { key: 'startTime', label: t('started') },
                { key: 'endTime', label: 'Ended' }, { key: 'distance', label: t('distanceKm'), format: (r: Record<string, unknown>) => (r.distance as number).toFixed(2) },
                { key: 'duration', label: t('duration'), format: (r: Record<string, unknown>) => (r.duration as number).toFixed(1) },
                { key: 'avgSpeed', label: 'Avg speed (mph)' }, { key: 'maxSpeed', label: 'Max speed (mph)' },
                { key: 'fuelUsed', label: 'Fuel (L)' }], filtered as unknown as Record<string, unknown>[])}><Download className="h-4 w-4" /> {t('exportCsv')}</Button></>}
      />
      <Card>
        <CardHeader className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div><CardTitle>{t('allTrips')}</CardTitle><CardDescription>{loading ? t('loading') : `${filtered.length} ${t('results')}`}</CardDescription></div>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} className="h-9 w-60 pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!loading && filtered.length === 0 ? <div className="p-6"><EmptyState title={t('noTripsInRange')} /></div>
          : loading ? <div className="p-6 text-center text-sm text-muted-foreground">{t('loading')}</div>
          : <Table><TableHeader><TableRow>
            <TableHead>{t('tripId')}</TableHead><TableHead>{t('vehicle')}</TableHead><TableHead>{t('driver')}</TableHead><TableHead>{t('route')}</TableHead>
            <TableHead className="text-right">{t('distanceKm')}</TableHead><TableHead className="text-right">{t('duration')}</TableHead>
            <TableHead className="text-right">{t('avgMax')}</TableHead><TableHead>{t('started')}</TableHead>
          </TableRow></TableHeader><TableBody>
            {filtered.map((trip) => (
              <TableRow key={trip.id}>
                <TableCell className="font-mono text-xs">{trip.id}</TableCell>
                <TableCell><Link to={`/devices/${trip.deviceId}`} className="font-medium hover:text-primary">{trip.vehicle}</Link></TableCell>
                <TableCell className="text-muted-foreground">{trip.driver}</TableCell>
                <TableCell className="max-w-[260px]"><div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="truncate">{(trip as any).from || trip.startAddress}</span><ArrowRight className="h-3 w-3 shrink-0" /><span className="truncate">{(trip as any).to || trip.endAddress}</span></div></TableCell>
                <TableCell className="text-right tabular-nums">{formatDistance(trip.distance)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatDuration(trip.duration)}</TableCell>
                <TableCell className="text-right tabular-nums text-xs text-muted-foreground">{trip.avgSpeed} / {trip.maxSpeed} {t('unitMph')}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{formatDate(trip.startTime)}</TableCell>
              </TableRow>
            ))}
          </TableBody></Table>}
        </CardContent>
      </Card>
    </div>
  );
}
