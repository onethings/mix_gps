import { useMemo, useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Fuel, Navigation, Wrench } from 'lucide-react';
import PageHeader from '@/components/common/PageHeader';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import VehicleForm from '@/components/vehicles/VehicleForm';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import StatusBadge from '@/components/common/StatusBadge';
import EmptyState from '@/components/common/EmptyState';
import { formatCurrency, formatDate, formatDistance, formatDuration } from '@/lib/utils';
import { useLiveData } from '@/context/LiveDataContext';
import { useFlash } from '@/context/FlashContext';
import { api } from '@/lib/api';
import { toMaintenance } from '@/lib/transformers';
import { useTripsReport } from '@/hooks/useTripsReport';
import { useT } from '@/lib/i18n';

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-[11px] font-medium uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-base font-semibold">{value}</div>
    </CardContent></Card>
  );
}

function Kv({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="text-[10px] font-medium uppercase text-muted-foreground">{label}</div>
      <div className={`mt-1 truncate text-sm font-medium ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}

export default function VehicleProfilePage() {
  const { t } = useT();
  const { id } = useParams();
  const navigate = useNavigate();
  const { getVehicle, refresh } = useLiveData();
  const { showError, showSuccess } = useFlash();
  const v = getVehicle(id);

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const deviceIds = useMemo(() => (v ? [v.id] : []), [v]);
  const nameByDeviceId = useMemo(() => (v ? { [v.id]: v.name } : {}), [v]);
  const fromIso = useMemo(() => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), []);
  const toIso = useMemo(() => new Date().toISOString(), []);

  const { trips: vehicleTrips, loading: tripsLoading } = useTripsReport({ deviceIds, fromIso, toIso, nameByDeviceId });

  const [maintAll, setMaintAll] = useState<any[]>([]);
  const [fuelSummary, setFuelSummary] = useState<Record<string, unknown> | null>(null);
  const [maintLoadError, setMaintLoadError] = useState<string | null>(null);
  const [fuelLoadError, setFuelLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setMaintLoadError(null);
    (async () => {
      try { const raw = await api.maintenance.list(); if (!cancelled) setMaintAll((raw || []).map(toMaintenance)); }
      catch (e) { if (!cancelled) { setMaintAll([]); setMaintLoadError((e as Error).message || 'Failed'); } }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!v) { setFuelSummary(null); setFuelLoadError(null); return undefined; }
    let cancelled = false;
    setFuelLoadError(null);
    const start = new Date(); start.setDate(start.getDate() - 90);
    (async () => {
      try {
        const rows = await api.reports.summary({ from: start.toISOString(), to: new Date().toISOString(), deviceId: [v.id] });
        if (!cancelled) setFuelSummary((rows || [])[0] || null);
      } catch (e) { if (!cancelled) { setFuelSummary(null); setFuelLoadError((e as Error).message || 'Failed'); } }
    })();
    return () => { cancelled = true; };
  }, [v]);

  const vehicleWOs = useMemo(() => (v ? maintAll.filter((m) => m.vehicle === v.name) : []), [maintAll, v]);

  const submitEdit = async (form: Record<string, string>) => {
    if (!v?._raw?.device?.id) { showError('Missing device data'); throw new Error('Missing device'); }
    try {
      const gid = form.groupId?.trim(); const groupIdParsed = gid ? Number(gid) : null;
      const current = await api.devices.get(v._raw.device.id);
      await api.devices.update(v._raw.device.id, {
        ...current, name: (form.name || '').trim(), uniqueId: current.uniqueId,
        model: form.model || '', groupId: Number.isFinite(groupIdParsed) ? groupIdParsed : current.groupId ?? null,
        attributes: { ...(current.attributes || {}), plate: form.plate, vin: form.vin },
      });
      showSuccess('Device updated'); await refresh();
    } catch (e) { showError((e as Error).message || t('saveFailed')); throw e; }
  };

  const handleDelete = async () => {
    if (!v?._raw?.device?.id) return;
    setDeleting(true);
    try { await api.devices.remove(v._raw.device.id); showSuccess('Device deleted'); await refresh(); navigate('/devices', { replace: true }); }
    catch (e) { showError((e as Error).message || t('deleteFailed')); throw e; }
    finally { setDeleting(false); }
  };

  if (!v) {
    return (<div className="space-y-4">
      <Button variant="ghost" size="sm" asChild className="w-fit -ml-2"><Link to="/devices"><ArrowLeft className="h-4 w-4" /> {t('devices')}</Link></Button>
      <EmptyState title={t('vehicleNotFound')} description={t('vehicleNotFoundDesc')} />
    </div>);
  }

  const latOk = v.lat != null && v.lng != null;

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" asChild className="w-fit -ml-2"><Link to="/devices"><ArrowLeft className="h-4 w-4" /> {t('devices')}</Link></Button>

      <PageHeader title={`${v.name} · ${v.model}`} description={`${v.plate} · ${v.group}`}
        actions={<><StatusBadge status={v.status} />
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>{t('editDevice')}</Button>
          <Button size="sm" variant="destructive" onClick={() => setDeleteOpen(true)}>{t('delete')}</Button>
          <Button size="sm" asChild><Link to="/tracking">{t('liveMap')}</Link></Button>
        </>}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t('driver')} value={v.driver} />
        <Stat label={t('odometer')} value={v.odometer != null ? `${Number(v.odometer).toLocaleString()} mi` : '—'} />
        <Stat label="Fuel" value={typeof v.fuel === 'number' ? `${v.fuel}%` : '—'} />
        <Stat label={t('lastUpdate')} value={formatDate(v.lastUpdate)} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t('overview')}</TabsTrigger>
          <TabsTrigger value="trips">{t('trips')}</TabsTrigger>
          <TabsTrigger value="maintenance">{t('maintenance')}</TabsTrigger>
          <TabsTrigger value="fuel">{t('fuelHistory')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle>{t('telemetry')}</CardTitle><CardDescription>{t('mostRecentReadings')}</CardDescription></CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <Kv label={t('speed')} value={`${v.speed} ${t('unitMph')}`} />
                <Kv label={t('ignition')} value={v.ignition ? t('on') : t('off')} />
                <Kv label={t('location')} value={latOk ? `${Number(v.lat).toFixed(4)}, ${Number(v.lng).toFixed(4)}` : '—'} />
                <Kv label="VIN" value={v.vin} mono />
                <Kv label={t('group')} value={v.group} />
                <Kv label={t('course')} value={`${v.course ?? 0}°`} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>{t('quickActions')}</CardTitle><CardDescription>{t('commonOperations')}</CardDescription></CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Button variant="outline" className="justify-start" asChild><Link to="/tracking"><Navigation className="h-4 w-4" /> {t('liveMap')}</Link></Button>
                <Button variant="outline" className="justify-start" asChild><Link to="/replay"><Navigation className="h-4 w-4" /> {t('replay')}</Link></Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="trips">
          <Card><CardContent className="p-0">
            {tripsLoading ? <div className="p-6 text-sm text-muted-foreground">{t('loading')}</div>
            : vehicleTrips.length === 0 ? <div className="p-6"><EmptyState title={t('noTrips30d')} /></div>
            : <Table><TableHeader><TableRow>
              <TableHead>{t('tripId')}</TableHead><TableHead>{t('route')}</TableHead><TableHead className="text-right">{t('distanceKm')}</TableHead>
              <TableHead className="text-right">{t('duration')}</TableHead><TableHead>{t('started')}</TableHead>
            </TableRow></TableHeader><TableBody>
              {vehicleTrips.map((t: any) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">{t.id}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{t.from || t.startAddress} → {t.to || t.endAddress}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatDistance(t.distance)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatDuration(t.duration)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(t.startTime)}</TableCell>
                </TableRow>
              ))}
            </TableBody></Table>}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="maintenance">
          {maintLoadError && <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{maintLoadError}</div>}
          <Card><CardContent className="p-0">
            {vehicleWOs.length === 0 ? <div className="p-6"><EmptyState title={t('noMaintenanceRows')} /></div>
            : <Table><TableHeader><TableRow>
              <TableHead>{t('workOrder')}</TableHead><TableHead>{t('title')}</TableHead><TableHead>{t('status')}</TableHead><TableHead>{t('due')}</TableHead><TableHead className="text-right">{t('cost')}</TableHead>
            </TableRow></TableHeader><TableBody>
              {vehicleWOs.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="font-mono text-xs">{w.id}</TableCell>
                  <TableCell>{w.title}</TableCell>
                  <TableCell><StatusBadge status={w.status} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{w.dueDate}</TableCell>
                  <TableCell className="text-right tabular-nums">{w.cost ? formatCurrency(w.cost) : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody></Table>}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="fuel">
          {fuelLoadError && <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{fuelLoadError}</div>}
          <Card><CardHeader><CardTitle>Reported fuel</CardTitle><CardDescription>Last 90 days</CardDescription></CardHeader>
            <CardContent>
              {!fuelSummary ? <EmptyState title={t('noFuelData')} description={t('fuelDataDesc')} />
              : <div className="grid gap-3 md:grid-cols-3">
                <Kv label={t('spentFuel')} value={fuelSummary?.spentFuel != null ? `${Math.round(Number(fuelSummary.spentFuel) * 10) / 10} L` : '—'} />
                <Kv label={t('distanceKm')} value={fuelSummary?.distance != null ? `${(Number(fuelSummary.distance) / 1000).toFixed(1)} km` : '—'} />
                <Kv label="Engine hours" value={fuelSummary?.engineHours != null ? String(fuelSummary.engineHours) : '—'} />
              </div>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {editOpen && v?._raw?.device && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setEditOpen(false)}>
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">{t('editVehicle')}</h3>
            <VehicleForm device={v._raw.device} onSave={() => { setEditOpen(false); refresh(); }} onCancel={() => setEditOpen(false)} />
          </div>
        </div>
      )}
      <ConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} title={t('deleteDeviceTitle')} description={t('deleteDevicePermanent')} confirmLabel={t('delete')} onConfirm={handleDelete} destructive />
    </div>
  );
}
