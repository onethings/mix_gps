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
    <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {live !== undefined && (
          <div className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1">
            <LiveDot live={live} />
            <span className="text-[10px] font-medium text-muted-foreground">{liveLabel || (live ? 'Live' : 'Offline')}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">{actions}{children}</div>
    </div>
  );
}
