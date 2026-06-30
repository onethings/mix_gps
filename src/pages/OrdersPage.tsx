import { useState } from 'react';
import { ClipboardList, Plus, Search } from 'lucide-react';
import PageHeader from '@/components/common/PageHeader';
import EmptyState from '@/components/common/EmptyState';
import LoadingScreen from '@/components/common/LoadingScreen';
import { useT } from '@/lib/i18n';
import { useFlash } from '@/context/FlashContext';
import { useListFetch } from '@/hooks/useListFetch';
import { formatDate } from '@/lib/utils';
import { api } from '@/lib/api';
import type { TraccarOrder } from '@/types';

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  processing: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  'in-transit': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  cancelled: 'bg-muted text-muted-foreground',
};

function translateStatus(status: string, t: (k: string) => string): string {
  const key = `orderStatus${status.charAt(0).toUpperCase() + status.slice(1).replace(/-([a-z])/g, (_: string, c: string) => c.toUpperCase())}`;
  const translated = t(key);
  return translated !== key ? translated : status;
}

export default function OrdersPage() {
  const { t } = useT();
  const { showError, showSuccess } = useFlash();
  const { data: orders, loading, error, reload } = useListFetch(() => api.orders.list() as Promise<TraccarOrder[]>, []);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newOrder, setNewOrder] = useState({ orderNo: '', customer: '', driverName: '', vehicleName: '' });

  const filtered = (orders || []).filter((o) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const attrs = (o.attributes || {}) as Record<string, unknown>;
    return (
      String(attrs.orderNo || '').toLowerCase().includes(q) ||
      String(attrs.customer || '').toLowerCase().includes(q)
    );
  });

  const handleCreate = async () => {
    if (!newOrder.orderNo || !newOrder.customer) return;
    try {
      await api.orders.create({
        attributes: { ...newOrder, status: 'new', createdAt: new Date().toISOString() },
      });
      showSuccess(t('orderCreated'));
      setShowCreate(false);
      setNewOrder({ orderNo: '', customer: '', driverName: '', vehicleName: '' });
      reload();
    } catch (e) {
      showError((e as Error).message || t('failed'));
    }
  };

  if (loading) return <LoadingScreen />;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={t('orders')}
        description={t('ordersDesc')}
        actions={
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            {t('add')}
          </button>
        }
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchOrders')}
          className="w-full rounded-lg border border-border bg-background py-2 pl-10 pr-4 text-sm outline-none ring-offset-background transition-colors placeholder:text-muted-foreground focus:ring-2 focus:ring-primary"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
          {t('failedLoadOrders')}: {(error as any)?.message || error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <EmptyState icon={ClipboardList} title={t('noOrders')} description={t("noOrdersDesc")} />
      )}

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('orderColOrderNo')}</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('orderColCustomer')}</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('orderColStatus')}</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('orderColDriver')}</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('orderColVehicle')}</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t('orderColCreated')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => {
              const attr = (o.attributes || {}) as Record<string, unknown>;
              const status = (String(attr.status || 'new')).toLowerCase();
              return (
                <tr key={o.id} className="border-b border-border transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{String(attr.orderNo || `#${o.id}`)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{String(attr.customer || '—')}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status] || STATUS_COLORS.pending}`}>
                      {translateStatus(status, t)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{String(attr.driverName || '—')}</td>
                  <td className="px-4 py-3 text-muted-foreground">{String(attr.vehicleName || '—')}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {attr.createdAt ? formatDate(String(attr.createdAt)) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-md rounded-xl bg-background p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold">{t('newOrder')}</h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('orderColOrderNo')}</label>
                <input type="text" value={newOrder.orderNo} onChange={(e) => setNewOrder((p) => ({ ...p, orderNo: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('orderColCustomer')}</label>
                <input type="text" value={newOrder.customer} onChange={(e) => setNewOrder((p) => ({ ...p, customer: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('orderColDriver')}</label>
                <input type="text" value={newOrder.driverName} onChange={(e) => setNewOrder((p) => ({ ...p, driverName: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('orderColVehicle')}</label>
                <input type="text" value={newOrder.vehicleName} onChange={(e) => setNewOrder((p) => ({ ...p, vehicleName: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreate(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">{t('cancel')}</button>
              <button type="button" onClick={handleCreate} disabled={!newOrder.orderNo || !newOrder.customer}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">{t('create')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
