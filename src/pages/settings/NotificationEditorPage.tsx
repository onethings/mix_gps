import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Bell, Save, X, ArrowLeft, FlaskConical } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { useFlash } from '@/context/FlashContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import type { TraccarNotification } from '@/types';

/* ── Alarm keys (from traccar-web i18n prefix 'alarm') ── */
const ALARM_KEYS = [
  'general', 'sos', 'vibration', 'overspeed',
  'lowPower', 'lowBattery', 'geofenceEnter', 'geofenceExit',
  'tampering', 'powerOff',
] as const;

/* ── Event type label map ── */
const EVENT_LABELS: Record<string, string> = {
  allEvents: 'eventAllEvents',
  commandResult: 'eventType_commandResult',
  deviceApp: 'eventType_deviceApp',
  deviceDanger: 'eventType_deviceDanger',
  deviceEmergency: 'eventType_deviceEmergency',
  deviceFault: 'eventType_deviceFault',
  deviceImmobilize: 'eventType_deviceImmobilize',
  deviceMoving: 'eventType_deviceMoving',
  deviceOffline: 'eventType_deviceOffline',
  deviceOnline: 'eventType_deviceOnline',
  deviceOverspeed: 'eventType_deviceOverspeed',
  devicePowerOff: 'eventType_devicePowerOff',
  devicePowerOn: 'eventType_devicePowerOn',
  deviceStatus: 'eventType_deviceStatus',
  deviceStopped: 'eventType_deviceStopped',
  deviceUnknown: 'eventType_deviceUnknown',
  geofenceEnter: 'eventType_geofenceEnter',
  geofenceExit: 'eventType_geofenceExit',
  heartbeat: 'eventType_heartbeat',
  ignitionOff: 'eventType_ignitionOff',
  ignitionOn: 'eventType_ignitionOn',
  maintenance: 'eventType_maintenance',
  alarm: 'eventType_alarm',
  media: 'eventType_media',
  textMessage: 'eventType_textMessage',
  driverChanged: 'eventType_driverChanged',
};

