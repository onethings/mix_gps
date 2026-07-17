import { Bell, CheckCircle, TimerOff } from 'lucide-react';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Alert } from '@/types';
import EmptyState from '@/components/common/EmptyState';
import { formatDate } from '@/lib/utils';
import { I18nContext } from '@/lib/i18n';
import {
  getAlertSettings,
  getTimerColor,
  ALL_CARD_FIELDS,
  type AlertSettings,
  type AlertCardFieldKey,
} from '@/lib/alertSettingsService';

interface AlertsPanelProps {
  alerts: Alert[];
}

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export default function AlertsPanel({ alerts }: AlertsPanelProps) {
  const ctx = useContext(I18nContext);
  const t = ctx?.t ?? ((key: string) => key);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [settings, setSettings] = useState<AlertSettings | null>(null);
  const settingsLoaded = useRef(false);

  // Load settings once
  useEffect(() => {
    if (!settingsLoaded.current) {
      settingsLoaded.current = true;
      getAlertSettings().then(setSettings);
    }
  }, []);

  // Tick every second for countdown
  const now = useNow(1000);

  const visible = alerts.filter((a) => !dismissed.has(a.id));

  const elapsed = useCallback(
    (eventTime: string | undefined): number | null => {
      if (!eventTime) return null;
      const eventMs = new Date(eventTime).getTime();
      if (isNaN(eventMs)) return null;
      const duration = settings?.timerDuration ?? 300;
      const remaining = duration - Math.floor((now - eventMs) / 1000);
      return Math.max(0, remaining);
    },
    [now, settings?.timerDuration],
  );

  if (visible.length === 0) {
    return <EmptyState icon={Bell} title={t('dashboardNoOpenAlerts')} description={t('dashboardAllClear')} />;
  }

  // Determine visible field count for dynamic font sizing
  const visibleFieldKeys = (settings?.cardFieldsOrder ?? ALL_CARD_FIELDS.map((f) => f.key)).filter(
    (k) => settings?.cardFieldsVisible[k] !== false,
  );
  const visibleFieldCount = visibleFieldKeys.length;

  return (
    <div className="space-y-2">
      {visible.slice(0, 10).map((alert) => {
        const remaining = elapsed(alert.time);
        const expired = remaining !== null && remaining <= 0;
        const color =
          settings && remaining !== null && !expired
            ? getTimerColor(remaining, settings)
            : undefined;

        return (
          <div
            key={alert.id}
            className="flex items-start gap-2 rounded-lg border bg-muted/30 p-2.5 text-xs transition-colors"
            style={color ? { borderColor: color } : undefined}
          >
            {/* Timer indicator dot */}
            <div
              className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: expired ? '#9ca3af' : color ?? '#ef4444' }}
            />

            {/* Card fields */}
            <div className="flex-1 min-w-0">
              {settings
                ? settings.cardFieldsOrder
                    .filter((k) => settings.cardFieldsVisible[k] !== false)
                    .map((key) => (
                      <AlertField
                        key={key}
                        fieldKey={key as AlertCardFieldKey}
                        alert={alert}
                        fieldCount={visibleFieldCount}
                      />
                    ))
                : // Fallback: show all fields when settings not yet loaded
                  defaultFields(alert, t)}
            </div>

            {/* Right side: timer + dismiss */}
            <div className="flex flex-col items-center gap-1 shrink-0">
              {/* Countdown timer */}
              {remaining !== null && (
                <span
                  className="tabular-nums text-xs font-mono font-medium"
                  style={{ color: expired ? '#9ca3af' : color ?? undefined }}
                >
                  {expired ? (
                    <TimerOff className="h-3.5 w-3.5" />
                  ) : (
                    formatTimer(remaining)
                  )}
                </span>
              )}
              {/* Dismiss button */}
              <button
                onClick={() => setDismissed((prev) => new Set(prev).add(alert.id))}
                className="shrink-0 text-muted-foreground hover:text-foreground"
                title={t('dismiss')}
              >
                <CheckCircle className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Renders a single card field with dynamic font sizing. */
function AlertField({
  fieldKey,
  alert,
  fieldCount,
}: {
  fieldKey: AlertCardFieldKey;
  alert: Alert;
  fieldCount: number;
}) {
  const ctx = useContext(I18nContext);
  const t = ctx?.t ?? ((key: string) => key);

  // Dynamic font size
  let textSize: string;
  if (fieldCount <= 1) textSize = 'text-lg'; // ~20pt
  else if (fieldCount === 2) textSize = 'text-base'; // ~16pt
  else textSize = 'text-xs'; // ~13pt

  switch (fieldKey) {
    case 'eventType':
      return (
        <p className={`font-medium truncate ${textSize}`}>
          {alert.rawType ?? alert.type}
        </p>
      );
    case 'licensePlate':
      return (
        <p className={`truncate ${textSize}`}>
          {alert.vehicle || `Device ${alert.deviceId}`}
        </p>
      );
    case 'geofence':
      return (
        <p className={`truncate text-muted-foreground ${textSize}`}>
          {alert.message || '—'}
        </p>
      );
    case 'time':
      return (
        <p className={`truncate text-muted-foreground ${textSize}`}>
          {formatDate(alert.time)}
        </p>
      );
    default:
      return null;
  }
}

/** Fallback fields when settings not yet loaded. */
function defaultFields(alert: Alert, t: (k: string) => string) {
  return (
    <>
      <p className="font-medium truncate">{alert.vehicle || `Device ${alert.deviceId}`}</p>
      <p className="text-muted-foreground">{alert.type}</p>
      <p className="text-muted-foreground">{formatDate(alert.time)}</p>
    </>
  );
}
