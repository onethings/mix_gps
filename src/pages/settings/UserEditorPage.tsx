import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Users, Save, X, ArrowLeft, ChevronDown } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { useFlash } from '@/context/FlashContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useSession } from '@/context/SessionContext';
import { usePermissions } from '@/hooks/usePermissions';
import { api } from '@/lib/api';
import type { TraccarUser } from '@/types';

export default function UserEditorPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useT();
  const { showSuccess, showError } = useFlash();
  const navigate = useNavigate();
  const { user: currentUser, refresh } = useSession();
  const { manager } = usePermissions();
  const isNew = !id || id === 'new';
  const isSelfEdit = !isNew && currentUser?.id === Number(id);

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  // Required
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  // Settings (admin only)
  const [administrator, setAdministrator] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [deviceReadonly, setDeviceReadonly] = useState(false);
  const [limitCommands, setLimitCommands] = useState(false);
  const [disableReports, setDisableReports] = useState(false);
  const [disableDevices, setDisableDevices] = useState(false);
  const [expiration, setExpiration] = useState('');
  const [userLimit, setUserLimit] = useState('');
  const [deviceLimit, setDeviceLimit] = useState('');

  // Preferences
  const [map, setMap] = useState('locationIqStreets');
  const [distanceUnit, setDistanceUnit] = useState('km');
  const [speedUnit, setSpeedUnit] = useState('kn');
  const [altitudeUnit, setAltitudeUnit] = useState('m');
  const [volumeUnit, setVolumeUnit] = useState('ltr');
  const [coordinateFormat, setCoordinateFormat] = useState('dd');
  const [twelveHourFormat, setTwelveHourFormat] = useState(false);
  const [timezone, setTimezone] = useState('');
  const [poiLayer, setPoiLayer] = useState('');

  // Location
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [zoom, setZoom] = useState('');

  // Timezones from API
  const [timezones, setTimezones] = useState<string[]>([]);

  // Token
  const [token, setToken] = useState<string | null>(null);
  const [tokenExpiration, setTokenExpiration] = useState(() =>
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  );

  const fieldClass = 'rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring w-full';

  useEffect(() => {
    api.server.timezones().then((data) => { if (Array.isArray(data)) setTimezones(data); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await api.users.get(Number(id)) as TraccarUser;
        if (!cancelled) {
          setName(data.name || ''); setEmail(data.email || ''); setPhone(data.phone || '');
          setAdministrator(data.administrator || false); setDisabled(data.disabled || false);
          setDeviceReadonly(data.deviceReadonly || false); setLimitCommands(data.limitCommands || false);
          setDisableReports(data.disableReports || false); setDisableDevices((data.attributes?.disableDevices as boolean) || false);
          setExpiration((data.expirationTime || data.expiration || '').slice(0, 10));
          setUserLimit(data.userLimit != null ? String(data.userLimit) : '');
          setDeviceLimit(data.deviceLimit != null ? String(data.deviceLimit) : '');
          setMap(data.map || 'locationIqStreets'); setDistanceUnit((data.attributes?.distanceUnit as string) || 'km');
          setSpeedUnit((data.attributes?.speedUnit as string) || 'kn');
          setAltitudeUnit((data.attributes?.altitudeUnit as string) || 'm');
          setVolumeUnit((data.attributes?.volumeUnit as string) || 'ltr');
          setCoordinateFormat(data.coordinateFormat || 'dd');
          setTwelveHourFormat((data.attributes?.twelveHourFormat as boolean) || false);
          setLatitude(data.latitude != null ? String(data.latitude) : '');
          setLongitude(data.longitude != null ? String(data.longitude) : '');
          setZoom(data.zoom != null ? String(data.zoom) : '');
          setTimezone((data.attributes?.timezone as string) || '');
          setPoiLayer(data.poiLayer || '');
        }
      } catch { if (!cancelled) showError(t('loadFailed')); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [id, isNew, showError, t]);

  const generateToken = useCallback(async () => {
    try {
      const exp = new Date(tokenExpiration + 'T00:00:00').toISOString();
      setToken(await api.session.generateToken(exp) as unknown as string);
    } catch (err: unknown) {
      showError(`${t('saveFailed')}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [tokenExpiration, showError, t]);

  const handleSave = useCallback(async () => {
    if (!name.trim() || !email.trim()) { showError(t('nameEmailPasswordRequired')); return; }
    if (isNew && !password.trim()) { showError(t('nameEmailPasswordRequired')); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(), email: email.trim(), phone: phone.trim() || undefined,
        map, coordinateFormat,
        poiLayer: poiLayer.trim() || undefined,
        attributes: { twelveHourFormat, disableDevices, timezone: timezone.trim() || undefined, speedUnit, distanceUnit, altitudeUnit, volumeUnit },
      };
      if (latitude) payload.latitude = Number(latitude);
      if (longitude) payload.longitude = Number(longitude);
      if (zoom) payload.zoom = Number(zoom);
      if (!isNew) payload.id = Number(id);
      // Always send admin/limit fields to prevent Jackson from defaulting
      // them to false/0 on the server, which would trigger checkUserUpdate rejection
      Object.assign(payload, { administrator, disabled, deviceReadonly, limitCommands, disableReports });
      if (expiration) payload.expirationTime = new Date(expiration + 'T00:00:00').toISOString();
      if (userLimit) payload.userLimit = Number(userLimit);
      if (deviceLimit) payload.deviceLimit = Number(deviceLimit);
      if (password.trim()) payload.password = password.trim();
      if (isNew) { await api.users.create(payload); showSuccess(t('userCreated')); }
      else { await api.users.update(Number(id), payload); showSuccess(t('entitySaved')); }
      if (isSelfEdit) await refresh();
      navigate(manager ? '/settings/users' : '/settings');
    } catch (err: unknown) {
      showError(`${t('saveFailed')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setSaving(false); }
  }, [name, email, phone, password, administrator, disabled, deviceReadonly, limitCommands, disableReports, disableDevices, expiration, userLimit, deviceLimit, map, distanceUnit, speedUnit, altitudeUnit, volumeUnit, coordinateFormat, twelveHourFormat, timezone, poiLayer, latitude, longitude, zoom, isNew, isSelfEdit, id, showSuccess, showError, t, navigate, manager, refresh]);

  if (loading) {
    return <div className="space-y-4 pb-8"><div className="flex items-center gap-2 text-sm text-muted-foreground"><div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />{t('loading')}…</div></div>;
  }

  return (
    <div className="space-y-3 md:space-y-5 pb-8 max-w-xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate(manager ? '/settings/users' : '/settings')} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent"><ArrowLeft className="h-5 w-5" /></button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t('user')}
          </h2>
        </div>
        {!isNew && <Badge variant="secondary" className="text-[10px]">ID: {id}</Badge>}
      </div>

      {/* ═══════ Required ═══════ */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center gap-2">
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">{t('sharedRequired')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('name')} *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('userNamePlaceholder')} autoFocus />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('email')} *</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('emailPlaceholder')} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('password')}{isNew ? ' *' : ''}</label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder={isNew ? t('passwordPlaceholder') : t('passwordLeaveBlank')} />
          </div>
        </CardContent>
      </Card>

      {/* ═══════ Settings (admin only) ═══════ */}
      {!isSelfEdit && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center gap-2">
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">{t('settings')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            <div className="space-y-3">
              <label className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 text-sm cursor-pointer hover:bg-accent/30 has-[:checked]:border-primary/40 has-[:checked]:bg-primary/5 transition-colors">
                <input type="checkbox" className="rounded border-input accent-primary" checked={administrator} onChange={(e) => setAdministrator(e.target.checked)} />
                <div><p className="font-medium">{t('userAdmin')}</p><p className="text-xs text-muted-foreground">{t('userAdminDesc')}</p></div>
              </label>
              <label className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 text-sm cursor-pointer hover:bg-accent/30 has-[:checked]:border-primary/40 has-[:checked]:bg-primary/5 transition-colors">
                <input type="checkbox" className="rounded border-input accent-primary" checked={disabled} onChange={(e) => setDisabled(e.target.checked)} />
                <div><p className="font-medium">{t('sharedDisabled')}</p><p className="text-xs text-muted-foreground">{t('userDisabledDesc')}</p></div>
              </label>
              <label className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 text-sm cursor-pointer hover:bg-accent/30 has-[:checked]:border-primary/40 has-[:checked]:bg-primary/5 transition-colors">
                <input type="checkbox" className="rounded border-input accent-primary" checked={deviceReadonly} onChange={(e) => setDeviceReadonly(e.target.checked)} />
                <div><p className="font-medium">{t('userDeviceReadonly')}</p><p className="text-xs text-muted-foreground">{t('userDeviceReadonlyDesc')}</p></div>
              </label>
              <label className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 text-sm cursor-pointer hover:bg-accent/30 has-[:checked]:border-primary/40 has-[:checked]:bg-primary/5 transition-colors">
                <input type="checkbox" className="rounded border-input accent-primary" checked={limitCommands} onChange={(e) => setLimitCommands(e.target.checked)} />
                <div><p className="font-medium">{t('userLimitCommands')}</p><p className="text-xs text-muted-foreground">{t('userLimitCommandsDesc')}</p></div>
              </label>
              <label className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 text-sm cursor-pointer hover:bg-accent/30 has-[:checked]:border-primary/40 has-[:checked]:bg-primary/5 transition-colors">
                <input type="checkbox" className="rounded border-input accent-primary" checked={disableReports} onChange={(e) => setDisableReports(e.target.checked)} />
                <div><p className="font-medium">{t('userDisableReports')}</p><p className="text-xs text-muted-foreground">{t('userDisableReportsDesc')}</p></div>
              </label>
              <label className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 text-sm cursor-pointer hover:bg-accent/30 has-[:checked]:border-primary/40 has-[:checked]:bg-primary/5 transition-colors">
                <input type="checkbox" className="rounded border-input accent-primary" checked={disableDevices} onChange={(e) => setDisableDevices(e.target.checked)} />
                <div><p className="font-medium">{t('userDisableDevices')}</p><p className="text-xs text-muted-foreground">{t('userDisableDevicesDesc')}</p></div>
              </label>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('userExpirationTime')}</label>
              <input type="date" value={expiration} onChange={(e) => setExpiration(e.target.value)} className={fieldClass} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t('userLimit')}</label>
                <Input type="number" value={userLimit} onChange={(e) => setUserLimit(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t('deviceLimit')}</label>
                <Input type="number" value={deviceLimit} onChange={(e) => setDeviceLimit(e.target.value)} placeholder="0" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══════ Preferences ═══════ */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center gap-2">
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">{t('preferences')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('phone')}</label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('sharedPhone')} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('map')}</label>
            <select value={map} onChange={(e) => setMap(e.target.value)} className={fieldClass}>
              <option value="locationIqStreets">LocationIQ Streets</option>
              <option value="locationIqDark">LocationIQ Dark</option>
              <option value="openFreeMap">OpenFreeMap</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('settingsCoordinateFormat')}</label>
            <select value={coordinateFormat} onChange={(e) => setCoordinateFormat(e.target.value)} className={fieldClass}>
              <option value="dd">{t('sharedDecimalDegrees')}</option>
              <option value="ddm">{t('sharedDegreesDecimalMinutes')}</option>
              <option value="dms">{t('sharedDegreesMinutesSeconds')}</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('settingsSpeedUnit')}</label>
              <select value={speedUnit} onChange={(e) => setSpeedUnit(e.target.value)} className={fieldClass}>
                <option value="kn">{t('kn')}</option><option value="kmh">{t('kmh')}</option><option value="mph">{t('mph')}</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('settingsDistanceUnit')}</label>
              <select value={distanceUnit} onChange={(e) => setDistanceUnit(e.target.value)} className={fieldClass}>
                <option value="km">{t('km')}</option><option value="mi">{t('mi')}</option><option value="nmi">{t('nmi')}</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('settingsAltitudeUnit')}</label>
              <select value={altitudeUnit} onChange={(e) => setAltitudeUnit(e.target.value)} className={fieldClass}>
                <option value="m">{t('meters')}</option><option value="ft">{t('feet')}</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('settingsVolumeUnit')}</label>
              <select value={volumeUnit} onChange={(e) => setVolumeUnit(e.target.value)} className={fieldClass}>
                <option value="ltr">{t('liter')}</option><option value="usGal">{t('usGallon')}</option><option value="impGal">{t('impGallon')}</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('timezone')}</label>
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={fieldClass}>
              <option value="">—</option>
              {timezones.map((tz) => (<option key={tz} value={tz}>{tz}</option>))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('poiLayer')}</label>
            <Input value={poiLayer} onChange={(e) => setPoiLayer(e.target.value)} placeholder={t('optional')} />
          </div>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input type="checkbox" className="rounded border-input accent-primary" checked={twelveHourFormat} onChange={(e) => setTwelveHourFormat(e.target.checked)} />
            {t('twelveHourFormat')}
          </label>
        </CardContent>
      </Card>

      {/* ═══════ Location ═══════ */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center gap-2">
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">{t('location')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t('latitude')}</label>
              <Input type="number" step="any" value={latitude} onChange={(e) => setLatitude(e.target.value)} className="text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t('longitude')}</label>
              <Input type="number" step="any" value={longitude} onChange={(e) => setLongitude(e.target.value)} className="text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t('zoom')}</label>
              <Input type="number" step="any" value={zoom} onChange={(e) => setZoom(e.target.value)} className="text-xs" />
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => {
            navigator.geolocation.getCurrentPosition(
              (pos) => { setLatitude(pos.coords.latitude.toFixed(6)); setLongitude(pos.coords.longitude.toFixed(6)); },
              () => showError(t('mapCurrentLocationFailed')),
              { enableHighAccuracy: true, timeout: 10000 },
            );
          }}>
            {t('mapCurrentLocation')}
          </Button>
        </CardContent>
      </Card>

      {/* ═══════ Token ═══════ */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center gap-2">
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">{t('preferencesToken')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('userExpirationTime')}</label>
            <input type="date" value={tokenExpiration} onChange={(e) => { setTokenExpiration(e.target.value); setToken(null); }} className={fieldClass} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('userToken')}</label>
            <textarea readOnly rows={3} value={token || ''} placeholder={t('userToken')}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs" />
            <Button variant="outline" size="sm" onClick={generateToken} disabled={!!token}>
              {t('generateToken')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={() => navigate(manager ? '/settings/users' : '/settings')}><X className="h-4 w-4 mr-1.5" />{t('cancel')}</Button>
        <Button variant="default" onClick={handleSave} disabled={saving}>
          {saving ? <><div className="h-4 w-4 mr-1.5 animate-spin rounded-full border-2 border-current border-t-transparent" />{t('saving')}</> : <><Save className="h-4 w-4 mr-1.5" />{isNew ? t('add') : t('save')}</>}
        </Button>
      </div>
    </div>
  );
}
