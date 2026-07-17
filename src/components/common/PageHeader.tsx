import LiveDot from './LiveDot';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: string;
  live?: boolean;
  liveLabel?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export default function PageHeader({ title, description, live, liveLabel, actions, children, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-2 md:gap-3', className)}>
      <div className="flex items-center gap-2 md:gap-3 min-w-0">
        <div className="min-w-0">
          <h1 className="text-base font-semibold tracking-tight md:text-xl truncate">{title}</h1>
          {description && <p className="hidden text-xs text-muted-foreground md:block md:text-sm">{description}</p>}
        </div>
        {live !== undefined && (
          <div className="hidden shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 py-1 md:flex">
            <LiveDot live={live} />
            <span className="text-[10px] font-medium text-muted-foreground">{liveLabel || (live ? 'Live' : 'Offline')}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 md:gap-2">{actions}{children}</div>
    </div>
  );
}
