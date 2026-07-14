import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Calculator, Save, X, ArrowLeft, Beaker, FlaskConical } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { useFlash } from '@/context/FlashContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';

export default function AttributeEditorPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useT();
  const { showSuccess, showError } = useFlash();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [item, setItem] = useState<{ description?: string; attribute?: string; expression?: string; type?: string; priority?: number }>({});
  const [deviceId, setDeviceId] = useState<number | undefined>();
  const [devices, setDevices] = useState<{ id: number; name: string }[]>([]);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const fieldClass = 'rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring w-full';

  useEffect(() => {
    api.devices.list().then((data) => { if (Array.isArray(data)) setDevices(data as any); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await api.computedAttributes.get(Number(id)) as any;
        if (!cancelled) setItem(data);
      } catch { if (!cancelled) showError(t('loadFailed')); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [id, isNew, showError, t]);

  const handleSave = useCallback(async () => {
    if (!item?.description || !item?.expression) { showError(t('nameRequired')); return; }
    setSaving(true);
    try {
      if (isNew) { await api.computedAttributes.create(item); showSuccess(t('entityCreated')); }
      else { await api.computedAttributes.update(Number(id), item); showSuccess(t('entitySaved')); }
      navigate('/settings/attributes');
    } catch (err: unknown) {
      showError(`${t('saveFailed')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setSaving(false); }
  }, [item, isNew, id, showSuccess, showError, t, navigate]);

  const handleTest = useCallback(async () => {
    if (!deviceId || !item) return;
    setTesting(true);
    try {
      const result = await api.computedAttributes.test(deviceId, item) as string;
      setTestResult(result);
    } catch (err: unknown) {
      setTestResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setTesting(false); }
  }, [deviceId, item]);

  if (loading) {
    return <div className="space-y-4 pb-8"><div className="flex items-center gap-2 text-sm text-muted-foreground"><div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />{t('loading')}…</div></div>;
  }

  return (
    <div className="space-y-4 pb-8 max-w-lg">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate('/settings/attributes')} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent"><ArrowLeft className="h-5 w-5" /></button>
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2"><Calculator className="h-5 w-5" />{isNew ? t('add') : t('edit')} {t('computedAttributes')}</h2>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">{t('sharedRequired')}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('description')} *</label>
            <Input value={item.description || ''} onChange={(e) => setItem((p) => ({ ...p, description: e.target.value }))} placeholder={t('attributeDescriptionPlaceholder')} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('attribute')}</label>
            <Input value={item.attribute || ''} onChange={(e) => setItem((p) => ({ ...p, attribute: e.target.value }))} placeholder="e.g. myCustomField" className="font-mono text-xs" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('expression')} *</label>
            <Textarea value={item.expression || ''} onChange={(e) => setItem((p) => ({ ...p, expression: e.target.value }))} rows={4} className="font-mono text-xs" placeholder="e.g. speed > 100 ? 'overspeed' : 'normal'" spellCheck={false} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('type')}</label>
            <select value={item.type || 'string'} onChange={(e) => setItem((p) => ({ ...p, type: e.target.value }))} className={fieldClass}>
              <option value="string">{t('sharedTypeString')}</option>
              <option value="number">{t('sharedTypeNumber')}</option>
              <option value="boolean">{t('sharedTypeBoolean')}</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">{t('sharedExtra')}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('priority')}</label>
            <Input type="number" value={String(item.priority ?? 0)} onChange={(e) => setItem((p) => ({ ...p, priority: Number(e.target.value) }))} className={fieldClass} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">{t('test')}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('device')}</label>
            <select value={deviceId ?? ''} onChange={(e) => setDeviceId(e.target.value ? Number(e.target.value) : undefined)} className={fieldClass}>
              <option value="">— {t('sharedSelect')} —</option>
              {devices.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
            </select>
          </div>
          <Button variant="outline" size="sm" onClick={handleTest} disabled={!deviceId || testing}>
            <FlaskConical className="h-4 w-4 mr-1.5" />{testing ? `${t('testing')}…` : t('testExpression')}
          </Button>
          {testResult !== null && (
            <div className="rounded-lg border bg-muted/50 px-3 py-2 text-xs font-mono break-all">{testResult}</div>
          )}
        </CardContent>
      </Card>

      {item.attribute && <Badge variant="secondary" className="text-[10px] font-mono">{item.attribute}</Badge>}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={() => navigate('/settings/attributes')}><X className="h-4 w-4 mr-1.5" />{t('cancel')}</Button>
        <Button variant="default" onClick={handleSave} disabled={saving}>
          {saving ? <><div className="h-4 w-4 mr-1.5 animate-spin rounded-full border-2 border-current border-t-transparent" />{t('saving')}</> : <><Save className="h-4 w-4 mr-1.5" />{isNew ? t('add') : t('save')}</>}
        </Button>
      </div>
    </div>
  );
}
