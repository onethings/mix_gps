import { useEffect, useState } from 'react';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { usePermissions } from '@/hooks/usePermissions';
import { useT } from '@/lib/i18n';
import EmptyState from '@/components/common/EmptyState';
import { useFlash } from '@/context/FlashContext';

export default function PermissionsSettingsPage() {
  const { t } = useT();
  const { administrator } = usePermissions();
  const { showError, showSuccess } = useFlash();
  const [text, setText] = useState('[]');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!administrator) { setLoading(false); return undefined; }
    let cancelled = false; setLoadError(null);
    (async () => { try { const list = await api.permissions.list(); if (!cancelled) setText(JSON.stringify(list, null, 2)); } catch (e) { if (!cancelled) setLoadError((e as Error).message || t('failed')); } finally { if (!cancelled) setLoading(false); } })();
    return () => { cancelled = true; };
  }, [administrator]);

  const save = async () => {
    setSaving(true);
    try { const payload = JSON.parse(text); await api.permissions.update(payload); showSuccess(t('permissions') + ' saved'); }
    catch (e) { showError(e instanceof SyntaxError ? t('invalidJson') : (e as Error).message || t('saveFailed')); }
    finally { setSaving(false); }
  };

  if (!administrator) return <EmptyState title={t('adminOnly')} />;

  return (<div className="space-y-6"><PageHeader title={t('permissions')} description="PUT /api/permissions — array of { deviceId, groupId, userId, calendarId, …}" />
    {loadError && <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{loadError}</div>}
    {loading ? <p className="text-sm text-muted-foreground">{t('loading')}</p> : (
      <><Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[400px] font-mono text-xs" spellCheck={false} />
        <Button onClick={save} disabled={saving}>{saving ? t('saving') : t('save')}</Button></>
    )}
  </div>);
}
