import { useContext, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { I18nContext } from '@/lib/i18n';
import { TAB_META } from '@/context/TabsContext';
import { MapProvider } from '@/context/MapContext';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import TabBar from './TabBar';
import GlobalMapLayer from './GlobalMapLayer';
import MobileNav from './MobileNav';
import BottomNav from './BottomNav';

const REPORT_PATHS = ['/reports','/fuel','/logistics','/alerts','/events','/orders','/route-planning'];  // /reports/trips is covered by '/reports'
const MGMT_PATHS = ['/devices','/drivers','/settings','/geofences','/maintenance'];
const SIDEBAR_PATHS = new Set([...REPORT_PATHS, ...MGMT_PATHS]);

/** Pages that use the full-screen map as background */
const MAP_PATHS = new Set(['/tracking']);
/** Pages that hide topbar on mobile (full-screen content like map/replay) */
const HIDE_TOPBAR_PATHS = new Set(['/tracking', '/replay', '/reports', '/dashboard', '/settings', '/geofences', '/devices']);

const APP_TITLE = 'Kevin GPS';

function ShellContent() {
  const i18nCtx = useContext(I18nContext);
  const t = i18nCtx?.t ?? ((key: string) => key);
  const { pathname } = useLocation();
  const basePath = '/' + (pathname.split('/')[1] || '');
  const showSidebar = SIDEBAR_PATHS.has(basePath);
  const isMapPage = MAP_PATHS.has(basePath);
  const hideMobileTopbar = HIDE_TOPBAR_PATHS.has(basePath);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Update browser tab title to match current page
  useEffect(() => {
    const meta = TAB_META[basePath];
    const pageKey = meta?.key;
    const pageTitle = pageKey ? t(pageKey) : null;
    document.title = pageTitle ? `${pageTitle} | ${APP_TITLE}` : APP_TITLE;
  }, [basePath, t]);

  return (
    <div className="relative h-full overflow-hidden">
      {/* Mobile navigation drawer */}
      <MobileNav open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

      {/* Layer 1: Global map — always mounted, never reloads */}
      <GlobalMapLayer showControls={isMapPage} />

      {/* Mobile bottom navigation */}
      <BottomNav />

      {/* Layer 2: UI Overlay — explicit z-10 ensures it's always above map markers */}
      <div className={cn(
        'absolute inset-0 flex flex-col z-10',
        isMapPage ? 'pointer-events-none bg-transparent' : 'bg-background',
      )}>
        {/* On tracking/replay pages, limit pointer-events so map controls remain clickable.
            On mobile, hide the topbar + tabbar entirely for a full-screen map experience. */}
        <div className={cn(isMapPage ? 'pointer-events-none' : '', hideMobileTopbar ? 'max-md:hidden' : '')}>
          <div className={cn(isMapPage ? 'pointer-events-auto pr-12' : '')}>
            <Topbar onMenuToggle={() => setMobileNavOpen((v) => !v)} />
          </div>
          <div className={cn(isMapPage ? 'pointer-events-auto pr-12' : '')}>
            <TabBar />
          </div>
        </div>

        <div className={cn(
          'relative flex flex-1 overflow-hidden',
          isMapPage && 'pointer-events-none',
        )}>
          {showSidebar && <Sidebar />}

          <main className={cn(
            'flex-1 overflow-y-auto',
            showSidebar ? 'p-2 sm:p-4' : 'p-0',
            isMapPage ? 'bg-transparent' : 'bg-background',
            'pb-safe-lg md:pb-0', // bottom nav spacing on mobile
          )}>
            <div className={cn(
              isMapPage || basePath === '/replay' ? 'h-full' :
              'mx-auto w-full',
            )}>
              <Outlet />
            </div>
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
