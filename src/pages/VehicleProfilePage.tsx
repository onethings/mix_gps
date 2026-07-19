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
import { Badge } from '@/components/ui/badge';
import EmptyState from '@/components/common/EmptyState';
import { formatCurrency, formatDate, formatDistance, formatDuration } from '@/lib/utils';
import { useLiveData } from '@/context/LiveDataContext';
import { useFlash } from '@/context/FlashContext';
import { api } from '@/lib/api';
import type { TraccarPosition } from '@/types';
import { toMaintenance } from '@/lib/transformers';
import { useTripsReport } from '@/hooks/useTripsReport';
import { useT } from '@/lib/i18n';
import { reverseGeocode } from '@/lib/geocode';

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-[11px] font-medium uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-base font-semibold">{value}</div>
    </CardContent></Card>
  );
}

function StatAction({ label, value, onEdit }: { label: string; value: React.ReactNode; onEdit: () => void }) {
  return (
    <Card className="cursor-pointer hover:border-primary/40 transition-colors" onClick={onEdit}>
      <CardContent className="p-4 relative">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-medium uppercase text-muted-foreground">{label}</div>
          <span className="shrink-0 p-0.5 rounded text-muted-foreground/40" title="Edit accumulators">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </span>
        </div>
        <div className="mt-1 truncate text-base font-semibold">{value}</div>
      </CardContent>
    </Card>
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
function KvCopy({ label, value, copyValue }: { label: string; value: React.ReactNode; copyValue: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div onClick={async () => {
      try { await navigator.clipboard.writeText(copyValue); setCopied(true); setTimeout(() => setCopied(false), 1500); }
      catch { /* clipboard not available */ }
    }} className="rounded-lg border border-border bg-muted/20 p-3 cursor-pointer hover:border-primary/40 transition-colors relative group">
      <div className="text-[10px] font-medium uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-center gap-1.5 truncate text-sm font-medium">
        <span className="truncate">{copied ? 'Copied!' : value}</span>
        <span className="shrink-0 ml-auto p-0.5 rounded text-muted-foreground/40" title="Copy coordinates">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        </span>
      </div>
    </div>
  );
}
function KvWithAction({ label, value, onEdit }: { label: string; value: React.ReactNode; onEdit: () => void }) {
  return (
    <div onClick={onEdit} className="rounded-lg border border-border bg-muted/20 p-3 relative group cursor-pointer hover:border-primary/40 transition-colors">
      <div className="text-[10px] font-medium uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-center gap-1.5 truncate text-sm font-medium">
        <span className="truncate">{value}</span>
        <span className="shrink-0 ml-auto p-0.5 rounded text-muted-foreground/40" title="Edit accumulators">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </span>
      </div>
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
    // Traccar always stores hours in milliseconds — divide by 3600000
    n = n / 3600000;
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
  const [locationPopupOpen, setLocationPopupOpen] = useState(false);

  const openAccEditor = () => {
    // Pre-fill from existing position attributes — no fetch needed
    const rawHours = attr.hours;
    const rawDistance = attr.totalDistance;
    if (rawHours != null) {
      let n = Number(rawHours);
      if (!Number.isFinite(n)) { setEditHours('0'); } else {
        n = n / 3600000;
        setEditHours(n.toFixed(1));
      }
    } else { setEditHours('0'); }
    if (rawDistance != null) {
      const n = Number(rawDistance);
      setEditDistance(Number.isFinite(n) ? (n / 1000).toFixed(1) : '0');
    } else { setEditDistance('0'); }
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

  // Always include hours & totalDistance cards even if position attributes lack them
  const forcedFields: { key: string; i18n: string; value: string; isEditable: true }[] = [];
  if (!attrFields.some((f) => f.key === 'hours')) {
    forcedFields.push({
      key: 'hours',
      i18n: ATTR_TO_I18N_KEY['hours'],
      value: renderPositionValue(t, 'hours', 0) ?? '0 h',
      isEditable: true,
    });
  }
  if (!attrFields.some((f) => f.key === 'totalDistance')) {
    forcedFields.push({
      key: 'totalDistance',
      i18n: ATTR_TO_I18N_KEY['totalDistance'],
      value: renderPositionValue(t, 'totalDistance', 0) ?? '0 km',
      isEditable: true,
    });
  }

  const allFields = [...knownFields, ...attrFields, ...forcedFields].filter((f) => f.value != null);

  // Combined location field (replaces separate lat/lng)
  const locationStr = position.latitude != null && position.longitude != null
    ? `${Number(position.latitude).toFixed(5)}${t('posField_unitDegree')}, ${Number(position.longitude).toFixed(5)}${t('posField_unitDegree')}`
    : null;

  const renderField = (f: { key: string; i18n: string; value: string | null; mono?: boolean; isEditable?: boolean }) => {
    const editable = f.isEditable;
    return (
    <div key={f.key}
      onClick={editable ? openAccEditor : undefined}
      className={`rounded-lg border border-border bg-muted/20 p-3 relative group ${editable ? 'cursor-pointer hover:border-primary/40 transition-colors' : ''}`}>
      <div className="text-[10px] font-medium uppercase text-muted-foreground">{t(f.i18n)}</div>
      <div className={`mt-1 flex items-center gap-1.5 truncate text-sm font-medium ${f.mono ? 'font-mono' : ''}`}>
        <span className="truncate">{f.value}</span>
        {editable && (
          <span className="shrink-0 ml-auto p-0.5 rounded text-muted-foreground/40" title={t('posField_edit')}>
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </span>
        )}
      </div>
    </div>
    );
  };

  if (allFields.length === 0) return null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t('positionData')}</CardTitle>
          <CardDescription>{t('positionDataDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {/* Combined location card */}
          {locationStr && (
            <div onClick={() => setLocationPopupOpen(true)} className="rounded-lg border border-border bg-muted/20 p-3 cursor-pointer hover:border-primary/40 transition-colors relative group">
              <div className="text-[10px] font-medium uppercase text-muted-foreground">{t('posField_latitude')} / {t('posField_longitude')}</div>
              <div className="mt-1 flex items-center gap-1.5 truncate text-sm font-medium">
                <span className="truncate font-mono">{locationStr}</span>
                <span className="shrink-0 ml-auto p-0.5 rounded text-muted-foreground/40">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                </span>
              </div>
            </div>
          )}
          {allFields.map((f) => renderField(f))}
        </CardContent>
      </Card>

      {/* Location action popup */}
      {locationPopupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setLocationPopupOpen(false)}>
          <div className="w-64 rounded-xl border border-border bg-card p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-3">{t('posField_latitude')} / {t('posField_longitude')}</h3>
            <div className="space-y-1.5">
              <button onClick={async () => {
                try {
                  await navigator.clipboard.writeText(`${position.latitude},${position.longitude}`);
                  setLocationPopupOpen(false);
                } catch {}
              }} className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-muted transition-colors">
                <svg className="h-4 w-4 text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                Copy coordinates
              </button>
              <a href={`https://www.google.com/maps/search/?api=1&query=${position.latitude}%2C${position.longitude}`} target="_blank" rel="noopener noreferrer"
                onClick={() => setLocationPopupOpen(false)}
                className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-muted transition-colors no-underline text-foreground">
                <svg className="h-4 w-4 text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                Google Maps
              </a>
              <a href={`https://maps.apple.com/?ll=${position.latitude},${position.longitude}`} target="_blank" rel="noopener noreferrer"
                onClick={() => setLocationPopupOpen(false)}
                className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-muted transition-colors no-underline text-foreground">
                <svg className="h-4 w-4 text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
                Apple Maps
              </a>
            </div>
          </div>
        </div>
      )}

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

  // Accumulator editor state (shared with PositionDataCard & Fuel tab)
  const [fuelAccEditOpen, setFuelAccEditOpen] = useState(false);
  const [fuelAccSaving, setFuelAccSaving] = useState(false);
  const [fuelEditHours, setFuelEditHours] = useState('');
  const [fuelEditDistance, setFuelEditDistance] = useState('');

  const deviceIds = useMemo(() => (v ? [v.id] : []), [v]);
  const nameByDeviceId = useMemo(() => (v ? { [v.id]: v.name } : {}), [v]);
  const fromIso = useMemo(() => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), []);
  const toIso = useMemo(() => new Date().toISOString(), []);

  const { trips: vehicleTrips, loading: tripsLoading } = useTripsReport({ deviceIds, fromIso, toIso, nameByDeviceId });

  const [maintAll, setMaintAll] = useState<any[]>([]);
  const [fuelSummary, setFuelSummary] = useState<Record<string, unknown> | null>(null);
  const [maintLoadError, setMaintLoadError] = useState<string | null>(null);
  const [fuelLoadError, setFuelLoadError] = useState<string | null>(null);
  const [geoAddresses, setGeoAddresses] = useState<Record<string, string>>({});

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

  // Reverse geocode trip start/end coordinates to addresses
  useEffect(() => {
    const coordPattern = /^-?\d+\.\d+/;
    const pending: { key: string; lat: number; lng: number }[] = [];
    vehicleTrips.forEach((trip: any) => {
      if (trip.startLat != null && trip.startLon != null && coordPattern.test(String(trip.from || ''))) {
        const key = `${Number(trip.startLat).toFixed(5)},${Number(trip.startLon).toFixed(5)}`;
        if (!geoAddresses[key]) pending.push({ key, lat: trip.startLat, lng: trip.startLon });
      }
      if (trip.endLat != null && trip.endLon != null && coordPattern.test(String(trip.to || ''))) {
        const key = `${Number(trip.endLat).toFixed(5)},${Number(trip.endLon).toFixed(5)}`;
        if (!geoAddresses[key]) pending.push({ key, lat: trip.endLat, lng: trip.endLon });
      }
    });
    if (pending.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const p of pending) {
        if (cancelled) break;
        const addr = await reverseGeocode(p.lat, p.lng);
        if (addr && !cancelled) {
          setGeoAddresses((prev) => ({ ...prev, [p.key]: addr }));
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleTrips]);

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
    return (<div className="space-y-2 md:space-y-4">
      <Button variant="ghost" size="sm" asChild className="w-fit -ml-2"><Link to="/devices"><ArrowLeft className="h-4 w-4" /> {t('devices')}</Link></Button>
      <EmptyState title={t('vehicleNotFound')} description={t('vehicleNotFoundDesc')} />
    </div>);
  }

  const latOk = v.lat != null && v.lng != null;

  return (
    <div className="space-y-3 md:space-y-5">
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
        <StatAction label={t('odometer')} value={v.odometer != null ? `${Number(v.odometer).toLocaleString()} ${t('posField_unitKm')}` : '—'}
          onEdit={() => {
            const rawDist = v?._raw?.position?.attributes?.totalDistance;
            const n = rawDist != null ? Number(rawDist) : 0;
            setFuelEditDistance(Number.isFinite(n) ? (n / 1000).toFixed(1) : '0');
            const rawHours = v?._raw?.position?.attributes?.hours;
            let h = rawHours != null ? Number(rawHours) : 0;
            if (!Number.isFinite(h)) h = 0; else h = h / 3600000;
            setFuelEditHours(h.toFixed(1));
            setFuelAccEditOpen(true);
          }} />
        <Stat label={t('fuel')} value={typeof v.fuel === 'number' ? `${v.fuel}%` : '—'} />
        <Stat label={t('lastUpdate')} value={formatDate(v.lastUpdate)} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="overflow-x-auto flex-nowrap max-md:gap-0">
          <TabsTrigger value="overview">{t('overview')}</TabsTrigger>
          <TabsTrigger value="trips">{t('trips')}</TabsTrigger>
          <TabsTrigger value="maintenance">{t('maintenance')}</TabsTrigger>
          <TabsTrigger value="fuel">{t('fuelHistory')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-2 lg:gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle>{t('telemetry')}</CardTitle><CardDescription>{t('mostRecentReadings')}</CardDescription></CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <Kv label={t('speed')} value={`${v.speed} ${t('unitKmh')}`} />
                <Kv label={t('ignition')} value={v.ignition ? t('on') : t('off')} />
                <KvCopy label={t('location')} value={latOk ? `${Number(v.lat).toFixed(4)}, ${Number(v.lng).toFixed(4)}` : '—'} copyValue={latOk ? `${v.lat},${v.lng}` : ''} />
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
          {tripsLoading ? <div className="p-6 text-sm text-muted-foreground">{t('loading')}</div>
          : vehicleTrips.length === 0 ? <Card><CardContent className="p-6"><EmptyState title={t('noTrips30d')} /></CardContent></Card>
          : <div className="space-y-2">
            {[...vehicleTrips].reverse().map((trip: any, idx: number) => {
              const num = vehicleTrips.length - idx;
              const startDate = trip.startTime ? new Date(trip.startTime) : null;
              const dateLabel = startDate ? startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
              const timeLabel = startDate ? startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—';
              // Use geocoded address if available, fallback to original label
              const startKey = trip.startLat != null ? `${Number(trip.startLat).toFixed(5)},${Number(trip.startLon).toFixed(5)}` : null;
              const endKey = trip.endLat != null ? `${Number(trip.endLat).toFixed(5)},${Number(trip.endLon).toFixed(5)}` : null;
              const fromLabel = (startKey && geoAddresses[startKey]) || trip.from || '—';
              const toLabel = (endKey && geoAddresses[endKey]) || trip.to || '—';
              return (
              <Card key={trip.id} className="overflow-hidden">
                <CardContent className="p-0">
                  {/* Trip header */}
                  <div className="flex items-center gap-3 bg-muted/40 px-4 py-2.5 border-b border-border">
                    <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
                      {num}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-foreground">{dateLabel} · {timeLabel}</div>
                      <div className="text-[10px] text-muted-foreground">{t('tripId')}: #{trip.id.slice(-8)}</div>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-mono">{formatDuration(trip.duration)}</Badge>
                  </div>
                  {/* Route */}
                  <div className="px-4 py-2.5 border-b border-border flex items-start gap-2">
                    <div className="flex flex-col items-center gap-0.5 mt-0.5">
                      <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                      <div className="w-0.5 h-5 bg-border shrink-0" />
                      <div className="w-2 h-2 rounded-full bg-destructive shrink-0" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium truncate">{fromLabel}</div>
                      <div className="text-xs text-muted-foreground truncate">{toLabel}</div>
                    </div>
                  </div>
                  {/* Stats */}
                  <div className="grid grid-cols-4 divide-x divide-border text-center">
                    <div className="py-2 px-1">
                      <div className="text-xs font-semibold tabular-nums">{formatDistance(trip.distance)}</div>
                      <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{t('distanceKm')}</div>
                    </div>
                    <div className="py-2 px-1">
                      <div className="text-xs font-semibold tabular-nums">{trip.avgSpeed || '—'}</div>
                      <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{t('avgSpeed')}</div>
                    </div>
                    <div className="py-2 px-1">
                      <div className="text-xs font-semibold tabular-nums">{trip.maxSpeed || '—'}</div>
                      <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{t('maxSpeed')}</div>
                    </div>
                    <div className="py-2 px-1">
                      <div className="text-xs font-semibold tabular-nums">{trip.fuelUsed != null ? `${trip.fuelUsed.toFixed(1)}L` : '—'}</div>
                      <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{t('fuel')}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              );
            })}
          </div>}
        </TabsContent>

        <TabsContent value="maintenance">
          {maintLoadError && <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{maintLoadError}</div>}
          {vehicleWOs.length === 0 ? <Card><CardContent className="p-6"><EmptyState title={t('noMaintenanceRows')} /></CardContent></Card>
          : <>
            {/* Desktop table */}
            <Card className="max-md:hidden"><CardContent className="p-0">
              <Table><TableHeader><TableRow>
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
              </TableBody></Table>
            </CardContent></Card>
            {/* Mobile cards */}
            <div className="space-y-2 md:hidden">
              {vehicleWOs.map((w) => (
                <Card key={w.id} className="overflow-hidden">
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{w.title}</div>
                        <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{w.id}</div>
                      </div>
                      <StatusBadge status={w.status} />
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span>{t('due')}: {w.dueDate}</span>
                      {w.cost != null && <span>{t('cost')}: {formatCurrency(w.cost)}</span>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>}
        </TabsContent>

        <TabsContent value="fuel">
          {fuelLoadError && <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{fuelLoadError}</div>}
          <Card><CardHeader><CardTitle>{t('reportedFuel')}</CardTitle><CardDescription>{t('last90days')}</CardDescription></CardHeader>
            <CardContent>
              {!fuelSummary ? <EmptyState title={t('noFuelData')} description={t('fuelDataDesc')} />
              : <div className="grid gap-3 md:grid-cols-3">
                <Kv label={t('spentFuel')} value={fuelSummary?.spentFuel != null ? `${Math.round(Number(fuelSummary.spentFuel) * 10) / 10} ${t('fuelUnitL')}` : '—'} />
                <KvWithAction label={t('distanceKm')} value={fuelSummary?.distance != null ? `${(Number(fuelSummary.distance) / 1000).toFixed(1)} km` : '—'}
                  onEdit={() => {
                    const rawDist = v?._raw?.position?.attributes?.totalDistance;
                    const n = rawDist != null ? Number(rawDist) : 0;
                    setFuelEditDistance(Number.isFinite(n) ? (n / 1000).toFixed(1) : '0');
                    const rawHours = v?._raw?.position?.attributes?.hours;
                    let h = rawHours != null ? Number(rawHours) : 0;
                    if (!Number.isFinite(h)) h = 0; else h = h / 3600000;
                    setFuelEditHours(h.toFixed(1));
                    setFuelAccEditOpen(true);
                  }} />
                <KvWithAction label={t('engineHours')} value={fuelSummary?.engineHours != null ? (() => {
                  let n = Number(fuelSummary.engineHours);
                  if (!Number.isFinite(n)) return String(fuelSummary.engineHours);
                  if (n > 100000) n = n / 3600000;
                  const h = Math.floor(n);
                  const m = Math.round((n - h) * 60);
                  return m > 0 ? `${h} ${t('posField_unitH')} ${m} ${t('posField_unitMin')}` : `${h} ${t('posField_unitH')}`;
                })() : '—'}
                  onEdit={() => {
                    const rawHours = v?._raw?.position?.attributes?.hours;
                    let h = rawHours != null ? Number(rawHours) : 0;
                    if (!Number.isFinite(h)) h = 0; else h = h / 3600000;
                    setFuelEditHours(h.toFixed(1));
                    const rawDist = v?._raw?.position?.attributes?.totalDistance;
                    const n = rawDist != null ? Number(rawDist) : 0;
                    setFuelEditDistance(Number.isFinite(n) ? (n / 1000).toFixed(1) : '0');
                    setFuelAccEditOpen(true);
                  }} />
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

      {/* Fuel tab accumulator editor modal */}
      {fuelAccEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setFuelAccEditOpen(false)}>
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-4">{t('posField_editAccumulators')}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">{t('posField_editHours')}</label>
                <input type="number" step="0.1" value={fuelEditHours}
                  onChange={(e) => setFuelEditHours(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">{t('posField_editDistance')}</label>
                <input type="number" step="0.1" value={fuelEditDistance}
                  onChange={(e) => setFuelEditDistance(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary" />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setFuelAccEditOpen(false)}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">
                {t('posField_cancel')}
              </button>
              <button onClick={async () => {
                if (!v) return;
                setFuelAccSaving(true);
                try {
                  const payload: Record<string, unknown> = { deviceId: v.id };
                  const parsedH = parseFloat(fuelEditHours);
                  const parsedD = parseFloat(fuelEditDistance);
                  payload.hours = Number.isFinite(parsedH) ? parsedH * 3600000 : 0;
                  payload.totalDistance = Number.isFinite(parsedD) ? parsedD * 1000 : 0;
                  await api.devices.putAccumulators(v.id, payload);
                  showSuccess('Accumulators updated');
                  setFuelAccEditOpen(false);
                } catch (e) {
                  showError((e as Error).message || 'Save failed');
                } finally {
                  setFuelAccSaving(false);
                }
              }} disabled={fuelAccSaving}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {fuelAccSaving ? t('saving') : t('posField_save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
