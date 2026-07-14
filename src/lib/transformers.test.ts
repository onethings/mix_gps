import { describe, it, expect } from 'vitest';
import { toVehicle, toVehicles, toTrip, toAlert } from './transformers';

describe('toVehicle', () => {
  const device = {
    id: 1,
    name: 'Car-001',
    model: 'Tesla Model 3',
    status: 'online',
    lastUpdate: '2026-06-30T10:00:00Z',
    uniqueId: 'ABC123',
    phone: '0912345678',
    contact: 'John',
    category: 'car',
    groupId: 1,
    attributes: { vin: '5YJ3E1EA1LF123456', plate: 'ABC-1234' },
  };

  const position = {
    latitude: 25.033,
    longitude: 121.565,
    course: 90,
    speed: 30,
    fixTime: '2026-06-30T10:00:00Z',
    attributes: { ignition: true, fuel: 75, odometer: 50000, alarm: null },
  };

  it('returns a vehicle with merged device+position data', () => {
    const v = toVehicle(device, position);
    expect(v.id).toBe(1);
    expect(v.name).toBe('Car-001');
    expect(v.lat).toBe(25.033);
    expect(v.lng).toBe(121.565);
    expect(v.speed).toBeGreaterThan(0);
  });

  it('detects moving status when speed > 2 mph', () => {
    const v = toVehicle(device, position);
    expect(v.status).toBe('moving');
  });

  it('detects idle status when ignition on but speed <= 2', () => {
    const pos = { ...position, speed: 1 };
    const v = toVehicle(device, pos);
    expect(v.status).toBe('idle');
    expect(v.ignition).toBe(true);
  });

  it('detects offline status', () => {
    const d = { ...device, status: 'offline' };
    const v = toVehicle(d, position);
    expect(v.status).toBe('offline');
  });

  it('detects alert status when alarm is set', () => {
    const pos = { ...position, attributes: { ...position.attributes, alarm: 'sos' } };
    const v = toVehicle(device, pos);
    expect(v.status).toBe('alert');
  });

  it('detects maintenance status when disabled', () => {
    const d = { ...device, disabled: true };
    const v = toVehicle(d, position);
    expect(v.status).toBe('maintenance');
  });

  it('returns null lat/lng when no position', () => {
    const v = toVehicle(device, null);
    expect(v.lat).toBeNull();
    expect(v.lng).toBeNull();
    expect(v.status).toBe('stopped');
  });

  it('converts speed from knots to kmh', () => {
    const pos = { ...position, speed: 10 }; // 10 knots (18.52 kmh)
    const v = toVehicle(device, pos);
    expect(v.speed).toBeGreaterThan(18);
  });

  it('falls back to device attributes for model', () => {
    const d = { ...device, model: undefined, attributes: { model: 'Model Y' } };
    const v = toVehicle(d, null);
    expect(v.model).toBe('Model Y');
  });
});

describe('toVehicles', () => {
  const devices = [
    { id: 1, name: 'Car-001', status: 'online', lastUpdate: '2026-06-30T10:00:00Z', uniqueId: 'A1' },
    { id: 2, name: 'Car-002', status: 'offline', lastUpdate: '2026-06-30T09:00:00Z', uniqueId: 'A2' },
  ];

  it('returns empty array for non-array devices', () => {
    expect(toVehicles(null as any)).toEqual([]);
    expect(toVehicles(undefined)).toEqual([]);
    expect(toVehicles({} as any)).toEqual([]);
  });

  it('maps devices to vehicles with positions', () => {
    const positions = {
      1: { latitude: 25.0, longitude: 121.5, course: 0, speed: 0, fixTime: '2026-06-30T10:00:00Z', attributes: {} },
    };
    const result = toVehicles(devices, positions);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(1);
    expect(result[0].lat).toBe(25.0);
  });

  it('maintains stable references for unchanged vehicles', () => {
    const positions = {
      1: { latitude: 25.0, longitude: 121.5, course: 0, speed: 0, fixTime: '2026-06-30T10:00:00Z', attributes: {} },
      2: { latitude: 24.5, longitude: 122.0, course: 0, speed: 0, fixTime: '2026-06-30T09:00:00Z', attributes: {} },
    };
    const first = toVehicles(devices, positions);
    const second = toVehicles(devices, positions);
    // Same data → same references
    expect(first[0]).toBe(second[0]);
    expect(first[1]).toBe(second[1]);
  });

  it('only updates changed vehicles in cache', () => {
    const positions = {
      1: { latitude: 25.0, longitude: 121.5, course: 0, speed: 0, fixTime: '2026-06-30T10:00:00Z', attributes: {} },
      2: { latitude: 24.5, longitude: 122.0, course: 0, speed: 0, fixTime: '2026-06-30T09:00:00Z', attributes: {} },
    };
    const first = toVehicles(devices, positions);

    // Only vehicle 2 changes
    const updated = {
      1: { latitude: 25.0, longitude: 121.5, course: 0, speed: 0, fixTime: '2026-06-30T10:00:00Z', attributes: {} },
      2: { latitude: 25.1, longitude: 122.1, course: 45, speed: 15, fixTime: '2026-06-30T10:30:00Z', attributes: {} },
    };
    const second = toVehicles(devices, updated);

    // Vehicle 1 should be stable reference, vehicle 2 should be new
    expect(first[0]).toBe(second[0]);  // unchanged
    expect(first[1]).not.toBe(second[1]);  // changed
  });
});

describe('toTrip', () => {
  const trip = {
    deviceId: 1,
    startTime: '2026-06-30T08:00:00Z',
    endTime: '2026-06-30T09:00:00Z',
    distance: 50000,
    duration: 3600000,
    averageSpeed: 25,
    maxSpeed: 60,
    spentFuel: 10,
    startLat: 25.0,
    startLon: 121.5,
    endLat: 25.5,
    endLon: 122.0,
  };

  it('returns trip with formatted fields', () => {
    const t = toTrip(trip, 'Car-001');
    expect(t.vehicle).toBe('Car-001');
    expect(t.distance).toBe(50); // km
    expect(t.duration).toBe(60); // minutes
    expect(t.avgSpeed).toBeGreaterThan(0);
  });

  it('falls back to device ID for vehicle name', () => {
    const t = toTrip(trip, undefined);
    expect(t.vehicle).toBe('Device 1');
  });
});

describe('toAlert', () => {
  it('transforms an overspeed event into an alert', () => {
    const event = {
      id: 1,
      type: 'deviceOverspeed',
      deviceId: 1,
      eventTime: '2026-06-30T10:00:00Z',
      attributes: { speed: 80 },
    };
    const alert = toAlert(event, 'Car-001');
    expect(alert.type).toBe('overspeed');
    expect(alert.severity).toBe('high');
    expect(alert.vehicle).toBe('Car-001');
  });

  it('handles unknown event types gracefully', () => {
    const event = { id: 2, type: 'unknownEvent', deviceId: 1, eventTime: '2026-06-30T10:00:00Z', attributes: {} };
    const alert = toAlert(event, 'Car-002');
    expect(alert.type).toBe('engine'); // falls back to engine for unknown
    expect(alert.severity).toBe('low');
  });

  it('handles missing device name', () => {
    const event = { id: 3, type: 'deviceStopped', deviceId: 1, eventTime: '2026-06-30T10:00:00Z', attributes: {} };
    const alert = toAlert(event, undefined);
    expect(alert.vehicle).toBe('Device 1');
  });
});
