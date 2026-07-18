import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Edit, Trash2, Link2, FileDown } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { useFlash } from '@/context/FlashContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { usePermissions } from '@/hooks/usePermissions';
import { api } from '@/lib/api';
import type { TraccarDevice } from '@/types';

const PAGE_SIZE = 20;

export default function DevicesSettingsPage() {
  const { t } = useT();
  const { showSuccess, showError } = useFlash();
  const navigate = useNavigate();
  const { manager, deviceReadonly } = usePermissions();

  const [reloadKey, reload] = useReducer((k) => k + 1, 0);
  const [items, setItems] = useState<TraccarDevice[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(() => localStorage.getItem('showAllDevices') === 'true');
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadItems = useCallback(async (offset: number, signal?: AbortSignal) => {
    const params = new URLSearchParams({ all: String(showAll), limit: String(PAGE_SIZE), offset: String(offset) });
    if (searchKeyword) params.append('keyword', searchKeyword);
    const data = await api.devices.list(params) as TraccarDevice[];
    if (!signal?.aborted) {
      setItems((prev) => (offset ? [...prev, ...data] : data));
      setHasMore(data.length >= PAGE_SIZE);
    }
  }, [searchKeyword, showAll]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setItems([]);
    loadItems(0, controller.signal).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; controller.abort(); };
  }, [reloadKey, loadItems]);

  useEffect(() => {
    localStorage.setItem('showAllDevices', String(showAll));
  }, [showAll]);

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
      await api.devices.remove(id);
      showSuccess(t('delete'));
      reload();
    } catch { showError(t('deleteFailed')); }
  };

  const statusBadge = (status?: string) => {
    if (!status) return <Badge variant="outline" className="text-[10px]">—</Badge>;
    const map: Record<string, 'success' | 'warning' | 'destructive' | 'outline'> = {
      online: 'success', offline: 'destructive', unknown: 'warning',
    };
    return <Badge variant={map[status] || 'outline'} className="text-[10px]">{status}</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-lg font-semibold">{t('devices')}</h2><p className="text-sm text-muted-foreground">{t('devicesDesc')}</p></div>
        <Button size="sm" onClick={() => navigate('/settings/device/new')} disabled={deviceReadonly}>
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
            <>
              {/* ── Desktop table ── */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                      <th className="px-4 py-2 text-left font-medium">{t('name')}</th>
                      <th className="px-4 py-2 text-left font-medium">{t('deviceIdentifier')}</th>
                      <th className="px-4 py-2 text-left font-medium">{t('group')}</th>
                      <th className="px-4 py-2 text-left font-medium">{t('phone')}</th>
                      <th className="px-4 py-2 text-center font-medium">{t('status')}</th>
                      <th className="px-4 py-2 text-center font-medium w-20">{t('actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {items.map((d) => (
                      <tr key={d.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{d.name}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{d.uniqueId}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{d.groupId || '—'}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{d.phone || '—'}</td>
                        <td className="px-4 py-3 text-center">{statusBadge(d.status)}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button className="rounded p-1 hover:bg-accent" title={t('edit')} onClick={() => navigate(`/settings/device/${d.id}`)}>
                              <Edit className="h-3.5 w-3.5" />
                            </button>
                            {!deviceReadonly && (
                              <button className="rounded p-1 hover:bg-accent text-destructive" title={t('delete')} onClick={() => handleRemove(d.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button className="rounded p-1 hover:bg-accent" title={t('sharedConnections')} onClick={() => navigate(`/settings/entity/device/${d.id}/connections`)}>
                              <Link2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={6} className="px-4 py-2">
                        <div className="flex items-center justify-between">
                          <Button variant="ghost" size="sm" className="text-xs">
                            <FileDown className="h-3.5 w-3.5 mr-1" />{t('export')}
                          </Button>
                          {manager && (
                            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                              <span>{t('all')}</span>
                              <input type="checkbox" checked={showAll} onChange={(e) => { setShowAll(e.target.checked); reload(); }} className="rounded border-input" />
                            </label>
                          )}
                        </div>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* ── Mobile cards ── */}
              <div className="divide-y divide-border md:hidden">
                {items.map((d) => (
                  <div key={d.id} className="px-4 py-3 space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{d.name}</p>
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">{d.uniqueId}</p>
                      </div>
                      <div className="flex items-center gap-1 ml-2 shrink-0">
                        {statusBadge(d.status)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {d.phone && <span>{d.phone}</span>}
                      {d.groupId != null && <span>{t('group')}: {d.groupId}</span>}
                    </div>
                    <div className="flex items-center gap-1 pt-0.5">
                      <button className="rounded p-1.5 hover:bg-accent" title={t('edit')} onClick={() => navigate(`/settings/device/${d.id}`)}>
                        <Edit className="h-4 w-4" />
                      </button>
                      {!deviceReadonly && (
                        <button className="rounded p-1.5 hover:bg-accent text-destructive" title={t('delete')} onClick={() => handleRemove(d.id)}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                      <button className="rounded p-1.5 hover:bg-accent" title={t('sharedConnections')} onClick={() => navigate(`/settings/entity/device/${d.id}/connections`)}>
                        <Link2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
                {/* Export + showAll controls for mobile */}
                <div className="px-4 py-2 flex items-center justify-between">
                  <Button variant="ghost" size="sm" className="text-xs">
                    <FileDown className="h-3.5 w-3.5 mr-1" />{t('export')}
                  </Button>
                  {manager && (
                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                      <span>{t('all')}</span>
                      <input type="checkbox" checked={showAll} onChange={(e) => { setShowAll(e.target.checked); reload(); }} className="rounded border-input" />
                    </label>
                  )}
                </div>
              </div>
            </>
          )}
          {hasMore && <div ref={sentinelRef} className="h-4" />}
        </CardContent>
      </Card>
    </div>
  );
}
