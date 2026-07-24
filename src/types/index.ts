// ── Traccar API types ──

export interface TraccarUser {
  id: number;
  name: string;
  email: string;
  phone?: string;
  readonly?: boolean;
  administrator?: boolean;
  userLimit?: number;
  deviceLimit?: number;
  token?: string;
  login?: string;
  map?: string;
  distanceUnit?: string;
  speedUnit?: string;
  latitude?: number;
  longitude?: number;
  zoom?: number;
  twelveHourFormat?: boolean;
  coordinateFormat?: string;
  disabled?: boolean;
  expiration?: string;
  expirationTime?: string;
  deviceReadonly?: boolean;
  limitCommands?: boolean;
  poiLayer?: string;
  totpEnabled?: boolean;
  disableReports?: boolean;
  disableDevices?: boolean;
  attributes?: Record<string, unknown>;
}

export interface TraccarServer {
  id: number;
  registration?: boolean;
  readonly?: boolean;
  map?: string;
  bingKey?: string;
  mapUrl?: string;
  distanceUnit?: string;
  speedUnit?: string;
  latitude?: number;
  longitude?: number;
  zoom?: number;
  twelveHourFormat?: boolean;
  coordinateFormat?: string;
  forceSettings?: boolean;
  deviceReadonly?: boolean;
  disableReports?: boolean;
  disableDevices?: boolean;
  attributes?: Record<string, unknown>;
  version?: string;
}

export interface TraccarDevice {
  id: number;
  name: string;
  uniqueId: string;
  status: 'online' | 'offline' | 'unknown';
  disabled?: boolean;
  lastUpdate?: string;
  phone?: string;
  model?: string;
  contact?: string;
  category?: string;
  groupId?: number;
  calendarId?: number;
  expirationTime?: string;
  positionId?: number;
  attributes?: Record<string, unknown>;
  latitude?: number;
  longitude?: number;
  course?: number;
  speed?: number;
}

export interface TraccarPosition {
  id: number;
  deviceId: number;
  protocol?: string;
  serverTime?: string;
  deviceTime?: string;
  fixTime?: string;
  valid?: boolean;
  latitude: number;
  longitude: number;
  course?: number;
  speed?: number;
  altitude?: number;
  accuracy?: number;
  address?: string;
  attributes?: Record<string, unknown>;
}

export interface TraccarEvent {
  id: number;
  type: string;
  serverTime?: string;
  deviceId?: number;
  positionId?: number;
  geofenceId?: number;
  maintenanceId?: number;
  attributes?: Record<string, unknown>;
}

export interface TraccarGeofence {
  id: number;
  name: string;
  description?: string;
  area: string; // WKT
  calendarId?: number;
  attributes?: Record<string, unknown>;
}

export interface TraccarDriver {
  id: number;
  name: string;
  uniqueId: string;
  phone?: string;
  email?: string;
  license?: string;
  attributes?: Record<string, unknown>;
}

export interface TraccarMaintenance {
  id: number;
  name: string;
  type: string;
  start: string;
  period: number;
  deviceId?: number;
  attributes?: Record<string, unknown>;
}

export interface TraccarGroup {
  id: number;
  name: string;
  groupId?: number;
  attributes?: Record<string, unknown>;
}

export interface TraccarNotification {
  id: number;
  type: string;
  description?: string;
  notificators?: string[];
  web?: boolean;
  mail?: boolean;
  sms?: boolean;
  commandId?: number;
  always?: boolean;
  calendarId?: number;
  attributes?: Record<string, unknown>;
}

export interface TraccarCalendar {
  id: number;
  name: string;
  data?: string;
  attributes?: Record<string, unknown>;
}

export interface TraccarCommand {
  id: number;
  deviceId?: number;
  description?: string;
  type: string;
  textChannel?: boolean;
  attributes?: Record<string, unknown>;
}

export interface TraccarOrder {
  id: number;
  name: string;
  customer?: string;
  status?: string;
  deviceId?: number;
  driverId?: number;
  attributes?: Record<string, unknown>;
}

