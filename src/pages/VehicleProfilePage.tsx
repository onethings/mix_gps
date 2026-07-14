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
import type { TraccarPosition } from '@/types';
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

function PositionField({ label, value, mono }: { label: string; value: unknown; mono?: boolean }) {
  if (value == null || value === '') return null;
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="text-[10px] font-medium uppercase text-muted-foreground">{label}</div>
      <div className={`mt-1 truncate text-sm font-medium ${mono ? 'font-mono' : ''}`}>{String(value)}</div>
    </div>
  );
}

const SKIP_ATTR_KEYS = new Set([
  'ignition', 'fuel', 'odometer', 'batteryLevel', 'driverUniqueId',
  'vin', 'iconType', 'plate', 'model', 'textColor',
]);

function renderPositionValue(t: (k: string) => string, key: string, value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'boolean') return value ? t('posField_yes') : t('posField_no');
  if (key === 'distance' || key === 'totalDistance') {
    const n = Number(value);
    return Number.isFinite(n) ? `${(n / 1000).toFixed(2)} ${t('posField_unitKm')}` : String(value);
  }
  if (key === 'hours') {
    let n = Number(value);
    if (!Number.isFinite(n)) return String(value);
    // Traccar accumulators store hours in milliseconds;
    // heuristic: > 100000 → ms, otherwise → already hours
    if (n > 100000) n = n / 3600000;
    const h = Math.floor(n);
    const m = Math.round((n - h) * 60);
    if (m === 0) return `${h} ${t('posField_unitH')}`;
    return `${h} ${t('posField_unitH')} ${m} ${t('posField_unitMin')}`;
  }
  if (key === 'geofenceIds' && Array.isArray(value)) {
    return value.length > 0 ? value.join(', ') : null;
  }
  if (key === 'network' && typeof value === 'object') {
    const s = JSON.stringify(value);
    return s === '{}' || s === '[]' ? null : s;
  }
  if (key === 'alarm') {
    const s = String(value);
    // Try direct alarmType_* i18n key, e.g. "powerOff" → "alarmType_powerOff"
    const i18nKey = `alarmType_${s}`;
    const translated = t(i18nKey);
    return translated !== i18nKey ? translated : s;
  }
  return String(value);
}

const ATTR_TO_I18N_KEY: Record<string, string> = {
  alarm: 'posField_alarm',
  motion: 'posField_motion',
  distance: 'posField_distance',
  totalDistance: 'posField_totalDistance',
  charge: 'posField_charge',
  blocked: 'posField_blocked',
  iccid: 'posField_iccid',
  hours: 'posField_hours',
  network: 'posField_network',
  geofenceIds: 'posField_geofenceIds',
  batteryLevel: 'posField_batteryLevel',
  fuelLevel: 'posField_fuelLevel',
  rpm: 'posField_rpm',
  temp: 'posField_temp',
  engineTemp: 'posField_engineTemp',
  driverUniqueId: 'posField_driverUniqueId',
};

