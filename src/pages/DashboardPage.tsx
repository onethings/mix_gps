import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Truck, Activity, Clock, BellRing, Wrench, ExternalLink } from 'lucide-react';
import PageHeader from '@/components/common/PageHeader';
import KpiCard from '@/components/dashboard/KpiCard';
import MiniMap from '@/components/dashboard/MiniMap';
import AlertsPanel from '@/components/dashboard/AlertsPanel';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import StatusBadge from '@/components/common/StatusBadge';
import { useLiveData } from '@/context/LiveDataContext';
import { useSession } from '@/context/SessionContext';
import { useT } from '@/lib/i18n';
import { computeDashboardKpis } from '@/lib/dashboardAnalytics';
import { formatDate } from '@/lib/utils';

export default function DashboardPage() {
  const { user } = useSession();
  const { vehicles, alerts, connected } = useLiveData();
  const { t } = useT();

  const kpis = useMemo(
    () => computeDashboardKpis(vehicles, alerts, []),
    [vehicles, alerts],
  );

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

      {/* Map + Alerts */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div>
              <CardTitle>{t('liveFleetMap')}</CardTitle>
              <CardDescription>{t('realtimePositions')}</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/tracking">
                {t('open')} <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <MiniMap vehicles={vehicles} />
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
                  <th className="px-6 py-3">{t('vehicle')}</th>
                  <th className="px-6 py-3">{t('status')}</th>
                  <th className="px-6 py-3">{t('speed')}</th>
                  <th className="px-6 py-3">{t('driver')}</th>
                  <th className="px-6 py-3">{t('lastUpdate')}</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.slice(0, 10).map((v) => (
                  <tr key={v.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-6 py-3 font-medium">{v.name}</td>
                    <td className="px-6 py-3"><StatusBadge status={v.status} /></td>
                    <td className="px-6 py-3 tabular-nums">{v.speed} {t('unitMph')}</td>
                    <td className="px-6 py-3 text-muted-foreground">{v.driver}</td>
                    <td className="px-6 py-3 text-xs text-muted-foreground">{formatDate(v.lastUpdate)}</td>
                  </tr>
                ))}
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
