import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Map, History, Bell, Settings, LogOut,
  Users, Fuel, Route, Wrench, Package, MapPin,
  BarChart3, Fence, ClipboardList, Activity, Smartphone,
  type LucideIcon,
} from 'lucide-react';
import { useSession } from '@/context/SessionContext';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface NavItemConfig {
  to: string;
  key: string;
  icon: LucideIcon;
}

const PRIMARY_NAV: NavItemConfig[] = [
  { to: '/dashboard', key: 'dashboard', icon: LayoutDashboard },
  { to: '/tracking', key: 'tracking', icon: Map },
  { to: '/devices', key: 'devices', icon: Smartphone },
  { to: '/trips', key: 'trips', icon: Route },
  { to: '/fuel', key: 'fuel', icon: Fuel },
  { to: '/drivers', key: 'drivers', icon: Users },
  { to: '/maintenance', key: 'maintenance', icon: Wrench },
  { to: '/logistics', key: 'logistics', icon: Package },
  { to: '/route-planning', key: 'routePlans', icon: MapPin },
  { to: '/replay', key: 'replay', icon: History },
  { to: '/alerts', key: 'alerts', icon: Bell },
];

const ANALYTICS_NAV: NavItemConfig[] = [
  { to: '/reports', key: 'reports', icon: BarChart3 },
  { to: '/geofences', key: 'geofences', icon: Fence },
  { to: '/orders', key: 'orders', icon: ClipboardList },
  { to: '/events', key: 'events', icon: Activity },
];

function NavItem({ item }: { item: NavItemConfig & { label: string } }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/dashboard' || item.to === '/reports'}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
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

export default function Sidebar() {
  const { logout } = useSession();
  const { t } = useT();

  return (
    <aside className="hidden w-60 flex-col border-r border-border bg-card lg:flex">
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
        <img
          src="/custom/nav_icon_head.png"
          alt="Logo"
          className="h-8 w-8 rounded object-contain"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        <span className="text-sm font-semibold">Kevin GPS</span>
      </div>

      <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
        {PRIMARY_NAV.map((item) => (
          <NavItem key={item.to} item={{ ...item, label: t(item.key) }} />
        ))}

        <div className="my-3 flex items-center gap-3 px-1">
          <span className="h-px flex-1 bg-border" />
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
            {t('analytics')}
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>

        {ANALYTICS_NAV.map((item) => (
          <NavItem key={item.to} item={{ ...item, label: t(item.key) }} />
        ))}

        <div className="my-3 flex items-center gap-3 px-1">
          <span className="h-px flex-1 bg-border" />
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
            {t('system')}
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <NavItem item={{ to: '/settings', key: 'settings', label: t('settings'), icon: Settings }} />
      </nav>

      <div className="border-t border-border p-3">
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <LogOut className="h-4 w-4" />
          {t('signOut')}
        </button>
      </div>
    </aside>
  );
}