function PositionDataCard({ position, deviceId }: { position: NonNullable<TraccarPosition>; deviceId: number }) {
  const { t } = useT();
  const { showError, showSuccess } = useFlash();
  const attr = position.attributes || {};

  const [accEditOpen, setAccEditOpen] = useState(false);
  const [accSaving, setAccSaving] = useState(false);
  const [editHours, setEditHours] = useState('');
  const [editDistance, setEditDistance] = useState('');

  const openAccEditor = () => {
    // Pre-fill from existing position attributes — no fetch needed
    const rawHours = attr.hours;
    const rawDistance = attr.totalDistance;
    if (rawHours != null) {
      let n = Number(rawHours);
      if (!Number.isFinite(n)) { setEditHours(''); } else {
        if (n > 100000) n = n / 3600000; // ms → hours
        setEditHours(n.toFixed(1));
      }
    } else { setEditHours(''); }
    if (rawDistance != null) {
      const n = Number(rawDistance);
      setEditDistance(Number.isFinite(n) ? (n / 1000).toFixed(2) : '');
    } else { setEditDistance(''); }
    setAccEditOpen(true);
  };

  const saveAccumulators = async () => {
    setAccSaving(true);
    try {
      const payload: Record<string, unknown> = { deviceId };
      const parsedH = parseFloat(editHours);
      const parsedD = parseFloat(editDistance);
      payload.hours = Number.isFinite(parsedH) ? parsedH * 3600000 : 0;
      payload.totalDistance = Number.isFinite(parsedD) ? parsedD * 1000 : 0;
      await api.devices.putAccumulators(deviceId, payload);
      showSuccess('Accumulators updated');
      setAccEditOpen(false);
    } catch (e) {
      showError((e as Error).message || 'Save failed');
    } finally {
      setAccSaving(false);
    }
  };

  const knownFields: { key: string; i18n: string; value: string | null; mono?: boolean; isEditable?: boolean }[] = [
    { key: 'id', i18n: 'posField_id', value: String(position.id), mono: true },
    { key: 'deviceId', i18n: 'posField_deviceId', value: String(position.deviceId), mono: true },
    { key: 'protocol', i18n: 'posField_protocol', value: position.protocol || null },
    { key: 'serverTime', i18n: 'posField_serverTime', value: position.serverTime ? formatDate(position.serverTime) : null },
    { key: 'deviceTime', i18n: 'posField_deviceTime', value: position.deviceTime ? formatDate(position.deviceTime) : null },
    { key: 'fixTime', i18n: 'posField_fixTime', value: position.fixTime ? formatDate(position.fixTime) : null },
    { key: 'valid', i18n: 'posField_valid', value: position.valid != null ? (position.valid ? t('posField_yes') : t('posField_no')) : null },
    { key: 'lat', i18n: 'posField_latitude', value: position.latitude != null ? `${Number(position.latitude).toFixed(5)}${t('posField_unitDegree')}` : null },
    { key: 'lng', i18n: 'posField_longitude', value: position.longitude != null ? `${Number(position.longitude).toFixed(5)}${t('posField_unitDegree')}` : null },
    { key: 'altitude', i18n: 'posField_altitude', value: position.altitude != null ? `${position.altitude} ${t('posField_unitM')}` : null },
    { key: 'speed', i18n: 'posField_speed', value: position.speed != null ? `${Math.round(Number(position.speed) * 1.852)} ${t('posField_unitKmh')}` : null },
    { key: 'course', i18n: 'posField_course', value: position.course != null ? `${position.course}${t('posField_unitDegree')}` : null },
    { key: 'address', i18n: 'posField_address', value: position.address || null },
    { key: 'accuracy', i18n: 'posField_accuracy', value: position.accuracy != null ? `${position.accuracy} ${t('posField_unitM')}` : null },
  ];

  const attrFields = Object.entries(attr)
    .filter(([k]) => !SKIP_ATTR_KEYS.has(k))
    .map(([k, v]) => ({
      key: k,
      i18n: ATTR_TO_I18N_KEY[k] || k,
      value: renderPositionValue(t, k, v),
      isEditable: k === 'hours' || k === 'totalDistance',
    }));

  const allFields = [...knownFields, ...attrFields].filter((f) => f.value != null);

  const renderField = (f: { key: string; i18n: string; value: string | null; mono?: boolean; isEditable?: boolean }) => (
    <div key={f.key} className="rounded-lg border border-border bg-muted/20 p-3 relative group">
      <div className="text-[10px] font-medium uppercase text-muted-foreground">{t(f.i18n)}</div>
      <div className={`mt-1 flex items-center gap-1.5 truncate text-sm font-medium ${f.mono ? 'font-mono' : ''}`}>
        <span className="truncate">{f.value}</span>
        {f.isEditable && (
          <button
            onClick={openAccEditor}
            className="shrink-0 ml-auto opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted-foreground/20"
            title={t('posField_edit')}
          >
            <svg className="h-3.5 w-3.5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  );

  if (allFields.length === 0) return null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t('positionData')}</CardTitle>
          <CardDescription>{t('positionDataDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {allFields.map((f) => renderField(f))}
        </CardContent>
      </Card>

      {accEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setAccEditOpen(false)}>
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-4">{t('posField_editAccumulators')}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">{t('posField_editHours')}</label>
                <input type="number" step="0.1" value={editHours}
                  onChange={(e) => setEditHours(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">{t('posField_editDistance')}</label>
                <input type="number" step="0.01" value={editDistance}
                  onChange={(e) => setEditDistance(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary" />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setAccEditOpen(false)}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">
                {t('posField_cancel')}
              </button>
              <button onClick={saveAccumulators} disabled={accSaving}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {accSaving ? t('saving') : t('posField_save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
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
        contact: form.contact || undefined,
        category: form.category || undefined,
        phone: form.phone || undefined,
        calendarId: form.calendarId ? Number(form.calendarId) : null,
        disabled: form.disabled === 'true',
        expirationTime: form.expirationTime || null,
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
        <Stat label={t('odometer')} value={v.odometer != null ? `${Number(v.odometer).toLocaleString()} ${t('posField_unitKm')}` : '—'} />
        <Stat label={t('fuel')} value={typeof v.fuel === 'number' ? `${v.fuel}%` : '—'} />
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
                <Kv label={t('speed')} value={`${v.speed} ${t('unitKmh')}`} />
                <Kv label={t('ignition')} value={v.ignition ? t('on') : t('off')} />
                <Kv label={t('location')} value={latOk ? `${Number(v.lat).toFixed(4)}, ${Number(v.lng).toFixed(4)}` : '—'} />
                <Kv label={t('vin')} value={v.vin} mono />
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
          {v._raw?.position && <div className="mt-4"><PositionDataCard position={v._raw.position} deviceId={v.id} /></div>}
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
          <Card><CardHeader><CardTitle>{t('reportedFuel')}</CardTitle><CardDescription>{t('last90days')}</CardDescription></CardHeader>
            <CardContent>
              {!fuelSummary ? <EmptyState title={t('noFuelData')} description={t('fuelDataDesc')} />
              : <div className="grid gap-3 md:grid-cols-3">
                <Kv label={t('spentFuel')} value={fuelSummary?.spentFuel != null ? `${Math.round(Number(fuelSummary.spentFuel) * 10) / 10} ${t('fuelUnitL')}` : '—'} />
                <Kv label={t('distanceKm')} value={fuelSummary?.distance != null ? `${(Number(fuelSummary.distance) / 1000).toFixed(1)} km` : '—'} />
                <Kv label={t('engineHours')} value={fuelSummary?.engineHours != null ? (() => {
                  let n = Number(fuelSummary.engineHours);
                  if (!Number.isFinite(n)) return String(fuelSummary.engineHours);
                  if (n > 100000) n = n / 3600000;
                  const h = Math.floor(n);
                  const m = Math.round((n - h) * 60);
                  return m > 0 ? `${h} ${t('posField_unitH')} ${m} ${t('posField_unitMin')}` : `${h} ${t('posField_unitH')}`;
                })() : '—'} />
              </div>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {editOpen && v?._raw?.device && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setEditOpen(false)}>
          <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">{t('editVehicle')}</h3>
            <VehicleForm device={v._raw.device} onSave={() => { setEditOpen(false); refresh(); }} onCancel={() => setEditOpen(false)} />
          </div>
        </div>
      )}
      <ConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} title={t('deleteDeviceTitle')} description={t('deleteDevicePermanent')} confirmLabel={t('delete')} onConfirm={handleDelete} destructive />
    </div>
  );
}
