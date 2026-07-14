import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Map, Smartphone, Volume2, KeyRound, Info, Save,
  RotateCcw, Copy, Check, User as UserIcon,
} from 'lucide-react';
import { useT } from '@/lib/i18n';
import { useSession } from '@/context/SessionContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useFlash } from '@/context/FlashContext';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */
const DEVICE_FIELDS = [
  { id: 'name', key: 'sharedName' },
  { id: 'uniqueId', key: 'deviceIdentifier' },
  { id: 'phone', key: 'sharedPhone' },
  { id: 'model', key: 'deviceModel' },
  { id: 'contact', key: 'deviceContact' },
  { id: 'geofenceIds', key: 'sharedGeofence' },
  { id: 'driverUniqueId', key: 'sharedDriver' },
  { id: 'motion', key: 'positionMotion' },
] as const;

const ALARM_KEYS = [
  'general', 'sos', 'vibration', 'overspeed',
  'lowPower', 'lowBattery', 'geofenceEnter', 'geofenceExit',
  'tampering', 'powerOff',
] as const;

const MAP_STYLE_OPTIONS = [
  { value: 'locationIqStreets', label: 'LocationIQ Streets' },
  { value: 'locationIqDark', label: 'LocationIQ Dark' },
  { value: 'openFreeMap', label: 'OpenFreeMap' },
] as const;

const DEFAULTS = {
  activeMapStyles: ['locationIqStreets', 'locationIqDark', 'openFreeMap'],
  positionItems: ['fixTime', 'address', 'speed', 'totalDistance'],
  mapLiveRoutes: 'none',
  mapDirection: 'selected',
  mapGeofences: true,
  mapFollow: false,
  mapCluster: true,
  mapOnSelect: true,
  devicePrimary: 'name',
  deviceSecondary: '',
  soundEvents: [] as string[],
  soundAlarms: ['sos'],
};

