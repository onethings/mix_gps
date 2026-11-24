import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DeviceActivity } from '@/lib/activity';
import type { Vehicle } from '@/types';

// jsdom is not configured for this repo, so render statically and assert on the markup.
const state = vi.hoisted(() => ({
  activity: null as DeviceActivity | null,
  loading: false,
  error: null as string | null,
  fetchedAt: 1_715_760_000_000 as number | null,
  liveEvents: [] as any[],
}));

vi.mock('@/hooks/useDeviceActivity', () => ({
  useDeviceActivity: () => ({
    data: state.activity,
    loading: state.loading,
    error: state.error,
    fetchedAt: state.fetchedAt,
    refresh: () => {},
  }),
}));

vi.mock('@/context/LiveDataContext', () => ({
  useLiveData: () => ({ events: state.liveEvents }),
}));

vi.mock('@/lib/i18n', () => ({
  useT: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    locale: 'en',
    dir: 'ltr',
  }),
}));

import ActivityPanel from './ActivityPanel';

const vehicle = {
  id: 7,
  name: 'Truck A',
  status: 'moving',
} as unknown as Vehicle;

function activity(overrides: Partial<DeviceActivity> = {}): DeviceActivity {
  return {
    range: 'today',
    fromMs: 1_715_700_000_000,
    toMs: 1_715_760_000_000,
    stats: { distanceKm: 12.4, engineHours: 1.4, maxSpeedKmh: 87, averageSpeedKmh: 37 },
    events: [
      { id: 2, type: 'deviceOnline', eventTime: 1_715_700_060_000 },
      { id: 1, type: 'geofenceEnter', eventTime: 1_715_700_030_000, geofenceId: 3 },
    ],
    ...overrides,
  };
}

describe('ActivityPanel', () => {
  it('asks for a vehicle when none is selected and shows no data', () => {
    state.activity = null;
    const html = renderToStaticMarkup(<ActivityPanel vehicle={null} />);
    expect(html).toContain('Select a vehicle to see its recent activity.');
    expect(html).not.toContain('12.4 km');
  });

  it('renders the summary chips and the event list for the selected vehicle', () => {
    state.activity = activity();
    const html = renderToStaticMarkup(<ActivityPanel vehicle={vehicle} />);
    expect(html).toContain('Truck A');
    expect(html).toContain('12.4 km');
    expect(html).toContain('1 h 24 m');
    expect(html).toContain('87 km/h');
    expect(html).toContain('Device Online');
    expect(html).toContain('Geofence Enter');
    expect(html).not.toContain('No activity today.');
    expect(html).toContain('updated');
  });

  it('offers the 24h range when today has no activity', () => {
    state.activity = activity({ stats: null, events: [] });
    const html = renderToStaticMarkup(<ActivityPanel vehicle={vehicle} />);
    expect(html).toContain('No activity today.');
    expect(html).toContain('Check last 24 hours');
  });

  it('shows the error with a retry control', () => {
    state.activity = null;
    state.error = 'Forbidden — you do not have permission';
    const html = renderToStaticMarkup(<ActivityPanel vehicle={vehicle} />);
    expect(html).toContain('Forbidden — you do not have permission');
    expect(html).toContain('refresh');
    state.error = null;
  });

  it('prepends live WebSocket events for the selected device', () => {
    state.activity = activity();
    state.liveEvents = [{ id: 99, type: 'alarm', deviceId: 7, eventTime: 1_715_700_090_000, attributes: { alarm: 'sos' } }];
    const html = renderToStaticMarkup(<ActivityPanel vehicle={vehicle} />);
    expect(html).toContain('Alarm · sos');
    expect(html).toContain('font-semibold tabular-nums text-foreground">3</span>');
    state.liveEvents = [];
  });
});
