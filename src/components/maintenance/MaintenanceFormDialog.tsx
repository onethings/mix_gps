import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useT } from '@/lib/i18n';

interface MaintenanceFormData {
  name: string;
  type: string;
  start?: string;
  period?: number;
}

interface MaintenanceFormDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: { item?: { name?: string; type?: string; start?: string; period?: number | null } } | null;
  onSubmit?: (data: MaintenanceFormData) => Promise<void>;
}

const emptyForm = (): MaintenanceFormData => ({ name: '', type: 'service', start: '', period: undefined });

export default function MaintenanceFormDialog({ open, onOpenChange, initial, onSubmit }: MaintenanceFormDialogProps) {
  const { t } = useT();
  const [form, setForm] = useState<MaintenanceFormData>(emptyForm);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (initial?.item) {
      const i = initial.item;
      setForm({ name: i.name || '', type: i.type || 'service', start: i.start || '', period: i.period != null ? Number(i.period) : undefined });
    } else {
      setForm(emptyForm());
    }
  }, [open, initial]);

  const submit = async () => {
    if (!onSubmit) return;
    setBusy(true);
    try {
      await onSubmit({
        name: form.name.trim(),
        type: form.type,
        start: form.start || undefined,
        period: form.period ?? undefined,
      });
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const isEdit = Boolean(initial?.item);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('maintFormEdit') : t('maintFormNew')}</DialogTitle>
          <DialogDescription>{t('maintFormDesc')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="space-y-1 text-sm">
            <span className="font-medium">{t('maintFormName')}</span>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">{t('maintFormType')}</span>
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none"
            >
              <option value="service">{t('maintFormService')}</option>
              <option value="inspection">{t('maintFormInspection')}</option>
              <option value="repair">{t('maintFormRepair')}</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">{t('maintFormStartDate')}</span>
            <Input type="date" value={form.start} onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">{t('maintFormPeriod')}</span>
            <Input type="number" value={form.period ?? ''} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value ? Number(e.target.value) : undefined }))} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>{t('cancel')}</Button>
          <Button onClick={submit} disabled={busy || !form.name.trim()}>
            {busy ? t('saving') : isEdit ? t('save') : t('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
