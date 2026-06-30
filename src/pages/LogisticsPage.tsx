import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, Truck, Clock, CheckCircle2, XCircle, ArrowRight, Bell, MapPin, Radio, PlayCircle } from 'lucide-react';
import PageHeader from '@/components/common/PageHeader';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSession } from '@/context/SessionContext';
import { useFlash } from '@/context/FlashContext';
import { useLiveData } from '@/context/LiveDataContext';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

const STORAGE_KEY = 'mixok-logistics-orders';

function loadOrders() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } }
function saveOrders(o) { localStorage.setItem(STORAGE_KEY, JSON.stringify(o)); }

const STATUS_COLUMNS = [
  { id: 'pending', title: 'Pending', icon: Clock, color: 'text-amber-600' },
  { id: 'assigned', title: 'Assigned', icon: Truck, color: 'text-blue-600' },
  { id: 'in-transit', title: 'In Transit', icon: ArrowRight, color: 'text-purple-600' },
  { id: 'delivered', title: 'Delivered', icon: CheckCircle2, color: 'text-green-600' },
  { id: 'cancelled', title: 'Cancelled', icon: XCircle, color: 'text-red-600' },
];

export default function LogisticsPage() {
  const { t } = useT();
  const { user } = useSession(); const { showError, showSuccess } = useFlash(); const { vehicles, alerts } = useLiveData();
  const [orders, setOrders] = useState([]); const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false); const [editing, setEditing] = useState(null);
  const [deleteId, setDeleteId] = useState(null); const [deleting, setDeleting] = useState(false);
  const fleetSnapshot = useMemo(() => ({ total: vehicles.length, online: vehicles.filter(v => v.status !== 'offline').length, offline: vehicles.length - vehicles.filter(v => v.status !== 'offline').length, alertCount: alerts.length }), [vehicles, alerts]);

  const reload = () => { setOrders(loadOrders()); setLoading(false); };

  useEffect(() => { if (!user) { setLoading(false); return; } reload(); }, [user]);

  const [formName, setFormName] = useState(''); const [formCustomer, setFormCustomer] = useState(''); const [formAddress, setFormAddress] = useState(''); const [formStatus, setFormStatus] = useState('pending');

  const submitOrder = () => {
    const n = formName.trim(); const c = formCustomer.trim(); const a = formAddress.trim();
    if (!n || !c || !a) { showError(t('allFieldsRequired')); return; }
    const list = loadOrders();
    if (editing) { const idx = list.findIndex(o => o.id === editing.id); if (idx >= 0) { list[idx] = { ...list[idx], name: n, customerName: c, deliveryAddress: a, status: formStatus }; } }
    else { list.push({ id: Date.now(), name: n, customerName: c, deliveryAddress: a, status: formStatus, createdAt: new Date().toISOString(), orderNumber: `ORD-${Date.now().toString(36).toUpperCase()}` }); }
    saveOrders(list); setOrders(list); setFormOpen(false); setEditing(null); showSuccess(editing ? 'Updated' : 'Created');
  };

  const handleDelete = async () => {
    if (!deleteId) return; setDeleting(true);
    const list = loadOrders().filter(o => o.id !== deleteId); saveOrders(list); setOrders(list);
    setDeleteId(null); showSuccess('Deleted'); setDeleting(false);
  };

  const openForm = (order = null) => {
    if (order) { setEditing(order); setFormName(order.name); setFormCustomer(order.customerName); setFormAddress(order.deliveryAddress); setFormStatus(order.status); }
    else { setEditing(null); setFormName(''); setFormCustomer(''); setFormAddress(''); setFormStatus('pending'); }
    setFormOpen(true);
  };

  const grouped = useMemo(() => {
    const out: Record<string, any[]> = {}; STATUS_COLUMNS.forEach(c => { out[c.id] = []; }); orders.forEach(o => { if (out[o.status]) out[o.status].push(o); else out.pending.push(o); }); return out;
  }, [orders]);

  const stats = useMemo(() => ({ total: orders.length, pending: orders.filter(o => o.status === 'pending').length, inTransit: orders.filter(o => o.status === 'in-transit').length, delivered: orders.filter(o => o.status === 'delivered').length }), [orders]);

  return (<div className="space-y-5">
    <PageHeader title={t('logisticsTitle')} description={t('logisticsDesc')}
      actions={<Button size="sm" onClick={() => openForm()}><Plus className="h-4 w-4" /> {t('newOrder')}</Button>} />

    <Card><CardHeader className="pb-3"><CardTitle className="text-base">{t('fleetSnapshot')}</CardTitle><CardDescription>{t('fromYourTraccar')}</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2"><div className="text-xs font-medium uppercase text-muted-foreground">{t('devices')}</div><div className="text-xl font-semibold">{fleetSnapshot.total}</div></div>
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2"><div className="text-xs font-medium uppercase text-muted-foreground">{t('online')}</div><div className="text-xl font-semibold text-success">{fleetSnapshot.online}</div></div>
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2"><div className="text-xs font-medium uppercase text-muted-foreground">{t('offline')}</div><div className="text-xl font-semibold">{fleetSnapshot.offline}</div></div>
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2"><div className="flex items-center gap-1 text-xs font-medium uppercase text-muted-foreground"><Bell className="h-3 w-3" /> {t('alerts')}</div><div className="text-xl font-semibold">{fleetSnapshot.alertCount}</div></div>
        </div>
      </CardContent></Card>

    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <Card><CardContent className="flex items-center gap-4 p-5"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><PackageIcon /></div><div><div className="text-xs font-medium uppercase text-muted-foreground">{t('orders')}</div><div className="text-2xl font-semibold">{stats.total}</div></div></CardContent></Card>
      <Card><CardContent className="flex items-center gap-4 p-5"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600"><Clock className="h-5 w-5" /></div><div><div className="text-xs font-medium uppercase text-muted-foreground">{t('pending')}</div><div className="text-2xl font-semibold">{stats.pending}</div></div></CardContent></Card>
      <Card><CardContent className="flex items-center gap-4 p-5"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600"><Truck className="h-5 w-5" /></div><div><div className="text-xs font-medium uppercase text-muted-foreground">{t('inTransit')}</div><div className="text-2xl font-semibold">{stats.inTransit}</div></div></CardContent></Card>
      <Card><CardContent className="flex items-center gap-4 p-5"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10 text-green-600"><CheckCircle2 className="h-5 w-5" /></div><div><div className="text-xs font-medium uppercase text-muted-foreground">{t('delivered')}</div><div className="text-2xl font-semibold">{stats.delivered}</div></div></CardContent></Card>
    </div>

    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {orders.map(o => (<Card key={o.id}><CardContent className="p-4">
        <div className="flex items-center justify-between"><span className="font-mono text-xs text-muted-foreground">{o.orderNumber}</span>
          <span className={cn('rounded px-2 py-0.5 text-xs font-medium', o.status === 'delivered' && 'bg-green-100 text-green-700', o.status === 'in-transit' && 'bg-purple-100 text-purple-700', o.status === 'pending' && 'bg-amber-100 text-amber-700', o.status === 'cancelled' && 'bg-red-100 text-red-700', o.status === 'assigned' && 'bg-blue-100 text-blue-700')}>{o.status}</span></div>
        <div className="mt-2 font-semibold">{o.customerName}</div>
        <div className="mt-1 text-xs text-muted-foreground">{o.deliveryAddress}</div>
        <div className="mt-3 flex gap-2 border-t border-border pt-3">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => openForm(o)}><Pencil className="h-3.5 w-3.5" /> {t('edit')}</Button>
          <Button variant="outline" size="sm" className="text-destructive" onClick={() => { setDeleteId(o.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </CardContent></Card>))}
    </div>

{orders.length === 0 && <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{t('nothingHere')}</CardContent></Card>}

    {formOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setFormOpen(false)}>
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">{editing ? t('edit') : t('newOrder')}</h3>
        <div className="mt-4 space-y-3">
          <label className="space-y-1 text-sm"><span className="font-medium">{t('orderName')}</span><input value={formName} onChange={e => setFormName(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none" /></label>
          <label className="space-y-1 text-sm"><span className="font-medium">{t('customer')}</span><input value={formCustomer} onChange={e => setFormCustomer(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none" /></label>
          <label className="space-y-1 text-sm"><span className="font-medium">{t('address')}</span><input value={formAddress} onChange={e => setFormAddress(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none" /></label>
          <label className="space-y-1 text-sm"><span className="font-medium">{t('status')}</span>
            <select value={formStatus} onChange={e => setFormStatus(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none">
              {STATUS_COLUMNS.map(c => <option key={c.id} value={c.id}>{t(c.id)}</option>)}</select></label>
        </div>
        <div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={() => setFormOpen(false)}>{t('cancel')}</Button><Button onClick={submitOrder}>{editing ? t('save') : t('create')}</Button></div>
      </div>
    </div>}

      <ConfirmDialog open={deleteId != null} onOpenChange={o => { if (!o) setDeleteId(null); }} title={t('deleteOrderTitle')} description="" onConfirm={handleDelete} />
  </div>);
}

function PackageIcon() { return <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>; }
