import { memo } from 'react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import type { VehicleStatus } from '@/types';

const STATUS_STYLES: Record<VehicleStatus, { dot: string; bg: string }> = {
  moving: { dot: 'bg-blue-500', bg: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' },
  idle: { dot: 'bg-amber-500', bg: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300' },
  stopped: { dot: 'bg-slate-500', bg: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300' },
  offline: { dot: 'bg-gray-400', bg: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
  alert: { dot: 'bg-red-500', bg: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300' },
  maintenance: { dot: 'bg-purple-500', bg: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300' },
};

interface StatusBadgeProps {
  status: VehicleStatus;
}

const StatusBadge = memo(function StatusBadge({ status }: StatusBadgeProps) {
  const { t } = useT();
  const s = STATUS_STYLES[status] || STATUS_STYLES.stopped;

  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium', s.bg)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} />
      {t(status)}
    </span>
  );
});

export default StatusBadge;
