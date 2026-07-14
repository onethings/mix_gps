import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Edit, Trash2, Link2, Send, Share2 } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { useFlash } from '@/context/FlashContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePermissions } from '@/hooks/usePermissions';
import { api } from '@/lib/api';
import type { TraccarGroup } from '@/types';

const PAGE_SIZE = 20;

export default function GroupsSettingsPage() {
  const { t } = useT();
  const { showSuccess, showError } = useFlash();
  const navigate = useNavigate();

  const [reloadKey, reload] = useReducer((k) => k + 1, 0);
  const [items, setItems] = useState<TraccarGroup[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadItems = useCallback(async (offset: number, signal?: AbortSignal) => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if (searchKeyword) params.append('keyword', searchKeyword);
    const data = await api.groups.list(params) as TraccarGroup[];
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
      await api.groups.remove(id);
      showSuccess(t('delete'));
      reload();
    } catch { showError(t('deleteFailed')); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-lg font-semibold">{t('groups')}</h2><p className="text-sm text-muted-foreground">{t('groupsDesc')}</p></div>
        <Button size="sm" onClick={() => navigate('/settings/group/new')}>
          <Plus className="h-4 w-4 mr-1" />{t('addGroup')}
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
            <div className="divide-y divide-border text-sm">
              {items.map((g) => (
                <div key={g.id} className="flex items-center justify-between px-4 py-3">
                  <p className="font-medium">{g.name}</p>
                  <div className="flex items-center gap-1">
                    <button className="rounded p-1 hover:bg-accent" title={t('sharedConnections')} onClick={() => navigate(`/settings/entity/group/${g.id}/connections`)}>
                      <Link2 className="h-3.5 w-3.5" />
                    </button>
                    <button className="rounded p-1 hover:bg-accent" title={t('deviceCommand')} onClick={() => navigate(`/settings/entity/group/${g.id}/command`)}>
                      <Send className="h-3.5 w-3.5" />
                    </button>
                    <button className="rounded p-1 hover:bg-accent" title={t('share')} onClick={() => navigate(`/settings/entity/group/${g.id}/share`)}>
                      <Share2 className="h-3.5 w-3.5" />
                    </button>
                    <button className="rounded p-1 hover:bg-accent" title={t('edit')} onClick={() => navigate(`/settings/group/${g.id}`)}>
                      <Edit className="h-3.5 w-3.5" />
                    </button>
                    <button className="rounded p-1 hover:bg-accent text-destructive" title={t('delete')} onClick={() => handleRemove(g.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {hasMore && <div ref={sentinelRef} className="h-4" />}
        </CardContent>
      </Card>
    </div>
  );
}
