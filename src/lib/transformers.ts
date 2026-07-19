const KNOTS_TO_KMH = 1.852;
const METERS_TO_KM = 0.001;

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function positionFromDevice(device) {
  if (!device) return null;
  const lat = Number(device.latitude);
  const lng = Number(device.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  return {
    latitude: lat,
    longitude: lng,
    course: device.course != null ? Number(device.course) : 0,
    speed: device.speed,
    fixTime: device.lastUpdate,
    attributes: typeof device.attributes === 'object' && device.attributes ? device.attributes : {},
  };
}

function positionForDevice(device, positionsByDevice) {
  if (device == null || (device.id !== 0 && device.id == null)) return null;
  const id = device.id;
  let pos = positionsByDevice[id];
  if (!pos) pos = positionsByDevice[String(id)];
  // Do NOT fall back to device.latitude/longitude — those are registration defaults, not real GPS
  return pos || null;
}

export function toVehicle(device, position) {
  const attr = position?.attributes || {};
  const deviceAttr = device.attributes || {};

  const isOffline = device.status === 'offline' || device.status === 'unknown';
  const speedKmh = num(position?.speed) * KNOTS_TO_KMH;
  const ignition = attr.ignition === true;
  const hasAlarm = Boolean(attr.alarm);

  let status = 'stopped';
  if (isOffline) status = 'offline';
  else if (hasAlarm) status = 'alert';
  else if (device.disabled) status = 'maintenance';
  else if (speedKmh > 3) status = 'moving';
  else if (ignition) status = 'idle';

  return {
    id: device.id,
    name: device.name,
    model: device.model || deviceAttr.model || 'Unknown',
    status,
    driver: attr.driverUniqueId || device.contact || 'Unassigned',
    driverId: attr.driverUniqueId || null,
    speed: Math.round(speedKmh),
    fuel: attr.fuel != null ? Math.round(attr.fuel) : null,
    ignition,
    odometer:
      attr.odometer != null
        ? Math.round(num(attr.odometer) * METERS_TO_KM)
        : attr.totalDistance != null
          ? Math.round(num(attr.totalDistance) * METERS_TO_KM)
          : 0,
    lastUpdate: device.lastUpdate || position?.fixTime || null,
    lat: position?.latitude ?? null,
    lng: position?.longitude ?? null,
    currentTripId: null,
    iconType: device.category || deviceAttr.iconType || '',
    phone: device.phone || '',
    contact: device.contact || '',
    vin: deviceAttr.vin || device.uniqueId,
    plate: deviceAttr.plate || device.uniqueId,
    group: device.groupId ? `Group ${device.groupId}` : 'Fleet',
    course: position?.course ?? 0,
    address: position?.address || null,
    battery: attr.batteryLevel ?? null,
    accuracy: position?.accuracy ?? null,
    _raw: { device, position },
  };
}

// Stable reference cache: only creates new objects when data actually changes
// Prevents cascading re-renders when only one vehicle's position updates
const _vehicleCache = new Map();

export function toVehicles(devices = [], positionsByDevice = {}) {
  if (!Array.isArray(devices)) return [];
  return devices.map((d) => {
    const pos = positionForDevice(d, positionsByDevice);
    const fresh = toVehicle(d, pos);
    const cached = _vehicleCache.get(fresh.id);
    if (cached && shallowEqualVehicle(cached, fresh)) {
      return cached;
    }
    _vehicleCache.set(fresh.id, fresh);
    return fresh;
  });
}

function shallowEqualVehicle(a, b) {
  return (
    a.id === b.id &&
    a.lat === b.lat &&
    a.lng === b.lng &&
    a.speed === b.speed &&
    a.status === b.status &&
    a.course === b.course &&
    a.fuel === b.fuel &&
    a.odometer === b.odometer &&
    a.ignition === b.ignition &&
    a.lastUpdate === b.lastUpdate &&
    a.address === b.address &&
    a.battery === b.battery
  );
}

export function toTrip(trip, deviceName) {
  return {
    id: `${trip.deviceId}-${trip.startTime}`,
    vehicle: deviceName || `Device ${trip.deviceId}`,
    deviceId: trip.deviceId,
    driver: trip.driverName || '—',
    startTime: trip.startTime,
    endTime: trip.endTime,
    distance: num(trip.distance) / 1000,
    duration: num(trip.duration) / 60000,
    avgSpeed: Math.round(num(trip.averageSpeed) * KNOTS_TO_KMH),
    maxSpeed: Math.round(num(trip.maxSpeed) * KNOTS_TO_KMH),
    fuelUsed: num(trip.spentFuel),
    startOdometer: trip.startOdometer,
    endOdometer: trip.endOdometer,
    startAddress: trip.startAddress,
    endAddress: trip.endAddress,
    violations: 0,
    from: trip.startAddress || `${trip.startLat?.toFixed(3)}, ${trip.startLon?.toFixed(3)}`,
    to: trip.endAddress || `${trip.endLat?.toFixed(3)}, ${trip.endLon?.toFixed(3)}`,
    startLat: trip.startLat,
    startLon: trip.startLon,
    endLat: trip.endLat,
    endLon: trip.endLon,
  };
}

const EVENT_TYPE_MAP = {
  deviceOverspeed: { kind: 'overspeed', severity: 'high' },
  deviceFuelDrop: { kind: 'fuel', severity: 'medium' },
  deviceFuelIncrease: { kind: 'fuel', severity: 'low' },
  geofenceEnter: { kind: 'geofence', severity: 'low' },
  geofenceExit: { kind: 'geofence', severity: 'low' },
  deviceStopped: { kind: 'idle', severity: 'low' },
  deviceMoving: { kind: 'idle', severity: 'low' },
  ignitionOn: { kind: 'engine', severity: 'low' },
  ignitionOff: { kind: 'engine', severity: 'low' },
  alarm: { kind: 'engine', severity: 'high' },
  deviceOnline: { kind: 'engine', severity: 'low' },
  deviceOffline: { kind: 'engine', severity: 'medium' },
  maintenance: { kind: 'engine', severity: 'medium' },
};

export function toAlert(event, deviceName) {
  const meta = EVENT_TYPE_MAP[event.type] || { kind: 'engine', severity: 'low' };
  const attr = event.attributes || {};
  const message =
    attr.message ||
    (event.type === 'deviceOverspeed'
      ? `Overspeed: ${Math.round(num(attr.speed) * KNOTS_TO_KMH)} km/h (limit ${Math.round(num(attr.speedLimit) * KNOTS_TO_KMH)})`
      : event.type === 'alarm'
        ? `Alarm: ${attr.alarm || 'unknown'}`
        : event.type.replace(/([A-Z])/g, ' $1').trim());

  return {
    id: event.id,
    type: meta.kind,
    severity: meta.severity,
    status: 'open',
    vehicle: deviceName || `Device ${event.deviceId}`,
    deviceId: event.deviceId,
    positionId: event.positionId ?? null,
    driver: '—',
    message,
    time: event.eventTime || event.serverTime,
    rawType: event.type,
  };
}

export function toDriver(driver) {
  const attr = driver.attributes || {};
  return {
    id: driver.id,
    name: driver.name,
    license: attr.license || driver.uniqueId,
    phone: attr.phone || '—',
    email: attr.email || '—',
    status: attr.status || 'off-duty',
    score: attr.score || 85,
    assignedVehicle: attr.vehicle || '—',
    trips: attr.trips || 0,
    violations: attr.violations || 0,
    hiredAt: attr.hiredAt || '—',
    uniqueId: driver.uniqueId,
    _raw: driver,
  };
}

const MAINT_STATUS = new Set(['open', 'scheduled', 'in-progress', 'completed']);

export function toMaintenance(item) {
  const attr = item.attributes || {};
  const rawStatus = attr.status || attr.workOrderStatus;
  const status = MAINT_STATUS.has(rawStatus) ? rawStatus : 'scheduled';
  return {
    id: `M-${item.id}`,
    rawId: item.id,
    vehicle: attr.vehicle || `Device ${item.id}`,
    type: item.type || 'Service',
    title: item.name || item.type || 'Maintenance',
    status,
    priority: attr.priority || 'medium',
    assignee: attr.assignee || 'Unassigned',
    dueDate: attr.dueDate || item.start || '—',
    cost: attr.cost != null ? Number(attr.cost) : null,
    period: item.period,
    start: item.start,
  };
}
