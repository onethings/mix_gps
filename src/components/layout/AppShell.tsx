import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { TAB_META } from '@/context/TabsContext';
import { MapProvider } from '@/context/MapContext';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import TabBar from './TabBar';
import GlobalMapLayer from './GlobalMapLayer';

const REPORT_PATHS = ['/reports','/fuel','/maintenance','/logistics','/alerts','/events','/orders','/geofences','/route-planning'];  // /reports/trips is covered by '/reports'
const MGMT_PATHS = ['/devices','/drivers','/settings'];
const SIDEBAR_PATHS = new Set([...REPORT_PATHS, ...MGMT_PATHS]);

/** Pages that use the full-screen map as background */
const MAP_PATHS = new Set(['/tracking']);

const APP_TITLE = 'Kevin GPS';

function ShellContent() {
  const { t } = useT();
  const { pathname } = useLocation();
  const basePath = '/' + (pathname.split('/')[1] || '');
  const showSidebar = SIDEBAR_PATHS.has(basePath);
  const isMapPage = MAP_PATHS.has(basePath);

  // Update browser tab title to match current page
  useEffect(() => {
    const meta = TAB_META[basePath];
    const pageKey = meta?.key;
    const pageTitle = pageKey ? t(pageKey) : null;
    document.title = pageTitle ? `${pageTitle} | ${APP_TITLE}` : APP_TITLE;
  }, [basePath, t]);

  return (
    <div className="relative h-full overflow-hidden">
      {/* Layer 1: Global map — always mounted, never reloads */}
      <GlobalMapLayer showControls={isMapPage} />

      {/* Layer 2: UI Overlay — explicit z-10 ensures it's always above map markers */}
      <div className={cn(
        'absolute inset-0 flex flex-col z-10',
        isMapPage ? 'pointer-events-none bg-transparent' : 'bg-background',
      )}>
        <div className={cn(isMapPage && 'pointer-events-auto')}>
          <Topbar />
          <TabBar />
        </div>

        <div className={cn(
          'relative flex flex-1 overflow-hidden',
          isMapPage && 'pointer-events-none',
        )}>
          {showSidebar && <Sidebar />}

          <main className={cn(
            'flex-1 overflow-y-auto',
            showSidebar ? 'p-4' : 'p-0',
            isMapPage ? 'bg-transparent' : 'bg-background',
          )}>
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

export default function AppShell() {
  return (
    <MapProvider>
      <ShellContent />
    </MapProvider>
  );
}
