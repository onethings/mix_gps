// Minimal Traccar stand-in for the replay zoom repro: one device, one day of positions.
import { createServer } from 'node:http';

const PORT = Number(process.env.MOCK_PORT || 8099);
const DEVICE_ID = 2826;
const DATE = '2026-08-10';

const start = Date.parse(`${DATE}T00:00:00Z`);
const POINTS = Number(process.env.MOCK_ROUTE_POINTS || 700);
const route = [];
for (let i = 0; i < POINTS; i++) {
  const t = i / (POINTS - 1);
  const at = new Date(start + i * 60000).toISOString();
  route.push({
    latitude: Number((16.78 + t * 0.42).toFixed(6)),
    longitude: Number((96.05 + t * 0.38).toFixed(6)),
    speed: 24,
    course: 45,
    altitude: 12,
    accuracy: 5,
    fixTime: at,
    deviceTime: at,
    attributes: {},
  });
}

const device = {
  id: DEVICE_ID,
  name: 'Mock Hilux',
  uniqueId: 'MOCK2826',
  status: 'online',
  lastUpdate: new Date().toISOString(),
  model: 'Hilux',
  attributes: {},
};

function payload(path) {
  if (path === '/api/session') return { id: 1, name: 'Mock', email: 'mock@example.com', administrator: true, readonly: false };
  if (path === '/api/server') return { id: 1, version: '6.14.5' };
  if (path === '/api/devices') return [device];
  if (path === '/api/positions') return [];
  if (path === '/api/reports/route') return route;
  if (path === '/api/reports/stops') return [];
  if (path === '/api/reports/trips') return route.slice(0, 2).map((p, i) => ({
    deviceId: DEVICE_ID,
    deviceName: 'Mock Hilux',
    startTime: p.fixTime,
    endTime: route[route.length - 1].fixTime,
    startPositionId: i + 1,
    endPositionId: route.length,
    startLat: p.latitude,
    startLon: p.longitude,
    endLat: route[route.length - 1].latitude,
    endLon: route[route.length - 1].longitude,
    distance: 1000,
    averageSpeed: 24,
    maxSpeed: 30,
    duration: 600,
  }));
  if (path === '/api/reports/summary') return [];
  return [];
}

createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path.startsWith('/api/socket')) {
    res.writeHead(400).end();
    return;
  }
  const body = JSON.stringify(payload(path));
  // Simulate a slow Traccar report: a full-day route can take seconds to come back,
  // which is the window in which the user zooms in on the cached route.
  const delay = path === '/api/reports/route' ? Number(process.env.MOCK_ROUTE_DELAY_MS || 0) : 0;
  setTimeout(() => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
  }, delay);
}).listen(PORT, () => console.log(`mock traccar on ${PORT}`));
