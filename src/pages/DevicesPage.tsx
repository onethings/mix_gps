import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Download, Pencil, Plus, Search, Settings, Share2, Trash2, Upload,
  Smartphone, Battery, Signal, Cpu, ExternalLink, CalendarDays,
} from 'lucide-react';
import PageHeader from '@/components/common/PageHeader';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import StatusBadge from '@/components/common/StatusBadge';
import EmptyState from '@/components/common/EmptyState';
import VehicleForm from '@/components/vehicles/VehicleForm';
import ShareDialog from '@/components/common/ShareDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useLiveData } from '@/context/LiveDataContext';
import { useSession } from '@/context/SessionContext';
import { useFlash } from '@/context/FlashContext';
import { api } from '@/lib/api';
import { formatDate, cn } from '@/lib/utils';
import { downloadCsv, parseCsv } from '@/lib/csv';
import { useShareLinks } from '@/hooks/useShareLinks';
import { useT } from '@/lib/i18n';

/* ── Hardware helpers ── */
function protocolLabel(device) {
  const p = device.protocol || device.attributes?.protocol || '';
  return p ? p.toUpperCase() : null;
}
function batteryLevel(device) {
  const v = device.attributes?.batteryLevel;
  return v != null ? Number(v) : null;
}
function signalStrength(device) {
  const v = device.attributes?.signal;
  return v != null ? Number(v) : null;
}
function firmwareVersion(device) {
  return device.attributes?.firmwareVersion || device.attributes?.version || null;
}

