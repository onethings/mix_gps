import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT } from '@/lib/i18n';
import { useFlash } from '@/context/FlashContext';
import { useSession } from '@/context/SessionContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { api } from '@/lib/api';

const selectClass = 'rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export default function ServerSettingsPage() {
  const { t } = useT();
  const { server, refresh } = useSession();
  const { showSuccess, showError } = useFlash();
  const navigate = useNavigate();

  const [item, setItem] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (server) setItem({ ...server, attributes: { ...(server.attributes || {}) } });
  }, [server]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.server.update(item);
      showSuccess(t('serverSaved'));
      refresh();
    } catch {
      showError(t('invalidJsonOrSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const setAttr = (key: string, value: any) => setItem((prev: Record<string, any>) => ({
    ...prev,
    attributes: { ...prev.attributes, [key]: value },
  }));

  if (!server) {
    return (
      <div className="space-y-4">
        <div><h2 className="text-lg font-semibold">{t('server')}</h2><p className="text-sm text-muted-foreground">{t('serverDesc')}</p></div>
        <Card><CardContent className="p-4 text-sm text-muted-foreground">{t('noData')}</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <div><h2 className="text-lg font-semibold">{t('server')}</h2><p className="text-sm text-muted-foreground">{t('serverDesc')}</p></div>

      {/* Preferences */}
      <Card>
        <CardHeader><CardTitle className="text-sm">{t('preferences')}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('mapCustomLabel')}</label>
            <Input value={item.mapUrl || ''} onChange={(e) => setItem({ ...item, mapUrl: e.target.value })} className={selectClass} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('mapDefault')}</label>
            <select className={selectClass} value={item.map || 'locationIqStreets'} onChange={(e) => setItem({ ...item, map: e.target.value })}>
              <option value="locationIqStreets">LocationIQ Streets</option>
              <option value="openFreeMap">OpenFreeMap</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('settingsCoordinateFormat')}</label>
            <select className={selectClass} value={item.coordinateFormat || 'dd'} onChange={(e) => setItem({ ...item, coordinateFormat: e.target.value })}>
              <option value="dd">{t('sharedDecimalDegrees')}</option>
              <option value="ddm">{t('sharedDegreesDecimalMinutes')}</option>
              <option value="dms">{t('sharedDegreesMinutesSeconds')}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('settingsSpeedUnit')}</label>
            <select className={selectClass} value={item.attributes?.speedUnit || 'kn'} onChange={(e) => setAttr('speedUnit', e.target.value)}>
              <option value="kn">{t('kn')}</option>
              <option value="kmh">{t('kmh')}</option>
              <option value="mph">{t('mph')}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('settingsDistanceUnit')}</label>
            <select className={selectClass} value={item.attributes?.distanceUnit || 'km'} onChange={(e) => setAttr('distanceUnit', e.target.value)}>
              <option value="km">{t('km')}</option>
              <option value="mi">{t('mi')}</option>
              <option value="nmi">{t('nmi')}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('settingsAltitudeUnit')}</label>
            <select className={selectClass} value={item.attributes?.altitudeUnit || 'm'} onChange={(e) => setAttr('altitudeUnit', e.target.value)}>
              <option value="m">{t('meters')}</option>
              <option value="ft">{t('feet')}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('settingsVolumeUnit')}</label>
            <select className={selectClass} value={item.attributes?.volumeUnit || 'ltr'} onChange={(e) => setAttr('volumeUnit', e.target.value)}>
              <option value="ltr">{t('liter')}</option>
              <option value="usGal">{t('usGallon')}</option>
              <option value="impGal">{t('impGallon')}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('sharedTimezone')}</label>
            <Input value={item.attributes?.timezone || ''} onChange={(e) => setAttr('timezone', e.target.value)} className={selectClass} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('mapPoiLayer')}</label>
            <Input value={item.poiLayer || ''} onChange={(e) => setItem({ ...item, poiLayer: e.target.value })} className={selectClass} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('serverAnnouncement')}</label>
            <Input value={item.announcement || ''} onChange={(e) => setItem({ ...item, announcement: e.target.value })} className={selectClass} />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="rounded border-input accent-primary" checked={item.forceSettings} onChange={(e) => setItem({ ...item, forceSettings: e.target.checked })} />
            {t('serverForceSettings')}
          </label>
        </CardContent>
      </Card>

      {/* Location */}
      <Card>
        <CardHeader><CardTitle className="text-sm">{t('location')}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('latitude')}</label>
            <Input type="number" value={item.latitude || 0} onChange={(e) => setItem({ ...item, latitude: Number(e.target.value) })} className={selectClass} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('longitude')}</label>
            <Input type="number" value={item.longitude || 0} onChange={(e) => setItem({ ...item, longitude: Number(e.target.value) })} className={selectClass} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('serverZoom')}</label>
            <Input type="number" value={item.zoom || 0} onChange={(e) => setItem({ ...item, zoom: Number(e.target.value) })} className={selectClass} />
          </div>
        </CardContent>
      </Card>

      {/* Permissions */}
      <Card>
        <CardHeader><CardTitle className="text-sm">{t('permissions')}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {([['registration', 'serverRegistration'], ['readonly', 'serverReadonly'], ['deviceReadonly', 'userDeviceReadonly'], ['limitCommands', 'userLimitCommands'], ['disableReports', 'userDisableReports'], ['fixedEmail', 'userFixedEmail']] as const).map(([key, labelKey]) => (
            <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="rounded border-input accent-primary" checked={!!(item as any)[key]} onChange={(e) => setItem({ ...item, [key]: e.target.checked })} />
              {t(labelKey)}
            </label>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-center gap-4 pt-2">
        <Button variant="outline" onClick={() => navigate('/settings')}>{t('backToSettings')}</Button>
        <Button variant="default" onClick={handleSave} disabled={saving}>{saving ? t('saving') : t('save')}</Button>
      </div>
    </div>
  );
}
