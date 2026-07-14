import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, LogIn, Link2, Edit, Trash2, UserCheck, UserX } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { useFlash } from '@/context/FlashContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { usePermissions } from '@/hooks/usePermissions';
import { useSession } from '@/context/SessionContext';
import { api, request } from '@/lib/api';
import type { TraccarUser } from '@/types';

const PAGE_SIZE = 20;

export default function UsersSettingsPage() {
  const { t } = useT();
  const { showSuccess, showError } = useFlash();
  const navigate = useNavigate();
  const { manager, administrator } = usePermissions();
  const { user: currentUser } = useSession();

  const [reloadKey, reload] = useReducer((k) => k + 1, 0);
  const [items, setItems] = useState<TraccarUser[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showTemporary, setShowTemporary] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadItems = useCallback(async (offset: number, signal?: AbortSignal) => {
    const params = new URLSearchParams({ excludeAttributes: 'true', limit: String(PAGE_SIZE), offset: String(offset) });
    if (searchKeyword) params.append('keyword', searchKeyword);
    const data = await api.users.list(params) as TraccarUser[];
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

  // Infinite scroll
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

  const handleLoginAs = async (userId: number) => {
    try {
      await api.session.becomeUser(userId);
      window.location.replace('/');
    } catch { showError(t('saveFailed')); }
  };

  const handleRemove = async (id: number) => {
    setRemoving(id);
    try {
      await api.users.remove(id);
      showSuccess(t('delete'));
      reload();
    } catch { showError(t('deleteFailed')); }
    finally { setRemoving(null); }
  };

  const filtered = items.filter((u) => showTemporary || !(u as unknown as Record<string, unknown>).temporary);

  // Regular (non-manager) users: redirect to self-edit
  useEffect(() => {
    if (!manager && currentUser?.id) {
      navigate(`/settings/user/${currentUser.id}`, { replace: true });
    }
  }, [manager, currentUser, navigate]);

  if (!manager) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-lg font-semibold">{t('users')}</h2><p className="text-sm text-muted-foreground">{t('usersDesc')}</p></div>
        {manager && (
          <Button size="sm" onClick={() => navigate('/settings/user/new')}>
            <Plus className="h-4 w-4 mr-1" />{t('addUser')}
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input value={searchKeyword} onChange={(e) => { setSearchKeyword(e.target.value); reload(); }} placeholder={t('search')} className="pl-8" />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading && items.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">{t('loading')}</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">{t('noData')}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                    <th className="px-4 py-2 text-left font-medium">{t('name')}</th>
                    <th className="px-4 py-2 text-left font-medium">{t('email')}</th>
                    <th className="px-4 py-2 text-center font-medium">{t('userAdmin')}</th>
                    <th className="px-4 py-2 text-center font-medium">{t('sharedDisabled')}</th>
                    <th className="px-4 py-2 text-left font-medium">{t('userExpirationTime')}</th>
                    <th className="px-4 py-2 text-center font-medium">{t('deviceTitle')}</th>
                    <th className="px-4 py-2 text-center font-medium w-24">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((u) => (
                    <tr key={u.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{u.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                      <td className="px-4 py-3 text-center">
                        {u.administrator ? <UserCheck className="h-4 w-4 inline text-green-600" /> : <UserX className="h-4 w-4 inline text-muted-foreground" />}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {u.disabled ? <Badge variant="destructive" className="text-[10px]">{t('sharedDisabled')}</Badge> : <Badge variant="success" className="text-[10px]">{t('online')}</Badge>}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{u.expiration ? new Date(u.expiration).toLocaleDateString() : '—'}</td>
                      <td className="px-4 py-3 text-center text-xs text-muted-foreground">—</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button className="rounded p-1 hover:bg-accent" title={t('edit')} onClick={() => navigate(manager ? `/settings/user/${u.id}` : '/settings/preferences')}>
                            <Edit className="h-3.5 w-3.5" />
                          </button>
                          {administrator && (
                            <button className="rounded p-1 hover:bg-accent text-destructive" title={t('delete')} onClick={() => handleRemove(u.id)} disabled={removing === u.id}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {manager && (
                            <>
                              <button className="rounded p-1 hover:bg-accent" title={t('loginLogin')} onClick={() => handleLoginAs(u.id)}>
                                <LogIn className="h-3.5 w-3.5" />
                              </button>
                              <button className="rounded p-1 hover:bg-accent" title={t('sharedConnections')} onClick={() => navigate(`/settings/entity/user/${u.id}/connections`)}>
                                <Link2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={7} className="px-4 py-2">
                      <label className="flex items-center justify-end gap-2 text-xs text-muted-foreground cursor-pointer">
                        <span>{t('userTemporary')}</span>
                        <input type="checkbox" checked={showTemporary} onChange={(e) => setShowTemporary(e.target.checked)} className="rounded border-input" />
                      </label>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          {hasMore && <div ref={sentinelRef} className="h-4" />}
        </CardContent>
      </Card>
    </div>
  );
}
