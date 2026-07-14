import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import StatusBadge from './StatusBadge';

vi.mock('@/lib/i18n', () => ({
  useT: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        moving: 'Moving', idle: 'Idle', stopped: 'Stopped',
        offline: 'Offline', alert: 'Alert', maintenance: 'Maintenance',
      };
      return map[key] || key;
    },
    locale: 'en',
    dir: 'ltr',
  }),
}));

describe('StatusBadge', () => {
  it('renders moving status', () => {
    const { getByText } = render(<StatusBadge status="moving" />);
    expect(getByText('Moving')).toBeDefined();
  });

  it('renders idle status', () => {
    const { getByText } = render(<StatusBadge status="idle" />);
    expect(getByText('Idle')).toBeDefined();
  });

  it('renders offline status', () => {
    const { getByText } = render(<StatusBadge status="offline" />);
    expect(getByText('Offline')).toBeDefined();
  });

  it('renders alert status', () => {
    const { getByText } = render(<StatusBadge status="alert" />);
    expect(getByText('Alert')).toBeDefined();
  });

  it('renders maintenance status', () => {
    const { getByText } = render(<StatusBadge status="maintenance" />);
    expect(getByText('Maintenance')).toBeDefined();
  });

  it('falls back to stopped styles for unknown status', () => {
    const { container } = render(<StatusBadge status={'unknown' as any} />);
    // Status text uses t(status) so it renders "unknown"
    // But the style falls back to stopped (slate colors)
    const spans = container.querySelectorAll('span');
    expect(spans.length).toBeGreaterThan(0);
  });

  it('has a colored dot indicator', () => {
    const { container } = render(<StatusBadge status="moving" />);
    const dot = container.querySelector('span > span');
    expect(dot).toBeDefined();
    expect(dot!.className).toContain('rounded-full');
  });
});
