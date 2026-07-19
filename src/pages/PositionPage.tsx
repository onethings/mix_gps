import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { useLiveData } from '@/context/LiveDataContext';
import { useT } from '@/lib/i18n';
import { formatDate } from '@/lib/utils';

type PositionItem = Record<string, unknown>;

const STDLIB_KEYS = new Set([
  'id', 'deviceId', 'protocol', 'serverTime', 'deviceTime', 'fixTime',
  'valid', 'latitude', 'longitude', 'altitude', 'speed', 'course',
  'accuracy', 'address', 'network',
]);

function formatPosValue(key: string, value: unknown, t: (k: string) => string): string {
  if (value == null) return '—';
  if (key === 'latitude' || key === 'longitude') return (value as number).toFixed(6);
  if (key === 'speed') return `${((value as number) * 1.852).toFixed(1)} km/h`;
  if (key === 'course') return `${(value as number).toFixed(0)}°`;
  if (key === 'altitude') return `${(value as number).toFixed(1)} m`;
  if (key === 'accuracy') return `${(value as number).toFixed(1)} m`;
  if (key === 'valid') return value ? '✓' : '✗';
  if (['serverTime', 'deviceTime', 'fixTime'].includes(key)) return formatDate(value as string);
  if (key === 'deviceId') {
    return String(value);
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function readableKeyLabel(key: string, t: (k: string) => string): string {
  const translated = t(`position${key.charAt(0).toUpperCase() + key.slice(1)}`);
  if (translated !== `position${key.charAt(0).toUpperCase() + key.slice(1)}`) return translated;
  const translatedAttr = t(`attribute${key.charAt(0).toUpperCase() + key.slice(1)}`);
  if (translatedAttr !== `attribute${key.charAt(0).toUpperCase() + key.slice(1)}`) return translatedAttr;
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim();
}

export default function PositionPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { devicesById } = useLiveData();
  const [item, setItem] = useState<PositionItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await api.positions.list({ id }) as PositionItem[];
        if (!cancelled && data?.length > 0) setItem(data[0]);
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const deviceName = item ? devicesById[item.deviceId as number]?.name : null;
  const stdlibKeys = item ? Object.keys(item).filter((k) => STDLIB_KEYS.has(k)) : [];
  const attrKeys = item?.attributes ? Object.keys(item.attributes as Record<string, unknown>) : [];
  const otherKeys = item ? Object.keys(item).filter((k) => !STDLIB_KEYS.has(k) && k !== 'attributes') : [];

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
          {deviceName ? `${deviceName} — ${t('positionTitle')}` : t('positionTitle')}
        </h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{t('loading')}…</div>
        ) : !item ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{t('noData')}</div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-6">
            {/* Standard position fields */}
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('positionFields')}
              </h2>
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('stateName')}</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('stateValue')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...stdlibKeys, ...otherKeys].map((key) => (
                      <tr key={key} className="border-b last:border-0">
                        <td className="px-3 py-2 text-xs text-muted-foreground font-mono">{key}</td>
                        <td className="px-3 py-2 text-xs font-medium">
                          {formatPosValue(key, item[key], t)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Attributes */}
            {attrKeys.length > 0 && (
              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('positionAttributes')}
                </h2>
                <div className="overflow-hidden rounded-lg border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('stateName')}</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('stateName')}</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('stateValue')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attrKeys.map((key) => {
                        const attrs = item.attributes as Record<string, unknown>;
                        return (
                          <tr key={key} className="border-b last:border-0">
                            <td className="px-3 py-2 text-xs text-muted-foreground font-mono">{key}</td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              {readableKeyLabel(key, t)}
                            </td>
                            <td className="px-3 py-2 text-xs font-medium">
                              {formatPosValue(key, attrs[key], t)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
