import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Smartphone, Save, X, ArrowLeft } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { useFlash } from '@/context/FlashContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';

export default function DeviceEditorPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useT();
  const { showSuccess, showError } = useFlash();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [uniqueId, setUniqueId] = useState('');
  const [phone, setPhone] = useState('');
  const [model, setModel] = useState('');
  const [contact, setContact] = useState('');
  const [category, setCategory] = useState('');
  const [groupId, setGroupId] = useState<number | undefined>();
  const [groups, setGroups] = useState<{ id: number; name: string }[]>([]);

  const fieldClass = 'rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring w-full';

  useEffect(() => {
    api.groups.list().then((data) => { if (Array.isArray(data)) setGroups(data as any); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await api.devices.get(Number(id)) as any;
        if (!cancelled) {
          setName(data.name || '');
          setUniqueId(data.uniqueId || '');
          setPhone(data.phone || '');
          setModel(data.model || '');
          setContact(data.contact || '');
          setCategory(data.category || '');
          setGroupId(data.groupId);
        }
      } catch { if (!cancelled) showError(t('loadFailed')); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [id, isNew, showError, t]);

  const handleSave = useCallback(async () => {
    if (!name.trim() || !uniqueId.trim()) { showError(t('nameRequired')); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        uniqueId: uniqueId.trim(),
      };
      if (phone.trim()) payload.phone = phone.trim();
      if (model.trim()) payload.model = model.trim();
      if (contact.trim()) payload.contact = contact.trim();
      if (category.trim()) payload.category = category.trim();
      if (groupId) payload.groupId = groupId;

      if (isNew) { await api.devices.create(payload); showSuccess(t('entityCreated')); }
      else { await api.devices.update(Number(id), payload); showSuccess(t('entitySaved')); }
      navigate('/settings/devices');
    } catch (err: unknown) {
      showError(`${t('saveFailed')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setSaving(false); }
  }, [name, uniqueId, phone, model, contact, category, groupId, isNew, id, showSuccess, showError, t, navigate]);

  if (loading) {
    return <div className="space-y-4 pb-8"><div className="flex items-center gap-2 text-sm text-muted-foreground"><div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />{t('loading')}…</div></div>;
  }

  return (
    <div className="space-y-4 pb-8 max-w-lg">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate('/settings/devices')} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent"><ArrowLeft className="h-5 w-5" /></button>
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2"><Smartphone className="h-5 w-5" />{isNew ? t('add') : t('edit')} {t('device')}</h2>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">{t('sharedRequired')}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('name')} *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('vehicleFormName')} autoFocus />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('deviceIdentifier')} *</label>
            <Input value={uniqueId} onChange={(e) => setUniqueId(e.target.value)} placeholder={t('vehicleFormImeiPlaceholder')} className="font-mono text-xs" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">{t('details')}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('phone')}</label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('vehicleFormOptional')} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('model')}</label>
            <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder={t('vehicleFormModelPlaceholder')} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('contact')}</label>
            <Input value={contact} onChange={(e) => setContact(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('category')}</label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder={t('vehicleFormOptional')} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('group')}</label>
            <select value={groupId ?? ''} onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : undefined)} className={fieldClass}>
              <option value="">—</option>
              {groups.map((g) => (<option key={g.id} value={g.id}>{g.name}</option>))}
            </select>
          </div>
        </CardContent>
      </Card>

      {!isNew && <Badge variant="secondary" className="text-[10px] font-mono">ID: {id} · {uniqueId}</Badge>}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={() => navigate('/settings/devices')}><X className="h-4 w-4 mr-1.5" />{t('cancel')}</Button>
        <Button variant="default" onClick={handleSave} disabled={saving}>
          {saving ? <><div className="h-4 w-4 mr-1.5 animate-spin rounded-full border-2 border-current border-t-transparent" />{t('saving')}</> : <><Save className="h-4 w-4 mr-1.5" />{isNew ? t('add') : t('save')}</>}
        </Button>
      </div>
    </div>
  );
}
