import { Bell, CheckCircle } from 'lucide-react';
import { useContext, useState } from 'react';
import type { Alert } from '@/types';
import EmptyState from '@/components/common/EmptyState';
import { formatDate } from '@/lib/utils';
import { I18nContext } from '@/lib/i18n';

interface AlertsPanelProps {
  alerts: Alert[];
}

export default function AlertsPanel({ alerts }: AlertsPanelProps) {
  const ctx = useContext(I18nContext);
  const t = ctx?.t ?? ((key: string) => key);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  const visible = alerts.filter((a) => !dismissed.has(a.id));

  if (visible.length === 0) {
    return <EmptyState icon={Bell} title={t('dashboardNoOpenAlerts')} description={t('dashboardAllClear')} />;
  }

  return (
    <div className="space-y-2">
      {visible.slice(0, 10).map((alert) => (
        <div
          key={alert.id}
          className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-2.5 text-xs"
        >
          <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-red-500" />
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{alert.vehicle || `Device ${alert.deviceId}`}</p>
            <p className="text-muted-foreground">{alert.type}</p>
            <p className="text-muted-foreground">{formatDate(alert.time)}</p>
          </div>
          <button
            onClick={() => setDismissed((prev) => new Set(prev).add(alert.id))}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <CheckCircle className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
