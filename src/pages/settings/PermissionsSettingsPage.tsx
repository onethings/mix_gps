import { useEffect, useState } from 'react';
import { Shield, Info, Save, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { usePermissions } from '@/hooks/usePermissions';
import { useT } from '@/lib/i18n';
import { useFlash } from '@/context/FlashContext';
import { Badge } from '@/components/ui/badge';
import EmptyState from '@/components/common/EmptyState';

export default function PermissionsSettingsPage() {
  const { t } = useT();
  const { administrator } = usePermissions();
  const { showError, showSuccess } = useFlash();
  const [text, setText] = useState('[]');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!administrator) { setLoading(false); return; }
    let cancelled = false;
    setLoadError(null);
    (async () => {
      try {
        const list = await api.permissions.list();
        if (!cancelled) {
          setText(JSON.stringify(list, null, 2));
          setDirty(false);
        }
      } catch (e) {
        if (!cancelled) setLoadError((e as Error).message || t('failed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [administrator, t]);

  const save = async () => {
    setSaving(true);
    try {
      const payload = JSON.parse(text);
      await api.permissions.update(payload);
      showSuccess(`${t('permissions')} saved`);
      setDirty(false);
    } catch (e) {
      showError(e instanceof SyntaxError ? t('invalidJson') : (e as Error).message || t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setLoading(true);
    try {
      const list = await api.permissions.list();
      setText(JSON.stringify(list, null, 2));
      setDirty(false);
    } catch (e) {
      showError((e as Error).message || t('failed'));
    } finally {
      setLoading(false);
    }
  };

  if (!administrator) {
    return <EmptyState icon={Shield} title={t('adminOnly')} description={t('noPermissionDesc')} />;
  }

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t('permissions')}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            PUT /api/permissions — {t('permissionsDesc')}
          </p>
        </div>
        {dirty && (
          <Badge variant="outline" className="text-amber-500 border-amber-500/30 bg-amber-500/5 text-[10px]">
            {t('unsavedChanges')}
          </Badge>
        )}
      </div>

      {/* Error banner */}
      {loadError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center gap-2">
          <Info className="h-4 w-4 shrink-0" />
          {loadError}
        </div>
      )}

      {/* Editor */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            JSON Editor
            <span className="text-xs font-normal text-muted-foreground">
              — {t('permissionsArrayOf')}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                {t('loading')}…
              </div>
            </div>
          ) : (
            <>
              <Textarea
                value={text}
                onChange={(e) => { setText(e.target.value); setDirty(true); }}
                className="min-h-[400px] font-mono text-xs leading-relaxed"
                spellCheck={false}
              />
              <div className="flex items-center gap-2">
                <Button onClick={save} disabled={saving || !dirty}>
                  {saving ? (
                    <><div className="h-4 w-4 mr-1.5 animate-spin rounded-full border-2 border-current border-t-transparent" />{t('saving')}</>
                  ) : (
                    <><Save className="h-4 w-4 mr-1.5" />{t('saveChanges')}</>
                  )}
                </Button>
                <Button variant="outline" onClick={handleReset} disabled={loading || !dirty}>
                  <RotateCcw className="h-4 w-4 mr-1.5" />
                  {t('reset')}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
