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

/** Compute approximate area (km²) of a WKT polygon using the Shoelace formula on a sphere */
export function wktPolygonAreaKm2(wkt: string | null | undefined): number | null {
  if (!wkt) return null;
  const polyMatch = wkt.trim().match(/^POLYGON\s*\(\(([^)]+)\)\)\s*$/i);
  if (!polyMatch) return null;
  const coords = polyMatch[1]!.split(',').map((pt) => {
    const [a, b] = pt.trim().split(/\s+/).map(Number);
    // Traccar WKT: lat lng → convert to [lng, lat]
    if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180) return [b, a] as [number, number];
    if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 180 && Math.abs(b) <= 90) return [a, b] as [number, number];
    return [b, a] as [number, number];
  }).filter((c) => Number.isFinite(c[0]) && Number.isFinite(c[1]));
  if (coords.length < 3) return null;

  const R = 6371; // Earth radius in km
  let area = 0;
  const n = coords.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const lng1 = (coords[i]![0] * Math.PI) / 180;
    const lat1 = (coords[i]![1] * Math.PI) / 180;
    const lng2 = (coords[j]![0] * Math.PI) / 180;
    const lat2 = (coords[j]![1] * Math.PI) / 180;
    area += lng1 * lat2 - lng2 * lat1;
  }
  area = Math.abs(area) * (R * R) / 2;
  return Math.round(area * 100) / 100;
}

// Map custom app locale codes to BCP 47 tags for Intl APIs
const INTL_LOCALE_MAP: Record<string, string> = {
  tw: 'zh-TW',   // 'tw' = Twi (wrong), should be Traditional Chinese
  iw: 'he',      // 'iw' is a deprecated grandfathered tag for Hebrew
};

function toIntlLocale(code: string): string {
  return INTL_LOCALE_MAP[code] ?? code;
}

export function formatRelativeTime(
  value: string | number | Date | null | undefined,
  locale = 'en',
  t?: (key: string, fallback?: string) => string,
): string {
  if (!value) return '—';
  const now = Date.now();
  const d = new Date(value).getTime();
  const diffMs = now - d;

  // If more than 7 days old, show absolute date
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
  if (diffMs > SEVEN_DAYS) {
    return formatDate(value);
  }

  const seconds = Math.floor(diffMs / 1000);

  // Prefer app's translation system when t is available — guarantees
  // correct output for ALL 106+ locales regardless of browser Intl support.
  if (t) {
    if (seconds < 60) return seconds === 1 ? t('secondAgo') : t('secondsAgo').replace('{n}', String(seconds));
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes === 1 ? t('minuteAgo') : t('minutesAgo').replace('{n}', String(minutes));
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours === 1 ? t('hourAgo') : t('hoursAgo').replace('{n}', String(hours));
    const days = Math.floor(hours / 24);
    return days === 1 ? t('dayAgo') : t('daysAgo').replace('{n}', String(days));
  }

  // Fallback: use Intl.RelativeTimeFormat when no t function is provided
  try {
    const rtf = new Intl.RelativeTimeFormat(toIntlLocale(locale), { numeric: 'auto' });
    if (seconds < 60) return rtf.format(-seconds, 'second');
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return rtf.format(-minutes, 'minute');
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return rtf.format(-hours, 'hour');
    const days = Math.floor(hours / 24);
    return rtf.format(-days, 'day');
  } catch {
    // Ultimate fallback (no translation function available)
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
}
