import { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { X, BarChart3, Settings, LayoutDashboard, Route, Fuel, Wrench, Package,
  Bell, Activity, ClipboardList, History, Fence, MapPin, Smartphone, Users, Shield,
  Calendar, Cpu, Terminal, Server, Megaphone, Cable, type LucideIcon } from 'lucide-react';
import { useSession } from '@/context/SessionContext';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface NavItemConfig {
  to: string;
  key: string;
  icon: LucideIcon;
}

const REPORT_NAV: NavItemConfig[] = [
  { to: '/dashboard', key: 'dashboard', icon: LayoutDashboard },
  { to: '/reports', key: 'reports', icon: BarChart3 },
  { to: '/reports/trips', key: 'trips', icon: Route },
  { to: '/fuel', key: 'fuel', icon: Fuel },
  { to: '/maintenance', key: 'maintenance', icon: Wrench },
  { to: '/logistics', key: 'logistics', icon: Package },
  { to: '/alerts', key: 'alerts', icon: Bell },
  { to: '/events', key: 'events', icon: Activity },
  { to: '/orders', key: 'orders', icon: ClipboardList },
  { to: '/replay', key: 'replay', icon: History },
  { to: '/geofences', key: 'geofences', icon: Fence },
  { to: '/route-planning', key: 'routePlans', icon: MapPin },
];

const MGMT_NAV: NavItemConfig[] = [
  { to: '/settings/preferences', key: 'preferences', icon: LayoutDashboard },
  { to: '/settings/notifications', key: 'notifications', icon: Bell },
  { to: '/settings/groups', key: 'groups', icon: Users },
  { to: '/devices', key: 'devices', icon: Smartphone },
  { to: '/geofences', key: 'geofences', icon: Fence },
  { to: '/drivers', key: 'drivers', icon: Users },
  { to: '/settings/calendars', key: 'calendars', icon: Calendar },
  { to: '/settings/attributes', key: 'computedAttributes', icon: Cpu },
  { to: '/settings/maintenance', key: 'maintenance', icon: Wrench },
  { to: '/settings/commands', key: 'savedCommands', icon: Terminal },
  { to: '/settings/server', key: 'server', icon: Server },
  { to: '/settings/users', key: 'users', icon: Users },
  { to: '/settings/permissions', key: 'permissions', icon: Shield },
  { to: '/settings/announcement', key: 'announcement', icon: Megaphone },
  { to: '/settings/devices', key: 'devicesDesc', icon: Smartphone },
  { to: '/settings/connections', key: 'connections', icon: Cable },
];

function MobileNavItem({ item, onClose }: { item: NavItemConfig & { label: string }; onClose: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/dashboard' || item.to === '/reports' || item.to === '/settings'}
      onClick={onClose}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
          isActive
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        )
      }
    >
      <item.icon className="h-4 w-4 shrink-0" />
      {item.label}
    </NavLink>
  );
}

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
}

export default function MobileNav({ open, onClose }: MobileNavProps) {
  const { t } = useT();
  const { user } = useSession();
  const { pathname } = useLocation();
  const basePath = '/' + (pathname.split('/')[1] || '');
  const sheetRef = useRef<HTMLDivElement>(null);

  const REPORT_PATHS = new Set(['/reports', '/trips', '/fuel', '/maintenance', '/logistics', '/alerts', '/events', '/orders', '/replay', '/geofences', '/route-planning', '/dashboard']);
  const isReport = REPORT_PATHS.has(basePath);
  const isAdmin = Boolean(user?.administrator);

  // Close on route change
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const navItems = isReport ? REPORT_NAV : MGMT_NAV;
  const sectionLabel = isReport ? 'reports' : 'management';

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 lg:hidden ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
      />
      {/* Drawer */}
      <div
        ref={sheetRef}
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-card border-r border-border shadow-xl transition-transform duration-300 lg:hidden ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <span className="text-sm font-semibold">{t(sectionLabel)}</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="overflow-y-auto p-3 space-y-0.5 h-[calc(100%-3.5rem)]">
          <div className="mb-2 flex items-center gap-3 px-1">
            <span className="h-px flex-1 bg-border" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
              {t(isReport ? 'reports' : 'management')}
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>

          {navItems.map((item) => (
            <MobileNavItem key={item.to} item={{ ...item, label: t(item.key) }} onClose={onClose} />
          ))}

          {/* Toggle between Reports / Management */}
          <div className="mt-4 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              {isReport ? <Settings className="h-4 w-4" /> : <BarChart3 className="h-4 w-4" />}
              {t(isReport ? 'management' : 'reports')}
              <span className="ml-auto text-[10px] text-muted-foreground/50">{t('switch')}</span>
            </button>
          </div>
        </nav>
      </div>
    </>
  );
}