export default function NotificationEditorPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useT();
  const { showSuccess, showError } = useFlash();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [item, setItem] = useState<TraccarNotification>(() => ({
    id: 0, type: '', notificators: [], attributes: {},
  }));

  /* ── Fetched options ── */
  const [eventTypes, setEventTypes] = useState<{ type: string }[]>([]);
  const [notificatorTypes, setNotificatorTypes] = useState<{ type: string }[]>([]);
  const [calendars, setCalendars] = useState<{ id: number; name: string }[]>([]);
  const [geofences, setGeofences] = useState<{ id: number; name: string }[]>([]);
  const [savedCommands, setSavedCommands] = useState<{ id: number; description?: string }[]>([]);

  const fieldClass =
    'rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring w-full';

  /* ── Load options ── */
  useEffect(() => {
    Promise.all([
      api.notifications.types().then((data) => { if (Array.isArray(data)) setEventTypes(data); }).catch(() => {}),
      api.notifications.notificators().then((data) => { if (Array.isArray(data)) setNotificatorTypes(data); }).catch(() => {}),
      api.calendars.list().then((data) => { if (Array.isArray(data)) setCalendars(data); }).catch(() => {}),
      api.geofences.list().then((data) => { if (Array.isArray(data)) setGeofences(data); }).catch(() => {}),
      api.commands.list().then((data) => { if (Array.isArray(data)) setSavedCommands(data); }).catch(() => {}),
    ]).catch(() => {});
  }, []);

  /* ── Load existing notification ── */
  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await api.notifications.get(Number(id)) as TraccarNotification;
        if (!cancelled) setItem(data);
      } catch {
        if (!cancelled) showError(t('loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, isNew, showError, t]);

  /* ── Helpers ── */
  const updateItem = useCallback((patch: Partial<TraccarNotification>) => {
    setItem((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateAttributes = useCallback((patch: Record<string, unknown>) => {
    setItem((prev) => ({ ...prev, attributes: { ...prev.attributes, ...patch } }));
  }, []);

  /* ── Notificator multi-select toggle ── */
  const toggleNotificator = useCallback((type: string) => {
    setItem((prev) => {
      const current = Array.isArray(prev.notificators) ? prev.notificators : [];
      const next = current.includes(type)
        ? current.filter((n) => n !== type)
        : [...current, type];
      return { ...prev, notificators: next };
    });
  }, []);

  /* ── Alarm multi-select toggle ── */
  const toggleAlarm = useCallback((alarm: string) => {
    setItem((prev) => {
      const current = prev.attributes?.alarms
        ? String(prev.attributes.alarms).split(/[, ]+/).filter(Boolean)
        : [];
      const next = current.includes(alarm)
        ? current.filter((a) => a !== alarm)
        : [...current, alarm];
      return { ...prev, attributes: { ...prev.attributes, alarms: next.join(',') } };
    });
  }, []);

  /* ── Geofence multi-select toggle ── */
  const toggleGeofence = useCallback((geoId: number) => {
    setItem((prev) => {
      const current = prev.attributes?.geofenceIds
        ? String(prev.attributes.geofenceIds).split(',').map(Number)
        : [];
      const next = current.includes(geoId)
        ? current.filter((g) => g !== geoId)
        : [...current, geoId];
      return { ...prev, attributes: { ...prev.attributes, geofenceIds: next.join(',') } };
    });
  }, []);

  /* ── Validation ── */
  const isValid = item.type
    && Array.isArray(item.notificators) && item.notificators.length > 0
    && (!item.notificators.includes('command') || item.commandId);

  /* ── Save ── */
  const handleSave = useCallback(async () => {
    if (!isValid) { showError(t('nameRequired')); return; }
    setSaving(true);
    try {
      // Ensure notificators is stored as string for API compat
      const payload = {
        ...item,
        notificators: Array.isArray(item.notificators) ? item.notificators.join(',') : item.notificators,
      };
      if (isNew) {
        await api.notifications.create(payload);
        showSuccess(t('entityCreated'));
      } else {
        await api.notifications.update(Number(id), payload);
        showSuccess(t('entitySaved'));
      }
      navigate('/settings/notifications');
    } catch (err: unknown) {
      showError(`${t('saveFailed')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setSaving(false); }
  }, [item, isNew, id, showSuccess, showError, t, navigate, isValid]);

  /* ── Test notificators ── */
  const handleTest = useCallback(async () => {
    try {
      const raw = item.notificators;
      const notificators = Array.isArray(raw) ? raw : String(raw || '').split(/[, ]+/).filter(Boolean);
      await Promise.all(
        notificators.map(async (n) => {
          await api.notifications.testNotificator(n);
        }),
      );
      showSuccess(t('notificationTestSuccess'));
    } catch {
      showError(t('saveFailed'));
    }
  }, [item.notificators, showSuccess, showError, t]);

  /* ── Geofence types ── */
  const isGeofenceType = item.type === 'geofenceEnter' || item.type === 'geofenceExit';

  if (loading) {
    return (
      <div className="space-y-4 pb-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          {t('loading')}…
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8 max-w-lg">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate('/settings/notifications')} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Bell className="h-5 w-5" />
            {isNew ? t('add') : t('edit')} {t('notifications')}
          </h2>
          <p className="text-sm text-muted-foreground">{(item as any).description || t('notificationsDesc')}</p>
        </div>
      </div>

      {/* Required section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">{t('sharedRequired')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Event type */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('type')} *</label>
            <select
              value={item.type}
              onChange={(e) => updateItem({ type: e.target.value })}
              className={fieldClass}
            >
              <option value="">— {t('sharedSelect')} —</option>
              {eventTypes.map((et) => (
                <option key={et.type} value={et.type}>
                  {t(EVENT_LABELS[et.type] || et.type)}
                </option>
              ))}
            </select>
          </div>

          {/* Alarms (only for alarm type) */}
          {item.type === 'alarm' && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('alarms')}</label>
              <div className="space-y-1 max-h-[180px] overflow-y-auto">
                {ALARM_KEYS.map((alarm) => {
                  const active = (item.attributes?.alarms as string || '').split(/[, ]+/).includes(alarm);
                  return (
                    <label key={alarm} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 cursor-pointer hover:bg-accent/30 transition-colors has-[:checked]:border-primary/40 has-[:checked]:bg-primary/5">
                      <input type="checkbox" className="rounded border-input accent-primary"
                        checked={active} onChange={() => toggleAlarm(alarm)} />
                      <span className="text-sm capitalize">{alarm.replace(/([A-Z])/g, ' $1').trim()}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Notificators */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('notificationNotificators')} *</label>
            <div className="space-y-1 max-h-[240px] overflow-y-auto">
              {notificatorTypes.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">{t('loading')}…</p>
              ) : notificatorTypes.map((nt) => {
                const active = Array.isArray(item.notificators) && item.notificators.includes(nt.type);
                return (
                  <label key={nt.type} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 cursor-pointer hover:bg-accent/30 transition-colors has-[:checked]:border-primary/40 has-[:checked]:bg-primary/5">
                    <input type="checkbox" className="rounded border-input accent-primary"
                      checked={active} onChange={() => toggleNotificator(nt.type)} />
                    <span className="text-sm capitalize">{nt.type}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Saved command (only if command notificator selected) */}
          {Array.isArray(item.notificators) && item.notificators.includes('command') && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('savedCommands')}</label>
              <select
                value={item.commandId || ''}
                onChange={(e) => updateItem({ commandId: Number(e.target.value) })}
                className={fieldClass}
              >
                <option value="">— {t('sharedSelect')} —</option>
                {savedCommands.map((cmd) => (
                  <option key={cmd.id} value={cmd.id}>{cmd.description || `#${cmd.id}`}</option>
                ))}
              </select>
            </div>
          )}

          {/* Always */}
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input type="checkbox" className="rounded border-input accent-primary"
              checked={Boolean(item.always)}
              onChange={(e) => updateItem({ always: e.target.checked })} />
            {t('notificationAlways')}
          </label>
        </CardContent>
      </Card>

      {/* Extra section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">{t('sharedExtra')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('description')}</label>
            <Input
              value={(item as any).description || ''}
              onChange={(e) => updateItem({ description: e.target.value } as any)}
              placeholder={t('notificationDescriptionPlaceholder')}
            />
          </div>

          {/* Calendar */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('calendar')}</label>
            <select
              value={item.calendarId || ''}
              onChange={(e) => updateItem({ calendarId: e.target.value ? Number(e.target.value) : undefined })}
              className={fieldClass}
            >
              <option value="">—</option>
              {calendars.map((cal) => (
                <option key={cal.id} value={cal.id}>{cal.name}</option>
              ))}
            </select>
          </div>

          {/* Geofences (only for geofence types) */}
          {isGeofenceType && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('notificationGeofences')}</label>
              <div className="space-y-1 max-h-[180px] overflow-y-auto">
                {geofences.length === 0 ? (
                  <p className="text-sm text-muted-foreground">—</p>
                ) : geofences.map((geo) => {
                  const active = (item.attributes?.geofenceIds as string || '').split(',').map(Number).includes(geo.id);
                  return (
                    <label key={geo.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 cursor-pointer hover:bg-accent/30 transition-colors has-[:checked]:border-primary/40 has-[:checked]:bg-primary/5">
                      <input type="checkbox" className="rounded border-input accent-primary"
                        checked={active} onChange={() => toggleGeofence(geo.id)} />
                      <span className="text-sm">{geo.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Priority */}
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input type="checkbox" className="rounded border-input accent-primary"
              checked={Boolean(item.attributes?.priority)}
              onChange={(e) => updateAttributes({ priority: e.target.checked })} />
            {t('sharedPriority')}
          </label>
        </CardContent>
      </Card>

      {/* Test button */}
      {Array.isArray(item.notificators) && item.notificators.length > 0 && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={handleTest}>
            <FlaskConical className="h-4 w-4 mr-1.5" />
            {t('notificationTestNotificators')}
          </Button>
        </div>
      )}

      {/* Type badge */}
      {item.type && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px] font-mono">
            {item.type}
          </Badge>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={() => navigate('/settings/notifications')}>
          <X className="h-4 w-4 mr-1.5" />{t('cancel')}
        </Button>
        <Button variant="default" onClick={handleSave} disabled={saving || !isValid}>
          {saving ? (
            <><div className="h-4 w-4 mr-1.5 animate-spin rounded-full border-2 border-current border-t-transparent" />{t('saving')}</>
          ) : (
            <><Save className="h-4 w-4 mr-1.5" />{isNew ? t('add') : t('save')}</>
          )}
        </Button>
      </div>
    </div>
  );
}
