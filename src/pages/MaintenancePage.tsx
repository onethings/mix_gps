import { useState } from 'react';
import { Wrench, Plus, Pencil, Trash2 } from 'lucide-react';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import MaintenanceFormDialog from '@/components/maintenance/MaintenanceFormDialog';
import { useT } from '@/lib/i18n';
import { useFlash } from '@/context/FlashContext';
import { useLiveData } from '@/context/LiveDataContext';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { useListFetch } from '@/hooks/useListFetch';
import type { TraccarMaintenance } from '@/types';

export default function MaintenancePage() {
  const { t } = useT();
  const { showSuccess, showError } = useFlash();
  const { connected } = useLiveData();
  const { data: rows, loading, reload } = useListFetch<TraccarMaintenance[]>(() => api.maintenance.list() as Promise<TraccarMaintenance[]>, []);
  const [deleteTarget, setDeleteTarget] = useState<TraccarMaintenance | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<{ item: TraccarMaintenance } | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.maintenance.remove(deleteTarget.id);
      showSuccess(t('maintDeleted'));
      setDeleteTarget(null);
      reload();
    } catch (err) { showError((err as Error).message); }
  };

  const handleSubmit = async (data: { name: string; type: string; start?: string; period?: number }) => {
    try {
      if (editing) {
        await api.maintenance.update(editing.item.id, data);
        showSuccess(t('maintUpdated'));
      } else {
        await api.maintenance.create(data);
        showSuccess(t('maintCreated'));
      }
      reload();
    } catch (err) { showError((err as Error).message); }
  };

  const openForm = (item?: TraccarMaintenance) => {
    setEditing(item ? { item } : null);
    setFormOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('maintenanceTitle')}
        description={t('maintenanceDesc')}
        live={connected}
        actions={
          <Button size="sm" onClick={() => openForm()}><Plus className="h-4 w-4" />{t('maintFormNew')}</Button>
        }
      />

      {rows && rows.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card><CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">{t('total')}</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{rows.length}</p></CardContent></Card>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">{t('loading')}</div>
          ) : !rows || rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <Wrench className="mx-auto h-8 w-8 mb-2 opacity-50" />
              {t('noMaintenanceRecords')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase text-muted-foreground">
                    <th className="px-4 py-3">{t('name')}</th>
                    <th className="px-4 py-3">{t('type')}</th>
                    <th className="px-4 py-3">{t('startDate')}</th>
                    <th className="px-4 py-3">{t('periodDays')}</th>
                    <th className="px-4 py-3 w-20">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m) => (
                    <tr key={m.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{m.name}</td>
                      <td className="px-4 py-3">{m.type}</td>
                      <td className="px-4 py-3 text-xs">{formatDate(m.start)}</td>
                      <td className="px-4 py-3 tabular-nums">{m.period}d</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => openForm(m)} className="rounded p-1 hover:bg-accent"><Pencil className="h-3.5 w-3.5" /></button>
                          <button onClick={() => setDeleteTarget(m)} className="rounded p-1 hover:bg-accent text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <MaintenanceFormDialog open={formOpen} onOpenChange={(v) => { setFormOpen(v); if (!v) setEditing(null); }} initial={editing} onSubmit={handleSubmit} />

      <ConfirmDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)} title={t('deleteMaintTitle')} description={`${t('delete')} ${deleteTarget?.name || ''}?`} confirmLabel={t('delete')} onConfirm={handleDelete} destructive />
    </div>
  );
}
