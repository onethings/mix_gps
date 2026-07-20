import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Send, Terminal } from 'lucide-react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useLiveData } from '@/context/LiveDataContext';
import { useFlash } from '@/context/FlashContext';

interface CommandOption {
  type: string;
  description?: string;
  attributes?: Record<string, { type: string; key: string; name?: string; description?: string }>;
}

export default function CommandSendPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const { showSuccess, showError } = useFlash();
  const { devicesById } = useLiveData();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isGroup = searchParams.get('group') === 'true';

  const deviceId = id && !isGroup ? parseInt(id, 10) : undefined;
  const groupId = id && isGroup ? parseInt(id, 10) : undefined;
  const targetName = deviceId ? devicesById[deviceId]?.name : `Group #${groupId}`;

  const [commandTypes, setCommandTypes] = useState<CommandOption[]>([]);
  const [savedCommands, setSavedCommands] = useState<any[]>([]);
  const [selectedType, setSelectedType] = useState('');
  const [attributes, setAttributes] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!deviceId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const [types, saved] = await Promise.all([
          api.commands.types(deviceId) as Promise<CommandOption[]>,
          api.commands.getSendList(deviceId) as Promise<any[]>,
        ]);
        if (cancelled) return;
        setCommandTypes(Array.isArray(types) ? types : []);
        setSavedCommands(Array.isArray(saved) ? saved : []);
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [deviceId]);

  const handleTypeChange = (type: string) => {
    setSelectedType(type);
    const cmd = commandTypes.find((c) => c.type === type);
    const defaults: Record<string, string> = {};
    if (cmd?.attributes) {
      Object.entries(cmd.attributes).forEach(([key, attr]) => {
        if (attr.type === 'boolean') defaults[key] = 'false';
        else if (attr.type === 'number') defaults[key] = '0';
        else defaults[key] = '';
      });
    }
    setAttributes(defaults);
  };

  const handleSendSaved = async (savedId: number) => {
    setSending(true);
    try {
      // Fetch the saved command and attach the device/group ID
      const saved = await api.commands.get(savedId) as any;
      saved.deviceId = deviceId;
      if (groupId) saved.groupId = groupId;
      await api.commands.send(saved, groupId);
      showSuccess(t('commandSent'));
      navigate(-1);
    } catch (err: any) {
      showError(err.message || t('error'));
    } finally {
      setSending(false);
    }
  };

  const handleSendCustom = async () => {
    if (!selectedType) return;
    setSending(true);
    try {
      const payload: any = { type: selectedType, attributes };
      if (deviceId) payload.deviceId = deviceId;
      if (groupId) payload.groupId = groupId;
      await api.commands.send(payload, groupId);
      showSuccess(t('commandSent'));
      navigate(-1);
    } catch (err: any) {
      showError(err.message || t('error'));
    } finally {
      setSending(false);
    }
  };

  const selectedCmd = commandTypes.find((c) => c.type === selectedType);

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <button type="button" onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          {t('back')}
        </button>
        <h1 className="text-base font-semibold truncate flex items-center gap-1.5">
          <Terminal className="h-4 w-4 text-muted-foreground" />
          {targetName ? `${t('commandSend')} — ${targetName}` : t('commandSend')}
        </h1>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{t('loading')}…</div>
        ) : (
          <div className="mx-auto max-w-lg space-y-3 md:space-y-6">
            {/* Saved commands */}
            {savedCommands.length > 0 && (
              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('sharedSavedCommands')}
                </h2>
                <div className="space-y-1.5">
                  {savedCommands.map((cmd) => (
                    <button key={cmd.id} type="button" onClick={() => handleSendSaved(cmd.id)}
                      disabled={sending}
                      className="flex w-full items-center justify-between rounded-lg border px-4 py-3 text-sm hover:bg-accent transition-colors disabled:opacity-50">
                      <span className="font-medium">{cmd.description || cmd.type}</span>
                      <Send className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Custom command */}
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('commandCustom')}
              </h2>
              <div className="rounded-lg border p-4 space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">{t('sharedType')}</label>
                  <select value={selectedType} onChange={(e) => handleTypeChange(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary">
                    <option value="">{t('selectDevice')}</option>
                    {commandTypes.map((ct) => (
                      <option key={ct.type} value={ct.type}>
                        {t(`command${ct.type.charAt(0).toUpperCase() + ct.type.slice(1)}`) !==
                          `command${ct.type.charAt(0).toUpperCase() + ct.type.slice(1)}`
                          ? t(`command${ct.type.charAt(0).toUpperCase() + ct.type.slice(1)}`)
                          : ct.description || ct.type}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedCmd?.attributes && Object.keys(selectedCmd.attributes).length > 0 && (
                  <div className="space-y-3">
                    <div className="border-t pt-3" />
                    {Object.entries(selectedCmd.attributes).map(([key, attr]) => (
                      <div key={key}>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                          {attr.name || key}
                        </label>
                        {attr.type === 'boolean' ? (
                          <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <input type="checkbox" checked={attributes[key] === 'true'}
                              onChange={(e) => setAttributes({ ...attributes, [key]: e.target.checked ? 'true' : 'false' })}
                              className="rounded" />
                            {attr.description || key}
                          </label>
                        ) : (
                          <input type={attr.type === 'number' ? 'number' : 'text'}
                            value={attributes[key] || ''}
                            onChange={(e) => setAttributes({ ...attributes, [key]: e.target.value })}
                            placeholder={attr.description || ''}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <button type="button" onClick={handleSendCustom}
                  disabled={!selectedType || sending}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60">
                  <Send className="h-4 w-4" />
                  {sending ? t('sending') : t('commandSend')}
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
