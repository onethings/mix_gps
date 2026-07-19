import type { ReportTab } from '@/types';

export function buildReportPath(path: string, search: string | URLSearchParams): string {
  const source = typeof search === 'string' ? new URLSearchParams(search.replace(/^\?/, '')) : search;
  const deviceIds = source.getAll('deviceId');
  const groupIds = source.getAll('groupId');
  if (!deviceIds.length && !groupIds.length) return path;
  const params = new URLSearchParams();
  if (path === '/reports/chart' || path === '/reports/route' || path === '/replay') {
    const first = deviceIds[0];
    if (first != null) params.append('deviceId', first);
  } else {
    deviceIds.forEach((id) => params.append('deviceId', id));
    groupIds.forEach((id) => params.append('groupId', id));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export const REPORT_TABS: any[] = [
  { path: '/reports', labelKey: 'tabOverview', end: true, type: 'index' },
  { path: '/reports/combined', labelKey: 'tabCombined', type: 'route' },
  { path: '/reports/events', labelKey: 'tabEvents', type: 'route' },
  { path: '/reports/geofences', labelKey: 'tabGeofences', type: 'route' },
  { path: '/reports/trips', labelKey: 'tabTrips', type: 'route' },
  { path: '/reports/stops', labelKey: 'tabStops', type: 'route' },
  { path: '/reports/summary', labelKey: 'tabSummary', type: 'route' },
  { path: '/reports/chart', labelKey: 'tabChart', type: 'route' },
  { path: '/reports/route', labelKey: 'tabRoute', type: 'route' },
  { path: '/replay', labelKey: 'tabReplay', type: 'replay' },
  { path: '/reports/logs', labelKey: 'tabLogs', type: 'static' },
  { path: '/reports/scheduled', labelKey: 'tabScheduled', type: 'static' },
  { path: '/reports/statistics', labelKey: 'tabStatistics', type: 'static', admin: true },
  { path: '/reports/audit', labelKey: 'tabAudit', type: 'static', admin: true },
];
