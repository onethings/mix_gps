import { useState, useRef, useEffect } from 'react';
import { useSession } from '@/context/SessionContext';
import { useTheme } from '@/context/ThemeContext';
import { LogOut, Moon, Sun, Settings, ChevronDown, LayoutDashboard, Map, BarChart3, Smartphone, Menu } from 'lucide-react';
import { initials, cn } from '@/lib/utils';
import LanguageSwitcher from '@/components/common/LanguageSwitcher';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useT } from '@/lib/i18n';

interface NavItem {
  path: string;
  key: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard', key: 'dashboard', icon: LayoutDashboard },
  { path: '/tracking', key: 'monitor', icon: Map },
  { path: '/reports', key: 'report', icon: BarChart3 },
  { path: '/devices', key: 'mgmt', icon: Smartphone },
];

interface TopbarProps {
  onMenuToggle?: () => void;
}

export default function Topbar({ onMenuToggle }: TopbarProps) {
  const { user, logout } = useSession();
  const { theme, toggle } = useTheme();
  const { t } = useT();
  const location = useLocation();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const basePath = '/' + (location.pathname.split('/')[1] || '');

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  const handleNavClick = (path: string) => {
    navigate(path);
  };

  return (
    <header className="flex h-14 items-center border-b border-border bg-card px-4">
      {/* Left — Hamburger + Logo */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onMenuToggle}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent transition-colors lg:hidden"
          aria-label="Toggle navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link to="/dashboard" className="flex items-center gap-2">
          <picture>
            <source srcSet="/custom/nav_icon_head.webp" type="image/webp" />
            <img
              src="/custom/nav_icon_head.png"
              alt="Logo"
              className="h-7 w-7 rounded object-contain"
              onError={(e: any) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </picture>
          <span className="hidden text-sm font-semibold sm:inline">Kevin GPS</span>
        </Link>
      </div>

      {/* Center — Main Navigation */}
      <nav className="flex flex-1 items-center justify-center gap-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive = item.path === '/reports'
            ? basePath === '/reports' || ['/trips','/fuel','/maintenance','/logistics','/alerts','/events','/orders','/geofences','/route-planning'].includes(basePath)
            : item.path === '/tracking'
            ? ['/tracking', '/replay'].includes(basePath)
            : item.path === '/devices'
            ? ['/devices','/drivers'].includes(basePath)
            : basePath === item.path;
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => handleNavClick(item.path)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <item.icon className="h-4 w-4" />
              <span className="hidden sm:inline">{t(item.key)}</span>
            </button>
          );
        })}
      </nav>

      {/* Right side */}
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        {/* Language switcher */}
        <LanguageSwitcher />
        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggle}
          className={cn('rounded-lg p-2 text-muted-foreground hover:bg-accent transition-colors')}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        {/* User dropdown */}
        <div ref={dropdownRef} className="relative">
          <button
            type="button"
            onClick={() => setDropdownOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm hover:bg-accent/50 transition-colors"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
              {initials(user?.name || user?.email)}
            </div>
            <span className="hidden text-sm font-medium sm:inline">
              {user?.name || user?.email}
            </span>
            <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', dropdownOpen && 'rotate-180')} />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-lg border border-border bg-popover p-1 shadow-lg">
              <button
                type="button"
                onClick={() => { setDropdownOpen(false); navigate('/settings'); }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-foreground hover:bg-accent transition-colors"
              >
                <Settings className="h-4 w-4" />
                {t('settings')}
              </button>
              <div className="mx-2 my-0.5 h-px bg-border" />
              <button
                type="button"
                onClick={() => { setDropdownOpen(false); logout(); }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                {t('signOut')}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
