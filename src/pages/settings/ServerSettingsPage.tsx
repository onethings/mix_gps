import { useState } from 'react';
import { useT } from '@/lib/i18n';
import { useFlash } from '@/context/FlashContext';
import { useSession } from '@/context/SessionContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import type { TraccarServer } from '@/types';

export default function ServerSettingsPage() {
  const { t } = useT();
  const { server, refresh } = useSession();
  const { showSuccess, showError } = useFlash();
  const [json, setJson] = useState('');
  const [saving, setSaving] = useState(false);

  const handleEdit = () => {
    setJson(JSON.stringify(server, null, 2));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const parsed = JSON.parse(json);
      await api.server.update(parsed);
      showSuccess(t('serverSaved'));
      refresh();
    } catch (e) {
      if (e instanceof SyntaxError) showError(t('invalidJson'));
      else showError(t('invalidJsonOrSaveFailed'));
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-lg font-semibold">{t('server')}</h2><p className="text-sm text-muted-foreground">{t('serverDesc')}</p></div>
        {!json && <Button size="sm" onClick={handleEdit}>{t('edit')}</Button>}
      </div>
      {json ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            <Textarea value={json} onChange={(e) => setJson(e.target.value)} rows={20} className="font-mono text-xs" />
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving}>{saving ? t('saving') : t('saveChanges')}</Button>
              <Button variant="outline" onClick={() => setJson('')}>{t('cancel')}</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-4 text-sm">
            {server ? (
              <pre className="font-mono text-xs whitespace-pre-wrap">{JSON.stringify(server, null, 2)}</pre>
            ) : (
              <p className="text-muted-foreground">{t('noData')}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