export default function DevicesPage() {
  const { t } = useT();
  const { user } = useSession();
  const { vehicles, devices: rawDevices, refresh, error: liveError } = useLiveData();
  const { showError, showSuccess } = useFlash();

  /* ── Vehicle fleet state (from VehiclesPage) ── */
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [deleteName, setDeleteName] = useState('');
  const [q, setQ] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);
  const { activeShares } = useShareLinks(user?.id);

  /* ── Derived data ── */
  const deviceList = useMemo(() => Array.isArray(rawDevices) ? rawDevices : [], [rawDevices]);

  // Build device lookup map for hardware info
  const deviceMap = useMemo(() => {
    const map = {};
    deviceList.forEach((d) => { map[d.id] = d; });
    return map;
  }, [deviceList]);

  // Filter vehicles by search (name, plate, driver, IMEI, phone)
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return vehicles;
    return vehicles.filter((v) => {
      const d = deviceMap[v.id];
      return (
        v.name.toLowerCase().includes(needle) ||
        String(v.plate).toLowerCase().includes(needle) ||
        String(v.driver).toLowerCase().includes(needle) ||
        (d?.uniqueId || '').toLowerCase().includes(needle) ||
        (d?.phone || '').toLowerCase().includes(needle)
      );
    });
  }, [vehicles, deviceMap, q]);

  /* ── Online/offline status (calculated from lastUpdate) ── */
  const isOnline = (v) => {
    const d = deviceMap[v.id];
    if (!d?.lastUpdate) return false;
    return Date.now() - new Date(d.lastUpdate).getTime() < 5 * 60 * 1000;
  };

  /* ── Fleet stats ── */
  const stats = useMemo(() => {
    let online = 0, moving = 0, idle = 0, stopped = 0, alert = 0;
    vehicles.forEach((v) => {
      if (v.status === 'alert') alert++;
      else if (v.status === 'moving') { moving++; online++; }
      else if (v.status === 'idle') { idle++; online++; }
      else if (v.status === 'stopped') { stopped++; online++; }
      else if (isOnline(v)) online++;
    });
    return { total: vehicles.length, online, offline: vehicles.length - online, moving, idle, stopped, alert };
  }, [vehicles, isOnline]);

  /* ── CRUD ── */
  const persistDevice = async (form, deviceId) => {
    const gid = form.groupId?.trim();
    const groupIdParsed = gid ? Number(gid) : null;
    if (deviceId) {
      const current = await api.devices.get(deviceId);
      await api.devices.update(deviceId, {
        ...current, name: form.name.trim(), uniqueId: current.uniqueId,
        model: form.model || '',
        groupId: Number.isFinite(groupIdParsed) ? groupIdParsed : current.groupId ?? null,
        category: form.iconType || current.category || null,
        attributes: { ...(current.attributes || {}), plate: form.plate, vin: form.vin },
      });
    } else {
      const uid = form.uniqueId.trim() || form.plate.trim() || `device-${Date.now()}`;
      await api.devices.create({
        name: form.name.trim(), uniqueId: uid, model: form.model || '',
        ...(Number.isFinite(groupIdParsed) ? { groupId: groupIdParsed } : {}),
        category: form.iconType || null,
        attributes: { plate: form.plate, vin: form.vin },
      });
    }
  };

  const submitVehicle = async (form) => {
    try {
      await persistDevice(form, editing?._raw?.device?.id ?? null);
      showSuccess(editing ? 'Device updated' : 'Device created');
      await refresh();
      setEditing(null);
    } catch (err) { showError(err.message || t('saveFailed')); throw err; }
  };

  const handleDelete = async () => {
    if (deleteId == null) return;
    setDeleting(true);
    try {
      await api.devices.remove(deleteId);
      showSuccess('Device deleted');
      await refresh();
      setDeleteId(null);
    } catch (err) { showError(err.message || t('deleteFailed')); throw err; }
    finally { setDeleting(false); }
  };

  /* ── CSV ── */
  const exportDevices = () => {
    downloadCsv(`devices-${new Date().toISOString().slice(0, 10)}.csv`,
      [{ key: 'name', label: t('name') }, { key: 'plate', label: t('plate') }, { key: 'model', label: t('model') },
       { key: 'category', label: t('category') }, { key: 'phone', label: t('phone') }, { key: 'status', label: t('status') },
       { key: 'driver', label: t('driver') }, { key: 'group', label: t('group') },
       { key: 'speed', label: t('speed') }, { key: 'odometer', label: t('odometer') },
       { key: 'lat', label: 'Latitude' }, { key: 'lng', label: 'Longitude' },
       { key: 'address', label: t('address') }, { key: 'lastUpdate', label: t('lastUpdate') }],
      vehicles);
    showSuccess('CSV downloaded');
  };

  const downloadSampleCsv = () => {
    downloadCsv(`device-import-template.csv`,
      [{ key: 'name', label: 'Name' }, { key: 'uniqueId', label: 'Unique ID' }, { key: 'plate', label: 'Plate' },
       { key: 'model', label: 'Model' }, { key: 'phone', label: 'Phone' }, { key: 'contact', label: 'Contact' },
       { key: 'category', label: 'Category' }, { key: 'groupId', label: 'Group ID' }],
      [
        { name: '配送貨車 A', uniqueId: '861234567890123', plate: 'ABC-1234', model: 'Toyota HiAce', phone: '09123456789', contact: '王小明', category: 'van', groupId: '1' },
        { name: '物流卡車 B', uniqueId: '861234567890124', plate: 'XYZ-5678', model: 'Scania R500', phone: '09123456788', contact: '李大華', category: 'truck', groupId: '2' },
        { name: '業務轎車 C', uniqueId: '861234567890125', plate: 'QWE-9012', model: 'Toyota Camry', phone: '09123456787', contact: '陳小美', category: 'car', groupId: '' },
      ]);
    showSuccess('Sample CSV downloaded');
  };

  const handleImportCsv = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length === 0) { showError('CSV file is empty or invalid'); return; }
      let created = 0, skipped = 0;
      for (const row of rows) {
        const name = (row.Name || row.name || '').trim();
        const uniqueId = (row['Unique ID'] || row.uniqueId || row.unique_id || row.IMEI || row.imei || '').trim();
        if (!name && !uniqueId) { skipped++; continue; }
        const category = (row.Category || row.category || '').trim().toLowerCase();
        try {
          await api.devices.create({
            name: name || uniqueId, uniqueId: uniqueId || `import-${Date.now()}-${created}`,
            model: (row.Model || row.model || '').trim(), phone: (row.Phone || row.phone || '').trim(),
            contact: (row.Contact || row.contact || '').trim(), category: category || null,
            attributes: { plate: (row.Plate || row.plate || '').trim(), vin: (row.VIN || row.vin || '').trim() },
          });
          created++;
        } catch { skipped++; }
      }
      await refresh();
      showSuccess(`Imported ${created} device(s)` + (skipped > 0 ? `, ${skipped} skipped` : ''));
    } catch (err) { showError(err.message || 'CSV import failed'); }
    finally { setImporting(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      {liveError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {liveError.message || t('failedToLoad')}
        </div>
      )}

      {/* ── Page header ── */}
      <PageHeader
        title={t('devicesTitle')}
        description={`${vehicles.length} ${t('devicesFromAccount')}`}
        actions={
          <>
            <Button variant="outline" size="sm" type="button" onClick={() => setShareOpen(true)}>
              <Share2 className="h-4 w-4" /> {t('share')}
            </Button>
            <Button variant="outline" size="sm" type="button" onClick={() => fileInputRef.current?.click()} disabled={importing}>
              <Upload className="h-4 w-4" /> {importing ? t('importing') || 'Importing…' : t('import')}
            </Button>
            <Button variant="ghost" size="sm" type="button" onClick={downloadSampleCsv} title={t('downloadSampleCsv')}>
              <Download className="h-4 w-4" /> {t('sampleCsv')}
            </Button>
            <Button variant="outline" size="sm" type="button" onClick={exportDevices}>
              <Download className="h-4 w-4" /> {t('export')}
            </Button>
            <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
              <Plus className="h-4 w-4" /> {t('addVehicle')}
            </Button>
          </>
        }
      />
      <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleImportCsv} />

      {/* ── Active Shares Banner ── */}
      {activeShares.length > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Share2 className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-foreground">{t('sharedVehicles')}</span>
                <Badge variant="secondary" className="text-xs">{activeShares.length}</Badge>
              </div>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShareOpen(true)}>
                {t('share')}
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {activeShares.map((share) =>
                share.vehicles?.map((v) => (
                  <Badge key={`${share.id}-${v.id}`} variant="outline" className="flex items-center gap-1 text-xs">
                    {v.plate || v.name}
                    <span className="text-muted-foreground">·</span>
                    {new Date(share.expiresAt) > new Date()
                      ? <span className="text-success">{t('active')}</span>
                      : <span className="text-destructive">{t('expired')}</span>}
                  </Badge>
                )),
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Fleet stats cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {[
          { label: t('totalVehicles'), value: stats.total, color: '' },
          { label: t('online'), value: stats.online, color: 'text-green-600' },
          { label: t('offline'), value: stats.offline, color: 'text-muted-foreground' },
          { label: t('moving'), value: stats.moving, color: 'text-blue-600' },
          { label: t('idle'), value: stats.idle, color: 'text-amber-600' },
          { label: t('stopped'), value: stats.stopped, color: 'text-muted-foreground' },
          { label: t('alert'), value: stats.alert, color: 'text-destructive' },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-3 text-center">
              <div className={`text-lg font-bold tabular-nums ${s.color}`}>{s.value}</div>
              <div className="text-[10px] font-medium uppercase text-muted-foreground">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Search ── */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, plate, driver, IMEI, or phone…"
          className="h-10 w-full pl-10"
        />
      </div>

      {/* ── Fleet table ── */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Smartphone}
          title={vehicles.length === 0 ? t('noDevicesAssigned') : t('noData')}
          description={vehicles.length === 0 ? t('signInToSee') : ''}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('vehicle')}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('status')}</th>
                  <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:table-cell">{t('driver')}</th>
                  <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground md:table-cell">{t('group')}</th>
                  <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:table-cell">Fuel</th>
                  <th className="hidden px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:table-cell">{t('odometer')}</th>
                  <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground xl:table-cell">IMEI</th>
                  <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground xl:table-cell">Signal</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('lastUpdate')}</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('management')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((v) => {
                  const d = deviceMap[v.id];
                  const batt = d ? batteryLevel(d) : null;
                  const signal = d ? signalStrength(d) : null;
                  const fw = d ? firmwareVersion(d) : null;
                  const proto = d ? protocolLabel(d) : null;

                  return (
                    <tr key={v.id} className="transition-colors hover:bg-muted/30">
                      {/* Vehicle name + model/plate + firmware */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            'flex h-9 w-9 items-center justify-center rounded-lg',
                            v.status === 'moving' ? 'bg-blue-500/10' :
                            v.status === 'alert' ? 'bg-destructive/10' :
                            v.status === 'idle' ? 'bg-amber-500/10' :
                            v.status === 'stopped' ? 'bg-muted' : 'bg-muted',
                          )}>
                            <Smartphone className={cn(
                              'h-4 w-4',
                              v.status === 'moving' ? 'text-blue-500' :
                              v.status === 'alert' ? 'text-destructive' :
                              v.status === 'idle' ? 'text-amber-500' :
                              'text-muted-foreground',
                            )} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <Link
                                to={`/devices/${v.id}`}
                                className="font-medium truncate max-w-[180px] hover:text-primary transition-colors"
                              >
                                {v.name}
                              </Link>
                              {d?.disabled && <Badge variant="secondary" className="text-[10px] px-1 py-0">Disabled</Badge>}
                            </div>
                            <p className="flex items-center gap-2 text-xs text-muted-foreground">
                              {v.model && <span>{v.model}</span>}
                              {v.plate && <span>· {v.plate}</span>}
                              {fw && (
                                <span className="flex items-center gap-0.5">
                                  <Cpu className="h-3 w-3" /> {fw}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <StatusBadge status={v.status} />
                        {batt != null && (
                          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Battery className="h-3 w-3" />
                            <span>{batt}%</span>
                          </div>
                        )}
                      </td>

                      {/* Driver */}
                      <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">{v.driver || '—'}</td>

                      {/* Group */}
                      <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                        {v.group ? <Badge variant="outline" className="text-[10px]">{v.group}</Badge> : '—'}
                      </td>

                      {/* Fuel */}
                      <td className="hidden px-4 py-3 lg:table-cell">
                        {typeof v.fuel === 'number' ? (
                          <div className="flex items-center gap-2">
                            <Progress value={v.fuel} className="w-14" />
                            <span className="text-xs tabular-nums">{v.fuel}%</span>
                          </div>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </td>

                      {/* Odometer */}
                      <td className="hidden px-4 py-3 text-right tabular-nums lg:table-cell">
                        {v.odometer != null ? `${Number(v.odometer).toLocaleString()} mi` : '—'}
                      </td>

                      {/* IMEI */}
                      <td className="hidden px-4 py-3 font-mono text-xs text-muted-foreground xl:table-cell">
                        {d?.uniqueId || '—'}
                      </td>

                      {/* Signal */}
                      <td className="hidden px-4 py-3 xl:table-cell">
                        {signal != null ? (
                          <div className="flex items-center gap-1.5">
                            <Signal className={cn(
                              'h-3.5 w-3.5',
                              signal > 70 ? 'text-green-500' : signal > 30 ? 'text-amber-500' : 'text-red-500',
                            )} />
                            <span className="font-mono text-xs">{signal}%</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {proto ? <Badge variant="outline" className="font-mono text-[10px]">{proto}</Badge> : '—'}
                          </span>
                        )}
                      </td>

                      {/* Last Update */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <CalendarDays className="hidden h-3 w-3 text-muted-foreground sm:block" />
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {v.lastUpdate ? formatDate(v.lastUpdate) : '—'}
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" type="button" asChild>
                            <Link to={`/devices/${v.id}`}>
                              {t('open')} <ExternalLink className="ml-1 h-3 w-3" />
                            </Link>
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8" type="button"
                            onClick={() => { setEditing(v); setOpen(true); }} title={t('edit')}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" type="button"
                            onClick={() => { setDeleteId(v.id); setDeleteName(v.name); }} title={t('delete')}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer stats */}
          <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              {filtered.length} / {vehicles.length} {t('devices')}
            </span>
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" />{stats.moving} moving</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" />{stats.idle} idle</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-muted-foreground/40" />{stats.offline} offline</span>
            </span>
          </div>
        </div>
      )}

      {/* ── Delete confirmation ── */}
      <ConfirmDialog
        open={deleteId != null}
        onOpenChange={(o) => { if (!o) setDeleteId(null); }}
        onConfirm={handleDelete}
        title={t('deleteDeviceTitle')}
        description={`${t('deleteDevicePermanent')}\n"${deleteName}"`}
      />

      {/* ── Vehicle form (add / edit) ── */}
      {open && <VehicleForm
        device={editing?._raw?.device}
        onSave={() => submitVehicle(editing?._raw?.device)}
        onCancel={() => setOpen(false)}
      />}

      {/* ── Share dialog ── */}
      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} vehicles={vehicles} />
    </div>
  );
}
