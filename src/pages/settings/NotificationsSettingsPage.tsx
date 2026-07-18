import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Edit, Trash2, Bell } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { useFlash } from '@/context/FlashContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import type { TraccarNotification } from '@/types';

const PAGE_SIZE = 20;

const PREFIX = (prefix: string, value: string) => prefix + value.charAt(0).toUpperCase() + value.slice(1);

export default function NotificationsSettingsPage() {
  const { t } = useT();
  const { showSuccess, showError } = useFlash();
  const navigate = useNavigate();

  const [reloadKey, reload] = useReducer((k) => k + 1, 0);
  const [items, setItems] = useState<TraccarNotification[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadItems = useCallback(async (offset: number, signal?: AbortSignal) => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if (searchKeyword) params.append('keyword', searchKeyword);
    const data = await api.notifications.list(params) as TraccarNotification[];
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
      await api.notifications.remove(id);
      showSuccess(t('delete'));
      reload();
    } catch { showError(t('deleteFailed')); }
  };

  const formatList = (prefix: string, value?: string) => {
    if (!value) return '—';
    return value.split(/[, ]+/).filter(Boolean).join(', ');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-lg font-semibold">{t('notifications')}</h2><p className="text-sm text-muted-foreground">{t('notificationsDesc')}</p></div>
        <Button size="sm" onClick={() => navigate('/settings/notification/new')}>
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
                    <th className="px-4 py-2 text-center font-medium">{t('notificationAlways')}</th>
                    <th className="px-4 py-2 text-left font-medium">{t('alarms')}</th>
                    <th className="px-4 py-2 text-left font-medium">{t('notificators')}</th>
                    <th className="px-4 py-2 text-center font-medium w-16">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((n) => (
                    <tr key={n.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">{n.description || '—'}</td>
                      <td className="px-4 py-3 text-xs">{t('eventType_' + n.type) || n.type}</td>
                      <td className="px-4 py-3 text-center">
                        {n.always ? <Badge variant="success" className="text-[10px]">{t('yes')}</Badge> : <span className="text-muted-foreground">{t('no')}</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{formatList('alarm', n.attributes?.alarms as string) || '—'}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{Array.isArray(n.notificators) ? n.notificators.join(', ') : n.notificators || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button className="rounded p-1 hover:bg-accent" title={t('edit')} onClick={() => navigate(`/settings/notification/${n.id}`)}>
                            <Edit className="h-3.5 w-3.5" />
                          </button>
                          <button className="rounded p-1 hover:bg-accent text-destructive" title={t('delete')} onClick={() => handleRemove(n.id)}>
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
