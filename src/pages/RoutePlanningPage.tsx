import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, CalendarDays, Route, FileText, CheckCircle2, XCircle } from 'lucide-react';
import PageHeader from '@/components/common/PageHeader';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useSession } from '@/context/SessionContext';
import { useFlash } from '@/context/FlashContext';
import { useLiveData } from '@/context/LiveDataContext';
import { useT } from '@/lib/i18n';

const STORAGE_KEY = 'mixok-route-plans';
function loadPlans() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } }
function savePlans(p) { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); }

const STATUS_CONFIG = {
  draft: { label: 'Draft', icon: FileText, color: 'text-muted-foreground' },
  scheduled: { label: 'Scheduled', icon: CalendarDays, color: 'text-blue-600' },
  active: { label: 'Active', icon: Route, color: 'text-green-600' },
  completed: { label: 'Completed', icon: CheckCircle2, color: 'text-green-600' },
  cancelled: { label: 'Cancelled', icon: XCircle, color: 'text-red-600' },
};

export default function RoutePlanningPage() {
  const { t } = useT();
  const { user } = useSession(); const { showError, showSuccess } = useFlash(); const { vehicles } = useLiveData();
  const [routes, setRoutes] = useState([]); const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState(null); const [deleting, setDeleting] = useState(false);
  const vehicleMap = useMemo(() => { const m = {}; vehicles.forEach(v => { m[String(v.id)] = v.name; }); return m; }, [vehicles]);

  const reload = () => { setRoutes(loadPlans()); setLoading(false); };
  useEffect(() => { if (!user) { setLoading(false); return; } reload(); }, [user]);

  const [formOpen, setFormOpen] = useState(false); const [editing, setEditing] = useState(null);
  const [formName, setFormName] = useState(''); const [formDesc, setFormDesc] = useState(''); const [formStatus, setFormStatus] = useState('draft');

  const submitRoute = () => {
    const n = formName.trim(); if (!n) { showError(t('nameRequired')); return; }
    const list = loadPlans();
    if (editing) { const idx = list.findIndex(r => r.id === editing.id); if (idx >= 0) { list[idx] = { ...list[idx], name: n, description: formDesc, status: formStatus }; } }
    else { list.push({ id: Date.now(), name: n, description: formDesc, status: formStatus, createdAt: new Date().toISOString() }); }
    savePlans(list); setRoutes(list); setFormOpen(false); setEditing(null); showSuccess(editing ? 'Updated' : 'Created');
  };

  const handleDelete = async () => {
    if (!deleteId) return; setDeleting(true);
    const list = loadPlans().filter(r => r.id !== deleteId); savePlans(list); setRoutes(list);
    setDeleteId(null); showSuccess('Deleted'); setDeleting(false);
  };

  const openForm = (route = null) => {
    if (route) { setEditing(route); setFormName(route.name); setFormDesc(route.description || ''); setFormStatus(route.status); }
    else { setEditing(null); setFormName(''); setFormDesc(''); setFormStatus('draft'); }
    setFormOpen(true);
  };

  return (<div className="space-y-5">
    <PageHeader title={t('routePlanningTitle')} description={t('routePlanningDesc')}
      actions={<Button size="sm" onClick={() => openForm()}><Plus className="h-4 w-4" /> {t('newPlan')}</Button>} />

    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {routes.map(r => {
        const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.draft;
        const Icon = cfg.icon;
        return (<Card key={r.id}><CardContent className="p-4">
          <div className="flex items-center justify-between"><Icon className={cn('h-5 w-5', cfg.color)} />
            <span className={cn('rounded px-2 py-0.5 text-xs font-medium', r.status === 'active' && 'bg-green-100 text-green-700', r.status === 'scheduled' && 'bg-blue-100 text-blue-700', r.status === 'completed' && 'bg-green-100 text-green-700', r.status === 'cancelled' && 'bg-red-100 text-red-700', r.status === 'draft' && 'bg-muted text-muted-foreground')}>{cfg.label}</span></div>
          <div className="mt-2 font-semibold">{r.name}</div>
          {r.description && <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{r.description}</div>}
          <div className="mt-3 flex gap-2 border-t border-border pt-3">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => openForm(r)}><Pencil className="h-3.5 w-3.5" /> {t('edit')}</Button>
            <Button variant="outline" size="sm" className="text-destructive" onClick={() => setDeleteId(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        </CardContent></Card>);
      })}
    </div>

{routes.length === 0 && <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{t('nothingHere')}</CardContent></Card>}

    {formOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setFormOpen(false)}>
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">{editing ? t('edit') : t('newPlan')}</h3>
        <div className="mt-4 space-y-3">
          <label className="space-y-1 text-sm"><span className="font-medium">{t('name')}</span><input value={formName} onChange={e => setFormName(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none" /></label>
          <label className="space-y-1 text-sm"><span className="font-medium">{t('description')}</span><textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none" /></label>
          <label className="space-y-1 text-sm"><span className="font-medium">{t('status')}</span>
            <select value={formStatus} onChange={e => setFormStatus(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none">
              {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{t(k)}</option>)}</select></label>
        </div>
        <div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={() => setFormOpen(false)}>{t('cancel')}</Button><Button onClick={submitRoute}>{editing ? t('save') : t('create')}</Button></div>
      </div>
    </div>}

      <ConfirmDialog open={deleteId != null} onOpenChange={o => { if (!o) setDeleteId(null); }} title={t('deletePlanTitle')} description={t('deletePlanConfirm')} onConfirm={handleDelete} />
  </div>);
}
