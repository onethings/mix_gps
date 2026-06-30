import { cn } from '@/lib/utils';
import type { VehicleStatus } from '@/types';

const STATUS_MAP: Record<VehicleStatus, { label: string; dot: string; bg: string }> = {
  moving: { label: 'Moving', dot: 'bg-blue-500', bg: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' },
  idle: { label: 'Idle', dot: 'bg-amber-500', bg: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300' },
  stopped: { label: 'Stopped', dot: 'bg-slate-500', bg: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300' },
  offline: { label: 'Offline', dot: 'bg-gray-400', bg: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
  alert: { label: 'Alert', dot: 'bg-red-500', bg: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300' },
  maintenance: { label: 'Maintenance', dot: 'bg-purple-500', bg: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300' },
};

interface StatusBadgeProps {
  status: VehicleStatus;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const s = STATUS_MAP[status] || STATUS_MAP.stopped;

  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium', s.bg)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} />
      {s.label}
    </span>
  );
}
