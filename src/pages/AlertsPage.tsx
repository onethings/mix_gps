import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Fuel, Gauge, MapPinOff, Wrench } from 'lucide-react';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import StatusBadge from '@/components/common/StatusBadge';
import EmptyState from '@/components/common/EmptyState';
import { formatDate, cn } from '@/lib/utils';
import { useLiveData } from '@/context/LiveDataContext';
import { useT } from '@/lib/i18n';
import type { VehicleStatus } from '@/types';

const ICONS = { overspeed: Gauge, fuel: Fuel, geofence: MapPinOff, idle: AlertTriangle, engine: Wrench };
const FILTERS = ['all', 'open', 'resolved'];
const DISMISSED_KEY = 'fleet-alerts-dismissed';

function loadDismissed() {
  try { const raw = localStorage.getItem(DISMISSED_KEY); if (!raw) return new Set(); return new Set(JSON.parse(raw)); }
  catch { return new Set(); }
}

export default function AlertsPage() {
  const { t } = useT();
  const { alerts: serverAlerts } = useLiveData();
  const [dismissed, setDismissed] = useState(loadDismissed);
  const [filter, setFilter] = useState('open');

  const list = useMemo(() => serverAlerts.map((a) => ({ ...a, status: dismissed.has(a.id) ? 'resolved' : a.status })), [serverAlerts, dismissed]);
  const filtered = useMemo(() => (filter === 'all' ? list : list.filter((a) => a.status === filter)), [list, filter]);

  const resolve = (id) => {
    setDismissed((prev) => {
      const next = new Set([...prev, id]);
      try { localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };

  return (
    <div className="space-y-5">
      <PageHeader title={t('alertsTitle')} description={t('alertsDesc')}
        actions={
          <div className="flex items-center gap-1 rounded-md bg-muted p-1">
            {FILTERS.map((f) => (
              <button key={f} type="button" onClick={() => setFilter(f)}
                className={cn('rounded px-3 py-1 text-xs font-medium capitalize transition-colors', filter === f ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                {f}
              </button>
            ))}
          </div>
        }
      />
      {filtered.length === 0 ? (
        <EmptyState title={filter === 'open' ? t('nothingToAttend') : t('noAlertsMatch')}
          description={t('eventsAppearWhen')} />
      ) : (
        <Card>
          <CardHeader className="pb-3"><CardTitle>{filtered.length} {t('alertsCount')}</CardTitle><CardDescription>{t('mostRecentFirst')}</CardDescription></CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {filtered.map((a) => {
                const Icon = ICONS[a.type] || AlertTriangle;
                return (
                  <li key={a.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                        a.severity === 'high' && 'bg-destructive/10 text-destructive',
                        a.severity === 'medium' && 'bg-warning/10 text-warning-foreground',
                        a.severity === 'low' && 'bg-muted text-muted-foreground')}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{a.message}</span>
                          <StatusBadge status={a.severity as VehicleStatus} />
                          <StatusBadge status={a.status as VehicleStatus} />
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">{a.vehicle} · {a.driver} · {formatDate(a.time)}</div>
                      </div>
                    </div>
                    {a.status === 'open' && (
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" asChild><Link to={`/event/${a.id}`}>Event</Link></Button>
                        {a.positionId != null && (
                          <><Button variant="outline" size="sm" asChild><Link to={`/position/${a.positionId}`}>Position</Link></Button>
                            <Button variant="outline" size="sm" asChild><Link to={`/network/${a.positionId}`}>Network</Link></Button></>
                        )}
                        <Button size="sm" onClick={() => resolve(a.id)}>{t('dismiss')}</Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
