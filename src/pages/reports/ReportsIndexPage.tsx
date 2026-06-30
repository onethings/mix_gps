import { Link } from 'react-router-dom';
import PageHeader from '@/components/common/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/lib/i18n';

const ITEMS = [
  { to: 'trips', descKey: 'reportTripsDesc' },
  { to: 'route', descKey: 'reportRouteDesc' },
  { to: 'stops', descKey: 'reportStopsDesc' },
  { to: 'summary', descKey: 'reportSummaryDesc' },
  { to: 'events', descKey: 'reportEventsDesc' },
  { to: 'geofences', descKey: 'reportGeofencesDesc' },
  { to: 'combined', descKey: 'reportCombinedDesc' },
  { to: 'chart', descKey: 'reportChartDesc' },
  { to: 'statistics', descKey: 'reportStatisticsDesc' },
  { to: 'scheduled', descKey: 'reportScheduledDesc' },
  { to: 'audit', descKey: 'reportAuditDesc' },
  { to: 'logs', descKey: 'reportLogsDesc' },
];

export default function ReportsIndexPage() {
  const { t } = useT();
  return (
    <div className="space-y-6">
      <PageHeader title={t('reportsTitle')} description={t('reportsDesc')} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ITEMS.map((item) => (
          <Link key={item.to} to={`/reports/${item.to}`}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardHeader>
                <CardTitle className="text-base">{t(item.to)}</CardTitle>
                <CardDescription>{t(item.descKey)}</CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