/* ================================================================== */
/*  PreferencesPage                                                    */
/* ================================================================== */
export default function PreferencesSettingsPage() {
  const { t } = useT();
  const { user, server, refresh } = useSession();
  const { readonly, administrator } = usePermissions();
  const { showSuccess, showError } = useFlash();
  const navigate = useNavigate();

  const versionApp = import.meta.env.VITE_APP_VERSION as string | undefined;

  /* ---------- attributes state ---------- */
  const [attributes, setAttributes] = useState<Record<string, unknown>>({});

  /* ---------- token state ---------- */
  const [token, setToken] = useState<string | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [tokenExpiration, setTokenExpiration] = useState(() =>
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  );

  /* ---------- notification types ---------- */
  const [notificationTypes, setNotificationTypes] = useState<{ type: string }[]>([]);

  /* ---------- active tab ---------- */
  const [activeTab, setActiveTab] = useState('map');

  /* ---------- saving ---------- */
  const [saving, setSaving] = useState(false);

  /* ---------- init attributes ---------- */
  useEffect(() => {
    if (user?.attributes) {
      setAttributes({ ...user.attributes });
    }
  }, [user?.attributes]);

  /* ---------- load notification types ---------- */
  useEffect(() => {
    api.notifications.types()
      .then((data) => { if (Array.isArray(data)) setNotificationTypes(data); })
      .catch(() => {});
  }, []);

  /* ---------- helpers (arrays stored as arrays) ---------- */
  const attr = useCallback(<T,>(key: string, fallback: T): T =>
    Object.prototype.hasOwnProperty.call(attributes, key)
      ? (attributes as Record<string, T>)[key]
      : fallback,
  [attributes]);

  const setAttr = useCallback((key: string, value: unknown) => {
    setAttributes((prev) => ({ ...prev, [key]: value }));
  }, []);

  /* ---------- save ---------- */
  const handleSave = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    try {
      await api.users.update(user.id, { ...user, attributes });
      showSuccess(t('preferencesSaved'));
      await refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showError(`${t('saveFailed')}: ${msg}`);
    } finally {
      setSaving(false);
    }
  }, [user, attributes, showSuccess, showError, t, refresh]);

  /* ---------- token ---------- */
  const generateToken = useCallback(async () => {
    try {
      const expiration = new Date(tokenExpiration + 'T00:00:00').toISOString();
      const result: string = await api.session.generateToken(expiration) as unknown as string;
      setToken(result);
      setTokenCopied(false);
    } catch (err: unknown) {
      showError(`${t('saveFailed')}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [tokenExpiration, showError, t]);

  const copyToken = useCallback(async () => {
    if (token) {
      await navigator.clipboard.writeText(token);
      setTokenCopied(true);
      showSuccess(t('tokenCopied'));
    }
  }, [token, showSuccess, t]);

  /* ---------- reboot ---------- */
  const handleReboot = useCallback(async () => {
    try {
      await api.server.reboot();
      showSuccess(t('serverReboot'));
    } catch {
      showError(t('serverRebootFailed'));
    }
  }, [showError, showSuccess, t]);

  /* ---------- style classes ---------- */
  const fieldClass =
    'rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring w-full';
  const rowClass = 'flex items-center justify-between rounded-lg bg-muted/50 px-4 py-2.5';

  /* ---------- multi-select toggle helper ---------- */
  const toggleArrayAttr = useCallback((key: string, value: string) => {
    setAttributes((prev) => {
      const current = (prev[key] as string[] | undefined) ?? [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, [key]: next };
    });
  }, []);

  /* ---------- tabs config ---------- */
  const tabs = useMemo(() => [
    { id: 'map', label: t('preferencesMap'), icon: Map },
    { id: 'device', label: t('preferencesDevice'), icon: Smartphone },
    { id: 'sound', label: t('preferencesSound'), icon: Volume2 },
    { id: 'token', label: t('preferencesToken'), icon: KeyRound },
    { id: 'info', label: t('preferencesInfo'), icon: Info },
  ], [t]);

  /* ---------- render ---------- */
  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t('preferences')}</h2>
          <p className="text-sm text-muted-foreground">{t('preferencesDesc')}</p>
        </div>
        {user && (
          <Badge variant={user.administrator ? 'default' : 'secondary'} className="text-[10px]">
            {user.administrator ? t('userAdmin') : t('users')}
          </Badge>
        )}
      </div>

      {/* User profile summary */}
      <Card>
        <CardContent className="flex items-center gap-4 p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UserIcon className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{user?.name || '—'}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email || '—'}</p>
          </div>
          {user?.phone && (
            <span className="hidden sm:block text-xs text-muted-foreground">{user.phone}</span>
          )}
        </CardContent>
      </Card>

      {/* Tabs navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="sticky top-0 z-10 -mx-1 bg-background px-1 pb-2">
          <TabsList className="w-full justify-start overflow-x-auto">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} className="gap-1.5 text-xs">
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* ════════════ MAP TAB ════════════ */}
        <TabsContent value="map" className="space-y-4 mt-0">
          <Card>
            <CardContent className="space-y-5 p-5">
              {/* Active map styles — checkboxes instead of multi-select */}
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('mapActive')}</label>
                <div className="space-y-1.5">
                  {MAP_STYLE_OPTIONS.map((opt) => {
                    const active = (attr('activeMapStyles', DEFAULTS.activeMapStyles) as string[]).includes(opt.value);
                    return (
                      <label key={opt.value} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 cursor-pointer hover:bg-accent/30 transition-colors has-[:checked]:border-primary/40 has-[:checked]:bg-primary/5">
                        <input
                          type="checkbox"
                          className="rounded border-input accent-primary"
                          checked={active}
                          onChange={() => toggleArrayAttr('activeMapStyles', opt.value)}
                        />
                        <span className="text-sm">{opt.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Position items */}
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('attributePopupInfo')}</label>
                <div className="flex flex-wrap gap-1.5">
                  {(attr('positionItems', DEFAULTS.positionItems) as string[]).map((item) => (
                    <span
                      key={item}
                      className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs font-medium"
                    >
                      {item}
                      <button
                        type="button"
                        className="ml-0.5 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          const current = attr('positionItems', DEFAULTS.positionItems) as string[];
                          setAttr('positionItems', current.filter((i) => i !== item));
                        }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <Input
                  placeholder={`${t('sharedAdd')}...`}
                  className="max-w-xs"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = (e.target as HTMLInputElement).value.trim();
                      if (val) {
                        const current = attr('positionItems', DEFAULTS.positionItems) as string[];
                        if (!current.includes(val)) {
                          setAttr('positionItems', [...current, val]);
                        }
                        (e.target as HTMLInputElement).value = '';
                      }
                    }
                  }}
                />
              </div>

              {/* Live routes */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t('mapLiveRoutes')}</label>
                <select
                  className={fieldClass}
                  value={attr('mapLiveRoutes', DEFAULTS.mapLiveRoutes) as string}
                  onChange={(e) => setAttr('mapLiveRoutes', e.target.value)}
                >
                  <option value="none">{t('sharedDisabled')}</option>
                  <option value="selected">{t('deviceSelected')}</option>
                  <option value="all">{t('notificationAlways')}</option>
                </select>
              </div>

              {/* Direction */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t('mapDirection')}</label>
                <select
                  className={fieldClass}
                  value={attr('mapDirection', DEFAULTS.mapDirection) as string}
                  onChange={(e) => setAttr('mapDirection', e.target.value)}
                >
                  <option value="none">{t('sharedDisabled')}</option>
                  <option value="selected">{t('deviceSelected')}</option>
                  <option value="all">{t('notificationAlways')}</option>
                </select>
              </div>

              {/* Checkboxes */}
              <div className="space-y-2.5">
                {([
                  ['mapGeofences', 'attributeShowGeofences', true],
                  ['mapFollow', 'deviceFollow', false],
                  ['mapCluster', 'mapClustering', true],
                  ['mapOnSelect', 'mapOnSelect', true],
                ] as const).map(([key, labelKey, defaultVal]) => (
                  <label key={key} className="flex items-center gap-2.5 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded border-input accent-primary"
                      checked={Object.prototype.hasOwnProperty.call(attributes, key) ? Boolean(attributes[key]) : defaultVal}
                      onChange={(e) => setAttr(key, e.target.checked)}
                    />
                    {t(labelKey)}
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════ DEVICE TAB ════════════ */}
        <TabsContent value="device" className="space-y-4 mt-0">
          <Card>
            <CardContent className="space-y-5 p-5">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t('devicePrimaryInfo')}</label>
                <select
                  className={fieldClass}
                  value={attr('devicePrimary', DEFAULTS.devicePrimary) as string}
                  onChange={(e) => setAttr('devicePrimary', e.target.value)}
                >
                  {DEVICE_FIELDS.map((f) => (
                    <option key={f.id} value={f.id}>{t(f.key)}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t('deviceSecondaryInfo')}</label>
                <select
                  className={fieldClass}
                  value={attr('deviceSecondary', DEFAULTS.deviceSecondary) as string}
                  onChange={(e) => setAttr('deviceSecondary', e.target.value)}
                >
                  <option value="">{'\u00a0'}</option>
                  {DEVICE_FIELDS.map((f) => (
                    <option key={f.id} value={f.id}>{t(f.key)}</option>
                  ))}
                </select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════ SOUND TAB ════════════ */}
        <TabsContent value="sound" className="space-y-4 mt-0">
          <Card>
            <CardContent className="space-y-5 p-5">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('eventsSoundEvents')}</label>
                <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
                  {notificationTypes.length > 0 ? notificationTypes.map((nt) => {
                    const active = (attr('soundEvents', DEFAULTS.soundEvents) as string[]).includes(nt.type);
                    return (
                      <label key={nt.type} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 cursor-pointer hover:bg-accent/30 transition-colors has-[:checked]:border-primary/40 has-[:checked]:bg-primary/5">
                        <input
                          type="checkbox"
                          className="rounded border-input accent-primary"
                          checked={active}
                          onChange={() => toggleArrayAttr('soundEvents', nt.type)}
                        />
                        <span className="text-sm">{nt.type}</span>
                      </label>
                    );
                  }) : (
                    <p className="text-sm text-muted-foreground py-2">{t('loading')}…</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{t('eventsSoundAlarms')}</label>
                <div className="space-y-1.5">
                  {ALARM_KEYS.map((key) => {
                    const active = (attr('soundAlarms', DEFAULTS.soundAlarms) as string[]).includes(key);
                    return (
                      <label key={key} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 cursor-pointer hover:bg-accent/30 transition-colors has-[:checked]:border-primary/40 has-[:checked]:bg-primary/5">
                        <input
                          type="checkbox"
                          className="rounded border-input accent-primary"
                          checked={active}
                          onChange={() => toggleArrayAttr('soundAlarms', key)}
                        />
                        <span className="text-sm capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════ TOKEN TAB ════════════ */}
        <TabsContent value="token" className="space-y-4 mt-0">
          <Card>
            <CardContent className="space-y-5 p-5">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t('userExpirationTime')}</label>
                <Input
                  type="date"
                  value={tokenExpiration}
                  onChange={(e) => { setTokenExpiration(e.target.value); setToken(null); }}
                  className="max-w-xs"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('userToken')}</label>
                <Textarea
                  readOnly
                  rows={4}
                  value={token || ''}
                  placeholder={t('userToken')}
                  className="font-mono text-xs"
                />
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={generateToken}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                    {t('generateToken')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={copyToken} disabled={!token}>
                    {tokenCopied ? (
                      <><Check className="h-3.5 w-3.5 mr-1.5 text-green-500" />{t('tokenCopied')}</>
                    ) : (
                      <><Copy className="h-3.5 w-3.5 mr-1.5" />{t('copyToken')}</>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════ INFO TAB ════════════ */}
        <TabsContent value="info" className="space-y-4 mt-0">
          <Card>
            <CardContent className="space-y-3 p-5">
              <div className={rowClass}>
                <span className="text-sm text-muted-foreground">{t('settingsAppVersion')}</span>
                <span className="text-sm font-medium">{versionApp || '—'}</span>
              </div>
              <div className={rowClass}>
                <span className="text-sm text-muted-foreground">{t('settingsServerVersion')}</span>
                <span className="text-sm font-medium">{(server as unknown as Record<string, unknown> | null)?.version as string || '—'}</span>
              </div>
              {administrator && (
                <div className="pt-2">
                  <Button variant="outline" size="sm" className="text-destructive border-destructive/50 hover:bg-destructive/10" onClick={handleReboot}>
                    {t('serverReboot')}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Save button */}
      {!readonly && (
        <div className="flex justify-center gap-4 pt-2">
          <Button variant="outline" onClick={() => navigate('/settings')}>
            {t('backToSettings')}
          </Button>
          <Button variant="default" onClick={handleSave} disabled={saving}>
            {saving ? (
              <><div className="h-4 w-4 mr-1.5 animate-spin rounded-full border-2 border-current border-t-transparent" />{t('saving')}</>
            ) : (
              <><Save className="h-4 w-4 mr-1.5" />{t('save')}</>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
