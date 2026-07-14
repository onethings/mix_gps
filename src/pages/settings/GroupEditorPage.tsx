import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Layers, Save, X, ArrowLeft } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { useFlash } from '@/context/FlashContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';

export default function GroupEditorPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useT();
  const { showSuccess, showError } = useFlash();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState<number | undefined>();

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await api.groups.get(Number(id)) as any;
        if (!cancelled) { setName(data.name || ''); setGroupId(data.groupId); }
      } catch { if (!cancelled) showError(t('loadFailed')); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [id, isNew, showError, t]);

  const handleSave = useCallback(async () => {
    if (!name.trim()) { showError(t('nameRequired')); return; }
    setSaving(true);
    try {
      const payload: any = { name: name.trim() };
      if (groupId) payload.groupId = groupId;
      if (isNew) { await api.groups.create(payload); showSuccess(t('entityCreated')); }
      else { await api.groups.update(Number(id), payload); showSuccess(t('entitySaved')); }
      navigate('/settings/groups');
    } catch (err: unknown) {
      showError(`${t('saveFailed')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setSaving(false); }
  }, [name, groupId, isNew, id, showSuccess, showError, t, navigate]);

  if (loading) {
    return <div className="space-y-4 pb-8"><div className="flex items-center gap-2 text-sm text-muted-foreground"><div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />{t('loading')}…</div></div>;
  }

  return (
    <div className="space-y-4 pb-8 max-w-lg">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate('/settings/groups')} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent"><ArrowLeft className="h-5 w-5" /></button>
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2"><Layers className="h-5 w-5" />{isNew ? t('add') : t('edit')} {t('group')}</h2>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">{t('sharedRequired')}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('name')} *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('enterGroupName')} autoFocus />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={() => navigate('/settings/groups')}><X className="h-4 w-4 mr-1.5" />{t('cancel')}</Button>
        <Button variant="default" onClick={handleSave} disabled={saving}>
          {saving ? <><div className="h-4 w-4 mr-1.5 animate-spin rounded-full border-2 border-current border-t-transparent" />{t('saving')}</> : <><Save className="h-4 w-4 mr-1.5" />{isNew ? t('add') : t('save')}</>}
        </Button>
      </div>
    </div>
  );
}
