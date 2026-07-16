import { useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Truck, Activity, Clock, BellRing, Wrench, ExternalLink, Map, AlertTriangle } from 'lucide-react';
import PageHeader from '@/components/common/PageHeader';
import KpiCard from '@/components/dashboard/KpiCard';
import AlertsPanel from '@/components/dashboard/AlertsPanel';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import StatusBadge from '@/components/common/StatusBadge';
import { useLiveData } from '@/context/LiveDataContext';
import { useSession } from '@/context/SessionContext';
import { useT } from '@/lib/i18n';
import { computeDashboardKpis } from '@/lib/dashboardAnalytics';
import { formatRelativeTime, cn } from '@/lib/utils';

export default function DashboardPage() {
  const { user } = useSession();
  const { vehicles, alerts, connected } = useLiveData();
  const { t, locale } = useT();

  const kpis = useMemo(
    () => computeDashboardKpis(vehicles, alerts, []),
    [vehicles, alerts],
  );

  const displayVehicles = useMemo(() => vehicles.slice(0, 10), [vehicles]);

  if (!user) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">{t('signInToSee')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('fleetOverview')}
        description={t('operationsAtGlance')}
        live={connected}
        liveLabel={connected ? t('liveSocket') : t('reconnecting')}
        actions={
          <Button size="sm" asChild>
            <Link to="/tracking">{t('openLiveMap')}</Link>
          </Button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard label={t('totalVehicles')} value={kpis.totalVehicles} icon={Truck} />
        <KpiCard label={t('activeVehicles')} value={kpis.activeVehicles} icon={Activity} tone="success" />
        <KpiCard label={t('idleVehicles')} value={kpis.idleVehicles} icon={Clock} tone="warning" />
        <KpiCard label={t('alertsToday')} value={kpis.alertsToday} icon={BellRing} tone="destructive" />
        <KpiCard label={t('avgUtilization')} value={`${kpis.avgUtilization}%`} icon={Wrench} />
      </div>

      {/* Global map is always visible as background — Alerts + Quick Actions */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div>
              <CardTitle>{t('liveTracking')}</CardTitle>
              <CardDescription>{t('realtimePositions')}</CardDescription>
            </div>
            <Button size="sm" asChild>
              <Link to="/tracking">
                {t('openLiveMap')} <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 p-4">
                <Map className="h-8 w-8 text-primary" />
                <div>
                  <div className="text-sm font-medium">{t('fleetMap')}</div>
                  <div className="text-xs text-muted-foreground">
                    {vehicles.length} {t('vehicles')} · {kpis.activeVehicles} {t('activeVehicles').toLowerCase()}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 p-4">
                <Activity className="h-8 w-8 text-blue-500" />
                <div>
                  <div className="text-sm font-medium">{t('statusOverview')}</div>
                  <div className="mt-1 flex gap-3 text-xs">
                    {(['moving', 'idle', 'stopped', 'offline', 'alert'] as const).map((s) => {
                      const count = vehicles.filter((v) => v.status === s).length;
                      if (count === 0) return null;
                      return (
                        <span key={s} className="flex items-center gap-1">
                          <span className={cn(
                            'h-1.5 w-1.5 rounded-full',
                            s === 'moving' && 'bg-blue-600',
                            s === 'idle' && 'bg-amber-600',
                            s === 'stopped' && 'bg-slate-500',
                            s === 'offline' && 'bg-slate-600',
                            s === 'alert' && 'bg-red-600',
                          )} />
                          {count}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle>{t('alerts')}</CardTitle>
            <CardDescription>{t('needsAttention')}</CardDescription>
          </CardHeader>
          <CardContent>
            <AlertsPanel alerts={alerts} />
          </CardContent>
        </Card>
      </div>

      {/* Vehicle Status Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle>{t('fleetStatus')}</CardTitle>
            <CardDescription>{t('allVehiclesLive')}</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/tracking">{t('viewAll')}</Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium uppercase text-muted-foreground">
                  <th className="px-4 py-3 sm:px-6">{t('vehicle')}</th>
                  <th className="px-4 py-3 sm:px-6">{t('status')}</th>
                  <th className="px-4 py-3 sm:px-6">{t('speed')}</th>
                  <th className="hidden px-4 py-3 sm:table-cell md:px-6">{t('driver')}</th>
                  <th className="hidden px-4 py-3 sm:table-cell md:px-6">{t('lastUpdate')}</th>
                </tr>
              </thead>
              <tbody>
                {displayVehicles.map((v) => {
                  const isAlert = v.status === 'alert';
                  const hasNoDriver = !v.driver || v.driver === 'Unassigned' || v.driver === '—';

                  return (
                    <tr
                      key={v.id}
                      className={cn(
                        'border-b border-border last:border-0 transition-colors',
                        isAlert && 'bg-red-50 dark:bg-red-950/20',
                        !isAlert && 'hover:bg-muted/30',
                      )}
                    >
                      <td className="px-4 py-3 font-medium sm:px-6">
                        <span className="inline-flex items-center gap-1.5">
                          {isAlert && (
                            <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
                          )}
                          {v.name}
                        </span>
                      </td>
                      <td className="px-4 py-3 sm:px-6"><StatusBadge status={v.status} /></td>
                      <td className="px-4 py-3 tabular-nums sm:px-6">{v.speed} {t('unitKmh')}</td>
                      <td className="hidden px-4 py-3 sm:table-cell md:px-6">
                        {hasNoDriver ? (
                          <span className="text-muted-foreground/40">—</span>
                        ) : (
                          <span className="text-muted-foreground">{v.driver}</span>
                        )}
                      </td>
                      <td className="hidden px-4 py-3 text-xs text-muted-foreground sm:table-cell md:px-6">
                        {formatRelativeTime(v.lastUpdate, locale, t)}
                      </td>
                    </tr>
                  );
                })}
                {vehicles.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-sm text-muted-foreground">
                      {user ? t('noDevicesAssigned') : t('signInToSee')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
