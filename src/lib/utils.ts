import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatDate(value: string | number | Date | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!value) return '—';
  const d = new Date(value);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...opts,
  });
}

export function formatDistance(km: number | null | undefined): string {
  if (km == null) return '—';
  return km >= 1000 ? `${(km / 1000).toFixed(1)}k km` : `${km.toFixed(1)} km`;
}

export function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null) return '—';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function formatCurrency(amount: number | null | undefined, currency = 'USD'): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

export function initials(name = ''): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join('');
}
