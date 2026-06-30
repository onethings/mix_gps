import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useT } from '@/lib/i18n';
import { api } from '@/lib/api';
import { useFlash } from '@/context/FlashContext';
import type { TraccarDriver } from '@/types';

interface DriverFormProps {
  driver?: TraccarDriver | null;
  onSave: () => void;
  onCancel: () => void;
}

export default function DriverForm({ driver, onSave, onCancel }: DriverFormProps) {
  const { t } = useT();
  const { showSuccess, showError } = useFlash();
  const isEdit = !!driver;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', uniqueId: '', phone: '', email: '', license: '' });

  useEffect(() => {
    if (driver) {
      setForm({
        name: driver.name || '',
        uniqueId: driver.uniqueId || '',
        phone: driver.phone || '',
        email: driver.email || '',
        license: driver.license || '',
      });
    }
  }, [driver]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.uniqueId) { showError(t('driverFormRequired')); return; }
    setSaving(true);
    try {
      const payload = { name: form.name, uniqueId: form.uniqueId, phone: form.phone || undefined, email: form.email || undefined, license: form.license || undefined };
      if (isEdit) {
        await api.drivers.update(driver!.id, payload);
        showSuccess(t('driverUpdated'));
      } else {
        await api.drivers.create(payload);
        showSuccess(t('driverCreated'));
      }
      onSave();
    } catch (err) {
      showError((err as Error).message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">{t('driverFormName')}</label>
        <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">{t('driverFormUniqueId')}</label>
        <Input value={form.uniqueId} onChange={(e) => setForm((p) => ({ ...p, uniqueId: e.target.value }))} />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">{t('driverFormPhone')} ({t('optional')})</label>
        <Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">{t('driverFormEmail')} ({t('optional')})</label>
        <Input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">{t('driverFormLicense')} ({t('optional')})</label>
        <Input value={form.license} onChange={(e) => setForm((p) => ({ ...p, license: e.target.value }))} />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>{t('cancel')}</Button>
        <Button type="submit" disabled={saving}>{saving ? t('saving') : isEdit ? t('save') : t('add')}</Button>
      </div>
    </form>
  );
}
