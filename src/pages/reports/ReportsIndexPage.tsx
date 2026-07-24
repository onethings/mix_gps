import { Link } from 'react-router-dom';
import { ArrowRight, Map, Route, Square, BarChart3, Bell, Fence, LayoutDashboard, TrendingUp, PieChart, CalendarClock, ScrollText, Terminal } from 'lucide-react';
import PageHeader from '@/components/common/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { useSession } from '@/context/SessionContext';
import {
  supportsCombinedReport,
  supportsChartReport,
  supportsGeofencesReport,
} from '@/lib/serverVersion';
import type { LucideIcon } from 'lucide-react';

interface ReportItem {
  to: string;
  descKey: string;
  icon: LucideIcon;
  group: 'driving' | 'events' | 'system';
  admin?: boolean;
}

const GROUPS: Record<string, { labelKey: string; color: string; bgColor: string }> = {
  driving: { labelKey: 'reportGroupDriving', color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-100 dark:bg-blue-900/30' },
  events: { labelKey: 'reportGroupEvents', color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-100 dark:bg-amber-900/30' },
  system: { labelKey: 'reportGroupSystem', color: 'text-slate-600 dark:text-slate-400', bgColor: 'bg-slate-100 dark:bg-slate-800' },
};

const ICON_COLORS: Record<string, string> = {
  driving: 'text-blue-600 dark:text-blue-400',
  events: 'text-amber-600 dark:text-amber-400',
  system: 'text-slate-500 dark:text-slate-400',
};

const ITEMS: ReportItem[] = [
  { to: 'trips', descKey: 'reportTripsDesc', icon: Map, group: 'driving' },
  { to: 'route', descKey: 'reportRouteDesc', icon: Route, group: 'driving' },
  { to: 'stops', descKey: 'reportStopsDesc', icon: Square, group: 'driving' },
  { to: 'summary', descKey: 'reportSummaryDesc', icon: BarChart3, group: 'driving' },
  { to: 'events', descKey: 'reportEventsDesc', icon: Bell, group: 'events' },
  { to: 'geofences', descKey: 'reportGeofencesDesc', icon: Fence, group: 'events' },
  { to: 'combined', descKey: 'reportCombinedDesc', icon: LayoutDashboard, group: 'events' },
  { to: 'chart', descKey: 'reportChartDesc', icon: TrendingUp, group: 'events' },
  { to: 'statistics', descKey: 'reportStatisticsDesc', icon: PieChart, group: 'events' },
  { to: 'scheduled', descKey: 'reportScheduledDesc', icon: CalendarClock, group: 'system' },
  { to: 'audit', descKey: 'reportAuditDesc', icon: ScrollText, group: 'system', admin: true },
  { to: 'logs', descKey: 'reportLogsDesc', icon: Terminal, group: 'system' },
];

export default function ReportsIndexPage() {
  const { t } = useT();
  const { user, server } = useSession();
  const serverVersion = server?.version;
  const isAdmin = Boolean(user?.administrator);

  const visibleItems = ITEMS.filter((item) => {
    if (item.admin && !isAdmin) return false;
    if (item.to === 'combined' && !supportsCombinedReport(serverVersion)) return false;
    if (item.to === 'chart' && !supportsChartReport(serverVersion)) return false;
    if (item.to === 'geofences' && !supportsGeofencesReport(serverVersion)) return false;
    return true;
  });
  const groups = ['driving', 'events', 'system'] as const;

  return (
    <div className="space-y-4 md:space-y-8">
      <PageHeader title={t('reportsTitle')} description={t('reportsDesc')} />

      {groups.map((group) => {
        const groupItems = visibleItems.filter((item) => item.group === group);
        if (groupItems.length === 0) return null;

        return (
          <section key={group}>
            <div className="mb-3 flex items-center gap-2">
              <span className={cn('text-xs font-semibold uppercase tracking-wider', GROUPS[group].color)}>
                {t(GROUPS[group].labelKey)}
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <div className="grid gap-2 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {groupItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.to} to={`/reports/${item.to}`} className="group block">
                    <Card className="relative h-full overflow-hidden transition-all duration-200 hover:shadow-md hover:border-primary/30">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', GROUPS[item.group].bgColor)}>
                              <Icon className={cn('h-5 w-5', ICON_COLORS[item.group])} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <CardTitle className="text-sm font-semibold">{t(item.to)}</CardTitle>
                                {item.admin && (
                                  <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">{t('admin')}</span>
                                )}
                              </div>
                              <CardDescription className="mt-0.5 text-xs leading-snug">{t(item.descKey)}</CardDescription>
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pb-3 pt-0">
                        <div className="flex items-center justify-end opacity-0 transition-all duration-200 group-hover:opacity-100">
                          <ArrowRight className="h-4 w-4 text-primary" />
                        </div>
                      </CardContent>
                      {/* Corner accent bar */}
                      <div className={cn('absolute bottom-0 left-0 right-0 h-0.5 scale-x-0 transition-transform duration-200 group-hover:scale-x-100', GROUPS[item.group].bgColor)} />
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
