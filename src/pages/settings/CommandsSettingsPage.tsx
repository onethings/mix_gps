import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Edit, Trash2, Terminal } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { useFlash } from '@/context/FlashContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { usePermissions } from '@/hooks/usePermissions';
import type { TraccarCommand } from '@/types';

const PAGE_SIZE = 20;

const PREFIX = (prefix: string, value: string) => prefix + value.charAt(0).toUpperCase() + value.slice(1);

/* ── Command type label map ── */
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
  engineStop: 'commandEngineStop',
  engineResume: 'commandEngineResume',
  blockIgnition: 'commandBlockIgnition',
  unblockIgnition: 'commandUnblockIgnition',
  doorLock: 'commandDoorLock',
  doorUnlock: 'commandDoorUnlock',
};

const commandTypeLabel = (type: string): string => {
  const key = COMMAND_TYPE_LABELS[type];
  return key || type;
};

export default function CommandsSettingsPage() {
  const { t } = useT();
  const { showSuccess, showError } = useFlash();
  const navigate = useNavigate();

  const [reloadKey, reload] = useReducer((k) => k + 1, 0);
  const [items, setItems] = useState<TraccarCommand[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadItems = useCallback(async (offset: number, signal?: AbortSignal) => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if (searchKeyword) params.append('keyword', searchKeyword);
    const data = await api.commands.list(params) as TraccarCommand[];
    if (!signal?.aborted) {
      setItems((prev) => (offset ? [...prev, ...data] : data));
      setHasMore(data.length >= PAGE_SIZE);
    }
  }, [searchKeyword]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setItems([]);
    loadItems(0, controller.signal).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; controller.abort(); };
  }, [reloadKey, loadItems]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && hasMore && !loading) {
        setLoading(true);
        loadItems(items.length).finally(() => setLoading(false));
      }
    }, { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, items.length, loadItems]);

  const handleRemove = async (id: number) => {
    try {
      await api.commands.remove(id);
      showSuccess(t('commandDeleted'));
      reload();
    } catch { showError(t('deleteFailed')); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-lg font-semibold">{t('savedCommands')}</h2><p className="text-sm text-muted-foreground">{t('savedCommandsDesc')}</p></div>
        <Button size="sm" onClick={() => navigate('/settings/command/new')}>
          <Plus className="h-4 w-4 mr-1" />{t('add')}
        </Button>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input value={searchKeyword} onChange={(e) => { setSearchKeyword(e.target.value); reload(); }} placeholder={t('search')} className="pl-8" />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading && items.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">{t('loading')}</div>
          ) : items.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">{t('noData')}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                    <th className="px-4 py-2 text-left font-medium">{t('description')}</th>
                    <th className="px-4 py-2 text-left font-medium">{t('type')}</th>
                    <th className="px-4 py-2 text-center font-medium">{t('commandSendSms')}</th>
                    <th className="px-4 py-2 text-center font-medium w-16">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">{c.description || '—'}</td>
                      <td className="px-4 py-3 text-xs">{t(commandTypeLabel(c.type))}</td>
                      <td className="px-4 py-3 text-center">
                        {c.textChannel ? <Badge variant="success" className="text-[10px]">{t('yes')}</Badge> : <span className="text-muted-foreground">{t('no')}</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button className="rounded p-1 hover:bg-accent" title={t('edit')} onClick={() => navigate(`/settings/command/${c.id}`)}>
                            <Edit className="h-3.5 w-3.5" />
                          </button>
                          <button className="rounded p-1 hover:bg-accent text-destructive" title={t('delete')} onClick={() => handleRemove(c.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {hasMore && <div ref={sentinelRef} className="h-4" />}
        </CardContent>
      </Card>
    </div>
  );
}
