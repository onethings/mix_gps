import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Terminal, Save, X, ArrowLeft } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { useFlash } from '@/context/FlashContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useCommandAttributes, type CommandAttributeDef } from '@/hooks/useCommandAttributes';

const COMMAND_TYPE_LABELS: Record<string, string> = {
  custom: 'commandCustom',
  positionPeriodic: 'commandPositionPeriodic',
  setTimezone: 'commandSetTimezone',
  sendSms: 'commandSendSms',
  message: 'commandMessage',
  sendUssd: 'commandSendUssd',
  sosNumber: 'commandSosNumber',
  silenceTime: 'commandSilenceTime',
  setPhonebook: 'commandSetPhonebook',
  voiceMessage: 'commandVoiceMessage',
  outputControl: 'commandOutputControl',
  voiceMonitoring: 'commandVoiceMonitoring',
  setAgps: 'commandSetAgps',
  setIndicator: 'commandSetIndicator',
  configuration: 'commandConfiguration',
  setConnection: 'commandSetConnection',
  setOdometer: 'commandSetOdometer',
  modePowerSaving: 'commandModePowerSaving',
  modeDeepSleep: 'commandModeDeepSleep',
  alarmGeofence: 'commandAlarmGeofence',
  alarmBattery: 'commandAlarmBattery',
  alarmSos: 'commandAlarmSos',
  alarmRemove: 'commandAlarmRemove',
  alarmClock: 'commandAlarmClock',
  alarmSpeed: 'commandAlarmSpeed',
  alarmFall: 'commandAlarmFall',
  alarmVibration: 'commandAlarmVibration',
};

const typeLabel = (t: (key: string) => string, type: string): string => {
  const key = COMMAND_TYPE_LABELS[type];
  if (key) return t(key);
  return type;
};

export default function CommandEditorPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useT();
  const { showSuccess, showError } = useFlash();
  const navigate = useNavigate();
  const availableAttributes = useCommandAttributes();
  const isNew = !id || id === 'new';

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [item, setItem] = useState<{
    description?: string;
    type?: string;
    textChannel?: boolean;
    attributes: Record<string, unknown>;
  }>({ attributes: {} });

  // Load existing command
  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await api.commands.get(Number(id)) as any;
        if (!cancelled) {
          setItem({
            description: data.description || '',
            type: data.type,
            textChannel: data.textChannel || false,
            attributes: (data.attributes as Record<string, unknown>) || {},
          });
        }
      } catch (err) {
        if (!cancelled) showError(t('loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, isNew, showError, t]);

  const attributes = useMemo(
    () => (item.type ? availableAttributes[item.type] || [] : []),
    [availableAttributes, item.type],
  );

  const updateAttr = useCallback((key: string, value: unknown) => {
    setItem((prev) => ({ ...prev, attributes: { ...prev.attributes, [key]: value } }));
  }, []);

  const validate = item.type;

  const handleSave = useCallback(async () => {
    if (!validate) { showError(t('nameRequired')); return; }
    setSaving(true);
    try {
      const payload = {
        description: item.description || '',
        type: item.type,
        textChannel: item.textChannel || false,
        attributes: item.attributes,
      };
      if (isNew) {
        await api.commands.create(payload);
        showSuccess(t('entityCreated'));
      } else {
        await api.commands.update(Number(id), payload);
        showSuccess(t('entitySaved'));
      }
      navigate('/settings/commands');
    } catch (err: unknown) {
      showError(`${t('saveFailed')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setSaving(false); }
  }, [item, isNew, id, showSuccess, showError, t, navigate, validate]);

  const fieldClass =
    'rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring w-full';

  if (loading) {
    return (
      <div className="space-y-4 pb-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          {t('loading')}…
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8 max-w-lg">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate('/settings/commands')} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            {isNew ? t('add') : t('edit')} {t('savedCommands')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('savedCommandsDesc')}</p>
        </div>
      </div>

      {/* Command type selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">{t('sharedRequired')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('description')}</label>
            <Input
              value={item.description || ''}
              onChange={(e) => setItem((prev) => ({ ...prev, description: e.target.value }))}
              placeholder={t('commandDescriptionPlaceholder')}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('sharedType')} *</label>
            <select
              value={item.type || ''}
              onChange={(e) => {
                const type = e.target.value;
                const attrDefs = availableAttributes[type] || [];
                const defaults: Record<string, unknown> = {};
                attrDefs.forEach((a: CommandAttributeDef) => {
                  defaults[a.key] = a.type === 'boolean' ? false : a.type === 'number' ? 0 : '';
                });
                setItem((prev) => ({ ...prev, type, attributes: defaults }));
              }}
              className={fieldClass}
            >
              <option value="">— {t('sharedSelect')} —</option>
              {Object.keys(availableAttributes).map((type) => (
                <option key={type} value={type}>{typeLabel(t, type)}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Command parameters */}
      {item.type && attributes.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{t('commandParameters')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {attributes.map((attr) => {
              if (attr.type === 'boolean') {
                return (
                  <label key={attr.key} className="flex items-center gap-2.5 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded border-input accent-primary"
                      checked={Boolean(item.attributes[attr.key])}
                      onChange={(e) => updateAttr(attr.key, e.target.checked)}
                    />
                    {attr.name}
                  </label>
                );
              }
              if (attr.type === 'number') {
                return (
                  <div key={attr.key} className="space-y-1.5">
                    <label className="text-sm font-medium">{attr.name}</label>
                    <Input
                      type="number"
                      value={String(item.attributes[attr.key] ?? '')}
                      onChange={(e) => updateAttr(attr.key, Number(e.target.value))}
                      className={fieldClass}
                    />
                  </div>
                );
              }
              return (
                <div key={attr.key} className="space-y-1.5">
                  <label className="text-sm font-medium">{attr.name}</label>
                  {attr.key === 'data' ? (
                    <Textarea
                      value={String(item.attributes[attr.key] ?? '')}
                      onChange={(e) => updateAttr(attr.key, e.target.value)}
                      rows={3}
                      className="font-mono text-xs"
                    />
                  ) : (
                    <Input
                      value={String(item.attributes[attr.key] ?? '')}
                      onChange={(e) => updateAttr(attr.key, e.target.value)}
                      className={fieldClass}
                    />
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Options */}
      {item.type && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{t('commandOptions')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="rounded border-input accent-primary"
                checked={Boolean(item.textChannel)}
                onChange={(e) => setItem((prev) => ({ ...prev, textChannel: e.target.checked }))}
              />
              {t('commandSendSms')}
            </label>
            {!item.textChannel && (
              <label className="flex items-center gap-2.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded border-input accent-primary"
                  checked={Boolean(item.attributes?.noQueue)}
                  onChange={(e) => updateAttr('noQueue', e.target.checked)}
                />
                {t('commandNoQueue')}
              </label>
            )}
          </CardContent>
        </Card>
      )}

      {/* Type badge */}
      {item.type && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px] font-mono">
            {item.type}
          </Badge>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={() => navigate('/settings/commands')}>
          <X className="h-4 w-4 mr-1.5" />{t('cancel')}
        </Button>
        <Button variant="default" onClick={handleSave} disabled={saving || !validate}>
          {saving ? (
            <><div className="h-4 w-4 mr-1.5 animate-spin rounded-full border-2 border-current border-t-transparent" />{t('saving')}</>
          ) : (
            <><Save className="h-4 w-4 mr-1.5" />{isNew ? t('add') : t('save')}</>
          )}
        </Button>
      </div>
    </div>
  );
}
