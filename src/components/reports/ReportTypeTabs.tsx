import { useEffect, useRef } from 'react';
import { NavLink, useLocation, useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { buildReportPath, REPORT_TABS } from '@/lib/reportNav';
import { usePermissions } from '@/hooks/usePermissions';
import { useSession } from '@/context/SessionContext';
import { useT } from '@/lib/i18n';
import {
  supportsCombinedReport,
  supportsChartReport,
  supportsGeofencesReport,
} from '@/lib/serverVersion';

export default function ReportTypeTabs() {
  const { t } = useT();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { administrator, readonly, disableReports } = usePermissions();
  const { server } = useSession();
  const serverVersion = server?.version;
  const search = location.search || `?${searchParams.toString()}`;
  const scrollRef = useRef<HTMLDivElement>(null);

  if (disableReports) return null;

  const tabs = REPORT_TABS.filter((tab) => {
    if (tab.admin && !administrator) return false;
    if (tab.hideWhenReadonly && readonly) return false;
    // Hide report types not supported by older server versions
    if (tab.path === '/reports/combined' && !supportsCombinedReport(serverVersion)) return false;
    if (tab.path === '/reports/chart' && !supportsChartReport(serverVersion)) return false;
    if (tab.path === '/reports/geofences' && !supportsGeofencesReport(serverVersion)) return false;
    return true;
  });

  // Auto-scroll active tab into view when navigating from overview
  useEffect(() => {
    if (!scrollRef.current) return;
    const activeTab = scrollRef.current.querySelector('[aria-current="page"]') as HTMLElement | null;
    if (activeTab) {
      activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [location.pathname]);

  return (
    <div ref={scrollRef} className="-mx-1 mb-3 md:mb-6 overflow-x-auto border-b border-border pb-px scrollbar-thin">
      <div className="flex min-w-min gap-0.5 px-1">
        {tabs.map((tab) => {
          const to = buildReportPath(tab.path, search);
          const isIndex = tab.type === 'index';
          return (
            <NavLink
              key={tab.path}
              to={to}
              end={isIndex}
              className={({ isActive }) =>
                cn(
                  'whitespace-nowrap rounded-t-md border border-b-0 px-3 py-2 text-xs font-medium transition-colors sm:text-sm',
                  isActive
                    ? 'border-border bg-primary/10 text-primary'
                    : 'border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                )
              }
            >
              {t(tab.labelKey)}
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}
