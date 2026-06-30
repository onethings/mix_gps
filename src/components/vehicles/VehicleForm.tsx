import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useT } from '@/lib/i18n';
import { api } from '@/lib/api';
import { useFlash } from '@/context/FlashContext';
import type { TraccarDevice } from '@/types';

interface VehicleFormProps {
  device?: TraccarDevice | null;
  onSave: () => void;
  onCancel: () => void;
}

export default function VehicleForm({ device, onSave, onCancel }: VehicleFormProps) {
  const { t } = useT();
  const { showSuccess, showError } = useFlash();
  const isEdit = !!device;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    uniqueId: '',
    model: '',
    phone: '',
    contact: '',
    category: '',
    groupId: '',
  });

  useEffect(() => {
    if (device) {
      setForm({
        name: device.name || '',
        uniqueId: device.uniqueId || '',
        model: device.model || '',
        phone: device.phone || '',
        contact: device.contact || '',
        category: device.category || '',
        groupId: device.groupId ? String(device.groupId) : '',
      });
    }
  }, [device]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.uniqueId) { showError(t('nameRequired')); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        uniqueId: form.uniqueId,
        model: form.model || undefined,
        phone: form.phone || undefined,
        contact: form.contact || undefined,
        category: form.category || undefined,
        groupId: form.groupId ? Number(form.groupId) : undefined,
      };
      if (isEdit) {
        await api.devices.update(device!.id, payload);
        showSuccess(t('deviceUpdated'));
      } else {
        await api.devices.create(payload);
        showSuccess(t('deviceCreated') || 'Device created');
      }
      onSave();
    } catch (err) {
      showError((err as Error).message || t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const update = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">{t('vehicleFormName')}</label>
        <Input value={form.name} onChange={(e) => update('name', e.target.value)} placeholder={t('vehicleFormNamePlaceholder')} />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">{t('vehicleFormUniqueId')}</label>
        <Input value={form.uniqueId} onChange={(e) => update('uniqueId', e.target.value)} placeholder={t('vehicleFormImeiPlaceholder')} />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">{t('vehicleFormModel')} ({t('optional')})</label>
        <Input value={form.model} onChange={(e) => update('model', e.target.value)} placeholder={t('vehicleFormModelPlaceholder')} />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">{t('phone')} ({t('optional')})</label>
        <Input value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="Phone" />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>{t('cancel')}</Button>
        <Button type="submit" disabled={saving}>{saving ? t('saving') : isEdit ? t('save') : t('addDevice')}</Button>
      </div>
    </form>
  );
}
