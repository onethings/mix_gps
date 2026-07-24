import { useMemo, useState, useRef, memo, useDeferredValue } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Search, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn, formatRelativeTime } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import type { Vehicle } from '@/types';

const FILTERS = ['all', 'moving', 'idle', 'stopped', 'alert'] as const;

const STATUS_PREFIX: Record<string, string> = {
  moving: 'moving', idle: 'idle', stopped: 'parking', offline: 'offline', alert: 'parking', maintenance: 'maintenance',
};

const STATUS_COLORS: Record<string, { dot: string; text: string }> = {
  moving: { dot: 'bg-blue-500', text: 'text-blue-600 dark:text-blue-400' },
  idle: { dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
  stopped: { dot: 'bg-slate-500', text: 'text-slate-600 dark:text-slate-400' },
  offline: { dot: 'bg-gray-400', text: 'text-gray-500 dark:text-gray-400' },
  alert: { dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400' },
  maintenance: { dot: 'bg-purple-500', text: 'text-purple-600 dark:text-purple-400' },
};

function getMarkerIconSrc(vehicle: Vehicle): string {
  const status = vehicle.status && STATUS_PREFIX[vehicle.status] ? vehicle.status : 'stopped';
  const prefix = STATUS_PREFIX[status] || 'parking';
  const type = (vehicle.iconType || '').toLowerCase().trim();
  const validTypes = ['car','truck','bus','van','taxi','motocycle','bicycle','scooter','plane','helicopter','ship','boat','train','tram','pickup','trailer','tractor','crane','camper','person','animal'];
  const vehicleType = type && validTypes.includes(type) ? type : 'car';
  return `/markers/${prefix}_${vehicleType}.svg`;
}

interface VehicleListProps {
  vehicles: Vehicle[];
  selectedId: number | null;
  onSelect: (vehicle: Vehicle) => void;
  showList: boolean;
  onToggleList: () => void;
}

const ITEM_HEIGHT = 60; // px per row — includes border

function VehicleRow({
  vehicle,
  selectedId,
  onSelect,
  locale,
}: {
  vehicle: Vehicle;
  selectedId: number | null;
  onSelect: (v: Vehicle) => void;
  locale: string;
}) {
  const { t } = useT();
  const colors = STATUS_COLORS[vehicle.status] || STATUS_COLORS.stopped;
  const timeText = formatRelativeTime(vehicle.lastUpdate, locale, t);
  const isAlert = vehicle.status === 'alert';
  const alarmType = isAlert ? vehicle._raw?.position?.attributes?.alarm : null;
  const alarmLabel = alarmType ? t('alarmType_' + alarmType) : null;

  return (
    <button
      onClick={() => onSelect(vehicle)}
      className={cn(
        'flex w-full items-start gap-2.5 border-b border-border px-3 py-2.5 text-left transition-colors hover:bg-accent/50',
        selectedId === vehicle.id && 'bg-accent shadow-[inset_3px_0_0_0] shadow-primary',
      )}
      style={{ height: ITEM_HEIGHT }}
    >
      {/* Vehicle icon */}
      <div className="shrink-0 mt-0.5 flex items-center justify-center w-[28px] h-[28px] rounded-md bg-muted/60">
        <img
          src={getMarkerIconSrc(vehicle)}
          alt=""
          width="22"
          height="22"
          className="object-contain"
          loading="lazy"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold truncate">{vehicle.name}</p>
          {isAlert && (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" />
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          {isAlert ? (
            <span className="text-xs text-red-500 font-medium truncate">{alarmLabel || t('alert')}</span>
          ) : (
            <>
              <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', colors.dot)} />
              <span className={cn('text-xs font-medium', colors.text)}>
                {t(vehicle.status)}
              </span>
            </>
          )}
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-xs text-muted-foreground">{timeText}</span>
        </div>
      </div>

      {/* Speed */}
      <div className="shrink-0 text-right mt-0.5">
        <p className={cn(
          'text-sm font-bold tabular-nums',
          vehicle.status === 'moving' ? 'text-foreground' : 'text-muted-foreground',
        )}>
          {vehicle.status === 'moving' ? `${vehicle.speed}` : '—'}
        </p>
        <p className="text-[10px] text-muted-foreground leading-tight">
          {vehicle.status === 'moving' ? t('unitKmh') : ' '}
        </p>
      </div>
    </button>
  );
}

const VehicleList = memo(function VehicleList({ vehicles, selectedId, onSelect, showList, onToggleList }: VehicleListProps) {
  const { t, locale } = useT();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const parentRef = useRef<HTMLDivElement>(null);
  // Defer search filtering to avoid blocking keystrokes on large fleets
  const deferredQ = useDeferredValue(q);

  const filtered = useMemo(() => {
    let list = vehicles;
    if (filter !== 'all') list = list.filter((v) => v.status === filter);
    if (deferredQ.trim()) {
      const query = deferredQ.toLowerCase();
      list = list.filter(
        (v) =>
          v.name.toLowerCase().includes(query) ||
          v.plate.toLowerCase().includes(query) ||
          v.driver.toLowerCase().includes(query),
      );
    }
    return list;
  }, [vehicles, filter, deferredQ]);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 10,
  });

  return (
    <div className="flex h-full flex-col">
      <div className="p-3 space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('searchVehicles')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8 pr-9 h-9"
          />
          <button
            type="button"
            onClick={onToggleList}
            className="absolute right-1 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            title={showList ? t('hideList') : t('showList')}
          >
            {showList ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {showList && (
          <div className="flex gap-1 overflow-x-auto">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors whitespace-nowrap',
                  filter === f
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-accent',
                )}
              >
                {t(f)}
              </button>
            ))}
          </div>
        )}
      </div>

      {showList && (
        <div ref={parentRef} className="flex-1 overflow-y-auto" style={{ contain: 'layout' }}>
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const v = filtered[virtualItem.index];
              if (!v) return null;
              return (
                <div
                  key={v.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <VehicleRow
                    vehicle={v}
                    selectedId={selectedId}
                    onSelect={onSelect}
                    locale={locale}
                  />
                </div>
              );
            })}
          </div>
          {filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">{t('noData')}</p>
          )}
        </div>
      )}
    </div>
  );
});

export default VehicleList;
