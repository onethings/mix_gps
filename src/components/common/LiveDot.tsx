import { cn } from '@/lib/utils';

interface LiveDotProps {
  live: boolean;
  className?: string;
}

export default function LiveDot({ live, className }: LiveDotProps) {
  return (
    <span className={cn('relative flex h-2 w-2', className)}>
      <span
        className={cn(
          'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
          live ? 'bg-green-400' : 'bg-red-400',
        )}
      />
      <span
        className={cn(
          'relative inline-flex h-2 w-2 rounded-full',
          live ? 'bg-green-500' : 'bg-red-500',
        )}
      />
    </span>
  );
}
