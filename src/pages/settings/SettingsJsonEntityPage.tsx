import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useT } from '@/lib/i18n';
import { useFlash } from '@/context/FlashContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api, request } from '@/lib/api';

const ENDPOINT_MAP: Record<string, string> = {
  user: 'users',
  device: 'devices',
  group: 'groups',
  geofence: 'geofences',
  driver: 'drivers',
  maintenance: 'maintenance',
  calendar: 'calendars',
  command: 'commands',
  notification: 'notifications',
  attribute: 'attributes/computed',
};

const selectClass = 'rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring w-full';

export default function SettingsJsonEntityPage() {
  const { kind, id } = useParams<{ kind: string; id: string }>();
  const { t } = useT();
  const { showSuccess, showError } = useFlash();
  const navigate = useNavigate();

  const [item, setItem] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [json, setJson] = useState('');

  const endpoint = ENDPOINT_MAP[kind || ''] || kind;

  useEffect(() => {
    if (!id || id === 'new') {
      setItem({});
      setJson('{}');
      setLoading(false);
      return;
    }
    setLoading(true);
    request(`/${endpoint}/${id}`)
      .then((data: any) => {
        setItem(data);
        setJson(JSON.stringify(data, null, 2));
      })
      .catch(() => showError(t('loadFailed')))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, endpoint, t]);

  // Attempt to use the typed API if available
  const entityApi = (api as any)[endpoint.replace('/', '')];
  const hasTypedApi = entityApi && (id === 'new' ? entityApi.create : entityApi.update);

  const handleSave = useCallback(async () => {
    try {
      const parsed = JSON.parse(json);
      let result;
      if (hasTypedApi) {
        result = id === 'new' || id === undefined
          ? await entityApi.create(parsed)
          : await entityApi.update(Number(id), parsed);
      } else {
        result = await request(`/${endpoint}${id && id !== 'new' ? `/${id}` : ''}`, {
          method: id === 'new' || !id ? 'POST' : 'PUT',
          body: JSON.stringify(parsed),
        });
      }
      showSuccess(t('entitySaved'));
      navigate('/settings');
    } catch (e: any) {
      showError(e?.message || t('invalidJson'));
    }
  }, [json, id, endpoint, entityApi, hasTypedApi, showSuccess, showError, t, navigate]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div><h2 className="text-lg font-semibold">{t('entityEdit').replace('{kind}', kind || 'unknown')}</h2></div>
        <Card><CardContent className="p-4 text-sm text-muted-foreground">{t('loading')}</CardContent></Card>
      </div>
    );
  }

  const isNew = id === 'new' || !id;

  return (
    <div className="space-y-4 pb-8">
      <div>
        <h2 className="text-lg font-semibold">
          {isNew ? t('entityCreate').replace('{kind}', kind || 'unknown') : t('entityEdit').replace('{kind}', kind || 'unknown')}
        </h2>
        <p className="text-sm text-muted-foreground">{kind}: {isNew ? t('new') : id}</p>
      </div>

      {/* Simple fields editor for common properties */}
      {item && (
        <Card>
          <CardHeader><CardTitle className="text-sm">{t('sharedRequired')}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {item.name !== undefined && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t('name')}</label>
                <Input value={item.name || ''} onChange={(e) => {
                  const newItem = { ...item, name: e.target.value };
                  setItem(newItem);
                  setJson(JSON.stringify(newItem, null, 2));
                }} className={selectClass} />
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">JSON</label>
              <Textarea value={json} onChange={(e) => {
                setJson(e.target.value);
                try { setItem(JSON.parse(e.target.value)); } catch { /* keep last valid */ }
              }} rows={20} className="font-mono text-xs" />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-center gap-4 pt-2">
        <Button variant="outline" onClick={() => navigate('/settings')}>{t('backToSettings')}</Button>
        <Button variant="default" onClick={handleSave}>{t('saveChanges')}</Button>
      </div>
    </div>
  );
}