export interface TraccarPermission {
  id: number;
  userId?: number;
  deviceId?: number;
  groupId?: number;
  geofenceId?: number;
  driverId?: number;
  maintenanceId?: number;
  calendarId?: number;
  notificationId?: number;
  commandId?: number;
  computedAttributeId?: number;
}

export interface TraccarReportTrip {
  deviceId: number;
  deviceName?: string;
  startTime: string;
  endTime: string;
  distance: number;
  averageSpeed: number;
  maxSpeed: number;
  spentFuel: number;
  startOdometer: number;
  endOdometer: number;
  startPositionId: number;
  endPositionId: number;
  driverName?: string;
  driverUniqueId?: number;
  startLat?: number;
  startLon?: number;
  endLat?: number;
  endLon?: number;
  startAddress?: string;
  endAddress?: string;
  duration: number;
}

export interface TraccarReportSummary {
  deviceId: number;
  deviceName?: string;
  distance: number;
  averageSpeed: number;
  maxSpeed: number;
  spentFuel: number;
  startOdometer: number;
  endOdometer: number;
  engineHours?: number;
}

export interface TraccarReportEvent {
  id: number;
  type: string;
  eventTime?: string;
  serverTime?: string;
  deviceId?: number;
  positionId?: number;
  geofenceId?: number;
  maintenanceId?: number;
  attributes?: Record<string, unknown>;
  address?: string;
  lat?: number;
  lon?: number;
}

export interface TraccarReportRoute {
  deviceId: number;
  deviceName?: string;
  fixTime?: string;
  latitude: number;
  longitude: number;
  speed?: number;
  course?: number;
  altitude?: number;
  address?: string;
}

export interface TraccarComputedAttribute {
  id: number;
  name: string;
  type: string;
  expression: string;
  attribute?: string;
  dataType?: string;
  description?: string;
}

// ── Application types ──

export interface Vehicle {
  id: number;
  name: string;
  model: string;
  status: VehicleStatus;
  driver: string;
  driverId: string | null;
  speed: number;
  fuel: number | null;
  ignition: boolean;
  odometer: number;
  lastUpdate: string | null;
  lat: number | null;
  lng: number | null;
  currentTripId: string | null;
  iconType: string;
  phone: string;
  contact: string;
  vin: string;
  plate: string;
  group: string;
  course: number;
  address: string | null;
  battery: number | null;
  accuracy: number | null;
  _raw: { device: TraccarDevice; position: TraccarPosition | null };
}

export type VehicleStatus = 'moving' | 'idle' | 'stopped' | 'offline' | 'alert' | 'maintenance';

export interface Alert {
  id: number;
  type: string;
  severity: string;
  status: string;
  vehicle?: string;
  deviceId: number;
  positionId: number | null;
  driver: string;
  message: string;
  time: string | undefined;
  rawType?: string;
}

export interface Trip {
  id: string;
  vehicle: string;
  deviceId: number;
  driver: string;
  startTime: string;
  endTime: string;
  distance: number;
  duration: number;
  avgSpeed: number;
  maxSpeed: number;
  fuelUsed: number;
  startOdometer?: number;
  endOdometer?: number;
  startAddress?: string;
  endAddress?: string;
}

export interface MaintenanceRow {
  id: number;
  name: string;
  type: string;
  start: string;
  period: number;
  status?: string;
  deviceName?: string;
}

export interface DashboardKpis {
  totalVehicles: number;
  activeVehicles: number;
  idleVehicles: number;
  alertsToday: number;
  maintenanceDue: number;
  avgUtilization: number;
}

export interface ShareLink {
  token: string;
  deviceId: number;
  expiration: string;
  created: string;
  viewCount?: number;
}

export type DrawMode = 'polygon' | 'circle' | 'freehand' | null;

export interface GeofenceFormData {
  name: string;
  description: string;
  area: string; // WKT
}

export interface ReportTab {
  path: string;
  labelKey: string;
  end?: boolean;
  type: 'index' | 'route' | 'replay' | 'static';
  admin?: boolean;
}

// ── WebSocket frame ──

export interface SocketFrame {
  devices?: TraccarDevice[];
  positions?: TraccarPosition[];
  events?: TraccarEvent[];
  token?: string;
}
