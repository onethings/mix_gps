import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import StatusBadge from '@/components/common/StatusBadge';
import { cn, formatDate } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import type { Vehicle } from '@/types';

const FILTERS = ['all', 'moving', 'idle', 'stopped', 'alert'] as const;

interface VehicleListProps {
  vehicles: Vehicle[];
  selectedId: number | null;
  onSelect: (vehicle: Vehicle) => void;
}

export default function VehicleList({ vehicles, selectedId, onSelect }: VehicleListProps) {
  const { t } = useT();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    let list = vehicles;
    if (filter !== 'all') list = list.filter((v) => v.status === filter);
    if (q.trim()) {
      const query = q.toLowerCase();
      list = list.filter(
        (v) =>
          v.name.toLowerCase().includes(query) ||
          v.plate.toLowerCase().includes(query) ||
          v.driver.toLowerCase().includes(query),
      );
    }
    return list;
  }, [vehicles, filter, q]);

  return (
    <div className="flex h-full flex-col">
      <div className="p-3 space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('searchVehicles')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
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
      </div>

      <div className="flex-1 overflow-y-auto" style={{ marginLeft: '15px' }}>
        {filtered.map((v) => (
          <button
            key={v.id}
            onClick={() => onSelect(v)}
            className={cn(
              'flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left transition-colors hover:bg-accent/50',
              selectedId === v.id && 'bg-accent',
            )}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{v.name}</p>
              <p className="text-xs text-muted-foreground">{v.plate}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-semibold tabular-nums">{v.speed}</p>
              <StatusBadge status={v.status} />
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">{t('noData')}</p>
        )}
      </div>
    </div>
  );
}
