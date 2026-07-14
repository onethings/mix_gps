import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useLiveData } from '@/context/LiveDataContext';
import { useSession } from '@/context/SessionContext';
import { api } from '@/lib/api';
import { downloadCsv } from '@/lib/csv';
import { useT } from '@/lib/i18n';

export default function FuelPage() {
  const { t } = useT();
  const { user } = useSession();
  const { devices } = useLiveData();
  const deviceIds = useMemo(() => devices.map((d) => d.id).sort().join(','), [devices]);
  const deviceIdList = useMemo(() => deviceIds ? deviceIds.split(',').map(Number) : [], [deviceIds]);
  const nameByDeviceId = useMemo(() => { const m: Record<number, string> = {}; devices.forEach((d) => { m[d.id] = d.name; }); return m; }, [devices]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (!user || !deviceIdList.length) { setRows([]); setLoadError(null); setLoading(false); return undefined; }
    let cancelled = false; setLoading(true); setLoadError(null);
    const end = new Date(); const start = new Date(); start.setDate(start.getDate() - 14);
    (async () => {
      try { const raw = await api.reports.summary({ from: start.toISOString(), to: end.toISOString(), deviceId: deviceIdList }); if (!cancelled) setRows(raw || []); }
      catch (e) { if (!cancelled) { setRows([]); setLoadError(e.message || 'Failed'); } } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [user, deviceIds]);

  const totalLiters = useMemo(() => rows.reduce((s, r) => s + (Number(r.spentFuel) || 0), 0), [rows]);
  const totalKm = useMemo(() => rows.reduce((s, r) => s + (Number(r.distance) || 0), 0) / 1000, [rows]);

  return (
    <div className="space-y-5">
      {loadError && <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{loadError}</div>}
      <PageHeader title={t('fuelTitle')} description={t('fuelDesc')}
        actions={<Button variant="outline" size="sm" disabled={!rows.length}
          onClick={() => downloadCsv(`fuel-14d-${new Date().toISOString().slice(0, 10)}.csv`,
            [{ key: 'vehicle', label: t('vehicle'), format: (r: any) => (nameByDeviceId as Record<number, string>)[r.deviceId] || r.deviceName || `Device ${r.deviceId}` },
              { key: 'distance', label: t('distanceKm'), format: (r) => (r.distance != null ? (Number(r.distance) / 1000).toFixed(2) : '') },
              { key: 'spentFuel', label: t('spentFuelL'), format: (r) => (r.spentFuel != null ? (Math.round(Number(r.spentFuel) * 10) / 10) : '') }], rows)}>
          <Download className="h-4 w-4" /> {t('exportCsv')}</Button>}
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card><CardContent className="p-5">
          <div className="text-xs font-medium uppercase text-muted-foreground">{t('totalDistance')}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{loading ? '…' : `${totalKm.toFixed(1)} km`}</div>
          <div className="text-xs text-muted-foreground">{t('last14days')}</div>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <div className="text-xs font-medium uppercase text-muted-foreground">{t('spentFuel')}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{loading ? '…' : `${Math.round(totalLiters * 10) / 10} L`}</div>
          <div className="text-xs text-muted-foreground">{t('perDeviceSummary')}</div>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <div className="text-xs font-medium uppercase text-muted-foreground">{t('vehicle')}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{devices.length}</div>
          <div className="text-xs text-muted-foreground">{t('activeInAccount')}</div>
        </CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>{t('byVehicle')}</CardTitle><CardDescription>{t('summaryRows14d')}</CardDescription></CardHeader>
        <CardContent className="p-0">
          {loading ? <div className="p-6 text-sm text-muted-foreground">{t('loading')}</div> : (
            <Table><TableHeader><TableRow>
              <TableHead>{t('vehicle')}</TableHead><TableHead className="text-right">{t('distanceKm')}</TableHead><TableHead className="text-right">{t('spentFuelL')}</TableHead>
            </TableRow></TableHeader><TableBody>
              {rows.map((r) => (
                <TableRow key={r.deviceId}>
                  <TableCell className="font-medium">{nameByDeviceId[r.deviceId] || `Device ${r.deviceId}`}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.distance != null ? (Number(r.distance) / 1000).toFixed(1) : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.spentFuel != null ? Math.round(Number(r.spentFuel) * 10) / 10 : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody></Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
