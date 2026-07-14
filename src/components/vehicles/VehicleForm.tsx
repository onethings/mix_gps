import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useT } from '@/lib/i18n';
import { api } from '@/lib/api';
import { useFlash } from '@/context/FlashContext';
import type { TraccarDevice, TraccarCalendar } from '@/types';

interface VehicleFormProps {
  device?: TraccarDevice | null;
  onSave: () => void;
  onCancel: () => void;
}

const ICON_TYPES = [
  'car', 'truck', 'bus', 'van', 'taxi', 'motocycle', 'bicycle', 'scooter',
  'pickup', 'trailer', 'tractor', 'crane', 'camper', 'plane', 'helicopter',
  'ship', 'boat', 'train', 'tram', 'person', 'animal',
];

export default function VehicleForm({ device, onSave, onCancel }: VehicleFormProps) {
  const { t } = useT();
  const { showSuccess, showError } = useFlash();
  const isEdit = !!device;
  const [saving, setSaving] = useState(false);
  const [calendars, setCalendars] = useState<TraccarCalendar[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    uniqueId: '',
    model: '',
    phone: '',
    contact: '',
    category: '',
    groupId: '',
    calendarId: '',
    plate: '',
    vin: '',
    expirationTime: '',
    disabled: false,
  });

  useEffect(() => {
    api.calendars.list().then(setCalendars).catch(() => {});
  }, []);

  useEffect(() => {
    if (device) {
      const attr = device.attributes || {};
      setForm({
        name: device.name || '',
        uniqueId: device.uniqueId || '',
        model: device.model || '',
        phone: device.phone || '',
        contact: device.contact || '',
        category: device.category || '',
        groupId: device.groupId != null ? String(device.groupId) : '',
        calendarId: device.calendarId != null ? String(device.calendarId) : '',
        plate: (attr.plate as string) || '',
        vin: (attr.vin as string) || '',
        expirationTime: device.expirationTime ? device.expirationTime.slice(0, 16) : '',
        disabled: !!device.disabled,
      });
    }
  }, [device]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.uniqueId) { showError(t('nameRequired')); return; }
    setSaving(true);
    try {
      const basePayload: Record<string, unknown> = {
        name: form.name,
        uniqueId: form.uniqueId,
        model: form.model || undefined,
        phone: form.phone || undefined,
        contact: form.contact || undefined,
        category: form.category || undefined,
        groupId: form.groupId ? Number(form.groupId) : null,
        calendarId: form.calendarId ? Number(form.calendarId) : null,
        disabled: form.disabled,
        expirationTime: form.expirationTime || null,
      };

      if (isEdit) {
        const current = await api.devices.get(device!.id);
        const payload = {
          ...current,
          ...basePayload,
          attributes: {
            ...(current.attributes || {}),
            plate: form.plate || undefined,
            vin: form.vin || undefined,
          },
        };
        await api.devices.update(device!.id, payload);
        // Upload image if selected
        if (imageFile) {
          await api.devices.uploadImage(device!.id, imageFile);
        }
        showSuccess(t('deviceUpdated'));
      } else {
        await api.devices.create({
          ...basePayload,
          attributes: {
            plate: form.plate || undefined,
            vin: form.vin || undefined,
          },
        });
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
  const updateBool = (key: string, value: boolean) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
      <div className="grid grid-cols-2 gap-4">
        {/* Left column */}
        <div className="space-y-3">
          <Field label={t('vehicleFormName')}>
            <Input value={form.name} onChange={(e) => update('name', e.target.value)} placeholder={t('vehicleFormNamePlaceholder')} />
          </Field>
          <Field label={t('deviceIdentifier')}>
            <Input value={form.uniqueId} onChange={(e) => update('uniqueId', e.target.value)} placeholder={t('vehicleFormImeiPlaceholder')} />
          </Field>
          <Field label={`${t('vehicleFormModel')} (${t('optional')})`}>
            <Input value={form.model} onChange={(e) => update('model', e.target.value)} placeholder={t('vehicleFormModelPlaceholder')} />
          </Field>
          <Field label={`${t('phone')} (${t('optional')})`}>
            <Input value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="Phone" />
          </Field>
          <Field label={`${t('contact')} (${t('optional')})`}>
            <Input value={form.contact} onChange={(e) => update('contact', e.target.value)} placeholder={t('contact')} />
          </Field>
          <Field label={`${t('category')} (${t('optional')})`}>
            <select value={form.category} onChange={(e) => update('category', e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary">
              <option value="">{t('iconTypeDefault')}</option>
              {ICON_TYPES.map((ic) => (
                <option key={ic} value={ic}>{t(`iconType_${ic}` as any)}</option>
              ))}
            </select>
          </Field>
          <Field label={`${t('vehicleFormGroupId')} (${t('optional')})`}>
            <Input value={form.groupId} onChange={(e) => update('groupId', e.target.value)} placeholder="0" />
          </Field>
        </div>

        {/* Right column */}
        <div className="space-y-3">
          <Field label={`${t('plate')} (${t('optional')})`}>
            <Input value={form.plate} onChange={(e) => update('plate', e.target.value)} placeholder={t('vehicleFormPlatePlaceholder')} />
          </Field>
          <Field label={`${t('vin')} (${t('optional')})`}>
            <Input value={form.vin} onChange={(e) => update('vin', e.target.value)} placeholder={t('vehicleFormVinPlaceholder')} />
          </Field>
          <Field label={`${t('calendars')} (${t('optional')})`}>
            <select value={form.calendarId} onChange={(e) => update('calendarId', e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary">
              <option value="">—</option>
              {calendars.map((cal) => (
                <option key={cal.id} value={String(cal.id)}>{cal.name}</option>
              ))}
            </select>
          </Field>
          <Field label={`${t('expirationTime')} (${t('optional')})`}>
            <Input type="datetime-local" value={form.expirationTime}
              onChange={(e) => update('expirationTime', e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 cursor-pointer pt-2">
            <input type="checkbox" checked={form.disabled}
              onChange={(e) => updateBool('disabled', e.target.checked)}
              className="rounded border-border accent-primary" />
            <span className="text-xs font-medium text-muted-foreground">{t('disabled')}</span>
          </label>

          {/* Device image */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t('deviceImage')}</label>
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted/50">
              <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
              {imageFile ? imageFile.name : t('clickToUpload')}
            </label>
            {imagePreview && (
              <img src={imagePreview} alt="preview" className="mt-1 h-16 w-16 rounded-md border border-border object-cover" />
            )}
          </div>
        </div>
      </div>

      {/* Motion info (read-only if present) */}
      {device?.attributes && (device.attributes.motionTime || device.attributes.motionLat || device.attributes.motionLon) && (
        <details className="rounded-md border border-border bg-muted/20 px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">{t('motionInfo')}</summary>
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            {device.attributes.motionTime != null && (
              <div><span className="text-muted-foreground">motionTime:</span> <span className="font-mono">{String(device.attributes.motionTime)}</span></div>
            )}
            {device.attributes.motionLat != null && (
              <div><span className="text-muted-foreground">motionLat:</span> <span className="font-mono">{Number(device.attributes.motionLat).toFixed(6)}</span></div>
            )}
            {device.attributes.motionLon != null && (
              <div><span className="text-muted-foreground">motionLon:</span> <span className="font-mono">{Number(device.attributes.motionLon).toFixed(6)}</span></div>
            )}
          </div>
        </details>
      )}

      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button type="button" variant="outline" onClick={onCancel}>{t('cancel')}</Button>
        <Button type="submit" disabled={saving}>{saving ? t('saving') : isEdit ? t('save') : t('addDevice')}</Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
