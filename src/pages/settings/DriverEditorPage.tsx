import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { UserRound, Save, X, ArrowLeft } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { useFlash } from '@/context/FlashContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';

export default function DriverEditorPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useT();
  const { showSuccess, showError } = useFlash();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [uniqueId, setUniqueId] = useState('');

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await api.drivers.get(Number(id)) as any;
        if (!cancelled) { setName(data.name || ''); setUniqueId(data.uniqueId || ''); }
      } catch { if (!cancelled) showError(t('loadFailed')); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [id, isNew, showError, t]);

  const handleSave = useCallback(async () => {
    if (!name.trim() || !uniqueId.trim()) { showError(t('nameRequired')); return; }
    setSaving(true);
    try {
      const payload = { name: name.trim(), uniqueId: uniqueId.trim() };
      if (isNew) { await api.drivers.create(payload); showSuccess(t('entityCreated')); }
      else { await api.drivers.update(Number(id), payload); showSuccess(t('entitySaved')); }
      navigate('/settings/drivers');
    } catch (err: unknown) {
      showError(`${t('saveFailed')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setSaving(false); }
  }, [name, uniqueId, isNew, id, showSuccess, showError, t, navigate]);

  if (loading) {
    return <div className="space-y-4 pb-8"><div className="flex items-center gap-2 text-sm text-muted-foreground"><div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />{t('loading')}…</div></div>;
  }

  return (
    <div className="space-y-4 pb-8 max-w-lg">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate('/settings/drivers')} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent"><ArrowLeft className="h-5 w-5" /></button>
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2"><UserRound className="h-5 w-5" />{isNew ? t('add') : t('edit')} {t('driver')}</h2>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">{t('sharedRequired')}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('name')} *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('driverFormName')} autoFocus />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('deviceIdentifier')} *</label>
            <Input value={uniqueId} onChange={(e) => setUniqueId(e.target.value)} placeholder={t('driverFormUniqueId')} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={() => navigate('/settings/drivers')}><X className="h-4 w-4 mr-1.5" />{t('cancel')}</Button>
        <Button variant="default" onClick={handleSave} disabled={saving}>
          {saving ? <><div className="h-4 w-4 mr-1.5 animate-spin rounded-full border-2 border-current border-t-transparent" />{t('saving')}</> : <><Save className="h-4 w-4 mr-1.5" />{isNew ? t('add') : t('save')}</>}
        </Button>
      </div>
    </div>
  );
}
