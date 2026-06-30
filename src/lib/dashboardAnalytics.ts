import type { Vehicle, Alert, DashboardKpis } from '@/types';

function startOfDay(d: Date): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}

export function computeDashboardKpis(vehicles: Vehicle[] = [], alerts: Alert[] = [], maintenanceRows: { status?: string }[] = []): DashboardKpis {
  const total = vehicles.length;
  const active = vehicles.filter((v) => v.status === 'moving').length;
  const idle = vehicles.filter((v) => v.status === 'idle').length;
  const startOfToday = startOfDay(new Date());
  const alertsToday = alerts.filter(
    (a) => a.time && new Date(a.time) >= new Date(startOfToday),
  ).length;
  const maintenanceDue = maintenanceRows.filter(
    (m) => m.status !== 'completed',
  ).length;

  let avgUtil = 0;
  if (total > 0) {
    const moving = vehicles.filter(
      (v) => v.status === 'moving' || v.status === 'idle',
    ).length;
    avgUtil = Math.round((moving / total) * 100);
  }

  return {
    totalVehicles: total,
    activeVehicles: active,
    idleVehicles: idle,
    alertsToday,
    maintenanceDue,
    avgUtilization: avgUtil,
  };
}
