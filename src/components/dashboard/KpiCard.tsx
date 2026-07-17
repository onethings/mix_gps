import { cn } from '@/lib/utils';
import AnimatedCounter from '@/components/common/AnimatedCounter';
import type { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone?: 'default' | 'success' | 'warning' | 'destructive';
  className?: string;
}

const TONE_CLASSES = {
  default: 'bg-primary/10 text-primary',
  success: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  destructive: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

export default function KpiCard({ label, value, icon: Icon, tone = 'default', className }: KpiCardProps) {
  return (
    <div className={cn('rounded-xl border border-border bg-card p-4 shadow-sm', className)}>
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tabular-nums">
            {typeof value === 'number' ? <AnimatedCounter value={value} /> : value}
          </p>
        </div>
        <div className={cn('rounded-lg p-2.5', TONE_CLASSES[tone])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
