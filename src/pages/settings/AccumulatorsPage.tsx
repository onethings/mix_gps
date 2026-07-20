import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useLiveData } from '@/context/LiveDataContext';
import { useFlash } from '@/context/FlashContext';

interface AccumulatorItem {
  deviceId: number;
  hours: number;
  totalDistance: number;
}

export default function AccumulatorsPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const { deviceId } = useParams<{ deviceId: string }>();
  const { devicesById, positions } = useLiveData();
  const { showSuccess, showError } = useFlash();

  const device = deviceId ? devicesById[parseInt(deviceId, 10)] : undefined;
  const position = deviceId ? positions[deviceId] : undefined;

  const [item, setItem] = useState<AccumulatorItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [distanceUnit, setDistanceUnit] = useState('km');

  useEffect(() => {
    if (!deviceId) return;
    const devId = parseInt(deviceId, 10);
    let cancelled = false;

    (async () => {
      try {
        // Try to get existing accumulators first
        const existing = await api.devices.getAccumulators(devId);
        if (!cancelled && existing) {
          setItem(existing as AccumulatorItem);
          setLoading(false);
          return;
        }
      } catch { /* fall through to default values */ }

      // Fall back to position data
      if (position && !cancelled) {
        setItem({
          deviceId: devId,
          hours: (position.attributes?.hours as number) || 0,
          totalDistance: (position.attributes?.totalDistance as number) || 0,
        });
      }
      if (!cancelled) setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [deviceId, position]);

  const distanceKm = item ? item.totalDistance / 1000 : 0;
  const hoursDisplay = item ? item.hours / 3600000 : 0;

  const handleSave = async () => {
    if (!item) return;
    setSaving(true);
    try {
      await api.devices.putAccumulators(item.deviceId, {
        deviceId: item.deviceId,
        hours: item.hours,
        totalDistance: item.totalDistance,
      });
      showSuccess(t('settingsSaved'));
      navigate(-1);
    } catch (err: any) {
      showError(err.message || t('error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <button type="button" onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          {t('back')}
        </button>
        <h1 className="text-base font-semibold">
          {device?.name ? `${device.name} — ${t('sharedDeviceAccumulators')}` : t('sharedDeviceAccumulators')}
        </h1>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{t('loading')}…</div>
        ) : !item ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{t('noData')}</div>
        ) : (
          <div className="mx-auto max-w-md space-y-3 md:space-y-6">
            <div className="rounded-lg border p-4 space-y-4">
              {/* Hours */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  {t('positionHours')}
                </label>
                <input
                  type="number"
                  value={hoursDisplay.toFixed(1)}
                  step={0.1}
                  onChange={(e) => {
                    const h = parseFloat(e.target.value) || 0;
                    setItem({ ...item, hours: h * 3600000 });
                  }}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">{t('hoursHint')}</p>
              </div>

              {/* Total Distance */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  {t('deviceTotalDistance')} ({distanceUnit === 'mi' ? 'mi' : distanceUnit === 'nmi' ? 'nmi' : 'km'})
                </label>
                <input
                  type="number"
                  value={distanceKm.toFixed(1)}
                  step={0.1}
                  onChange={(e) => {
                    const km = parseFloat(e.target.value) || 0;
                    setItem({ ...item, totalDistance: km * 1000 });
                  }}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">{t('distanceHint')}</p>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => navigate(-1)}
                className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors">
                <X className="h-4 w-4" />
                {t('sharedCancel')}
              </button>
              <button type="button" onClick={handleSave} disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60">
                <Save className="h-4 w-4" />
                {saving ? t('saving') : t('sharedSave')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
