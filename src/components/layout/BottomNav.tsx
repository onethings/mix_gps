import { memo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Map, BarChart3, Settings,
} from 'lucide-react';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface NavItem {
  path: string;
  key: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard', key: 'dashboard', icon: LayoutDashboard },
  { path: '/tracking', key: 'monitor', icon: Map },
  { path: '/reports', key: 'report', icon: BarChart3 },
  { path: '/settings', key: 'settings', icon: Settings },
];

const BottomNav = memo(function BottomNav() {
  const { t } = useT();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const basePath = '/' + (pathname.split('/')[1] || '');

  const isActive = (path: string) => {
    if (path === '/reports') {
      return ['/reports', '/trips', '/fuel', '/maintenance', '/logistics',
        '/alerts', '/events', '/orders', '/geofences', '/route-planning'].includes(basePath);
    }
    if (path === '/tracking') {
      return ['/tracking', '/replay'].includes(basePath);
    }
    if (path === '/settings') {
      return basePath === '/settings';
    }
    return basePath === path;
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center border-t border-border bg-card/95 backdrop-blur-md md:hidden safe-area-bottom">
      {NAV_ITEMS.map((item) => {
        const active = isActive(item.path);
        const Icon = item.icon;
        return (
          <button
            key={item.path}
            type="button"
            onClick={() => navigate(item.path)}
            className={cn(
              'flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium transition-colors',
              active
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className={cn('h-5 w-5', active ? 'stroke-[2.5]' : 'stroke-2')} />
            <span>{t(item.key)}</span>
          </button>
        );
      })}
    </nav>
  );
});

export default BottomNav;
