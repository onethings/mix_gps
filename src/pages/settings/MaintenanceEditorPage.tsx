import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Wrench, Save, X, ArrowLeft } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { useFlash } from '@/context/FlashContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';

export default function MaintenanceEditorPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useT();
  const { showSuccess, showError } = useFlash();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('service');
  const [start, setStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [periodDays, setPeriodDays] = useState('30');

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await api.maintenance.get(Number(id)) as any;
        if (!cancelled) {
          setName(data.name || '');
          setType(data.type || 'service');
          setStart(data.start ? new Date(data.start).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
          setPeriodDays(data.period ? String(Math.round(data.period / 86400000)) : '30');
        }
      } catch { if (!cancelled) showError(t('loadFailed')); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [id, isNew, showError, t]);

  const handleSave = useCallback(async () => {
    if (!name.trim()) { showError(t('nameRequired')); return; }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        type,
        start: new Date(start).toISOString(),
        period: Number(periodDays) * 86400000,
      };
      if (isNew) { await api.maintenance.create(payload); showSuccess(t('entityCreated')); }
      else { await api.maintenance.update(Number(id), payload); showSuccess(t('entitySaved')); }
      navigate('/settings/maintenance');
    } catch (err: unknown) {
      showError(`${t('saveFailed')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setSaving(false); }
  }, [name, type, start, periodDays, isNew, id, showSuccess, showError, t, navigate]);

  const fieldClass = 'rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring w-full';

  if (loading) {
    return <div className="space-y-4 pb-8"><div className="flex items-center gap-2 text-sm text-muted-foreground"><div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />{t('loading')}…</div></div>;
  }

  return (
    <div className="space-y-4 pb-8 max-w-lg">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate('/settings/maintenance')} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent"><ArrowLeft className="h-5 w-5" /></button>
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2"><Wrench className="h-5 w-5" />{isNew ? t('add') : t('edit')} {t('maintenance')}</h2>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">{t('sharedRequired')}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('name')} *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('maintFormName')} autoFocus />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('type')}</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className={fieldClass}>
              <option value="service">{t('maintFormService')}</option>
              <option value="inspection">{t('maintFormInspection')}</option>
              <option value="repair">{t('maintFormRepair')}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('maintFormStartDate')}</label>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={fieldClass} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('maintFormPeriod')}</label>
            <Input type="number" value={periodDays} onChange={(e) => setPeriodDays(e.target.value)} className={fieldClass} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={() => navigate('/settings/maintenance')}><X className="h-4 w-4 mr-1.5" />{t('cancel')}</Button>
        <Button variant="default" onClick={handleSave} disabled={saving}>
          {saving ? <><div className="h-4 w-4 mr-1.5 animate-spin rounded-full border-2 border-current border-t-transparent" />{t('saving')}</> : <><Save className="h-4 w-4 mr-1.5" />{isNew ? t('add') : t('save')}</>}
        </Button>
      </div>
    </div>
  );
}
