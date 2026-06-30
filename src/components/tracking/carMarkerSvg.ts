import type { Vehicle } from '@/types';

const STATUS_COLORS: Record<string, { fill: string; glow: string }> = {
  moving: { fill: '#2563eb', glow: 'rgba(37, 99, 235, 0.45)' },
  idle: { fill: '#d97706', glow: 'rgba(217, 119, 6, 0.42)' },
  stopped: { fill: '#64748b', glow: 'rgba(100, 116, 139, 0.38)' },
  offline: { fill: '#475569', glow: 'rgba(71, 85, 105, 0.35)' },
  alert: { fill: '#dc2626', glow: 'rgba(220, 38, 38, 0.45)' },
  maintenance: { fill: '#94a3b8', glow: 'rgba(148, 163, 184, 0.35)' },
};

const VEHICLE_TYPE_MAP: [RegExp, string][] = [
  [/truck|lorry|卡车/, 'truck'], [/bus|巴士|公交/, 'bus'], [/van|厢式/, 'van'],
  [/taxi|出租/, 'taxi'], [/motorcycle|motorbike|摩托/, 'motocycle'], [/bicycle|bike|自行/, 'bicycle'],
  [/scooter/, 'scooter'], [/plane|airplane|飞机/, 'plane'], [/helicopter|直升/, 'helicopter'],
  [/ship|轮船/, 'ship'], [/boat|船/, 'boat'], [/train|火车/, 'train'], [/tram|电车/, 'tram'],
  [/pickup/, 'pickup'], [/trailer|拖车/, 'trailer'], [/tractor|拖拉机/, 'tractor'],
  [/crane|吊车/, 'crane'], [/camper|rv|房车/, 'camper'], [/person|pedestrian|行人/, 'person'],
  [/animal|cattle|牲畜/, 'animal'],
];

const STATUS_PREFIX: Record<string, string> = {
  moving: 'moving', idle: 'idle', stopped: 'parking', offline: 'offline', alert: 'parking', maintenance: 'maintenance',
};

function resolveStatus(vehicle: Vehicle): string {
  return vehicle?.status && STATUS_COLORS[vehicle.status] ? vehicle.status : 'stopped';
}

function resolveVehicleType(vehicle: Vehicle): string {
  const t = (vehicle?.iconType || '').toLowerCase().trim();
  const valid = ['car','truck','bus','van','taxi','motocycle','bicycle','scooter','plane','helicopter','ship','boat','train','tram','pickup','trailer','tractor','crane','camper','person','animal'];
  if (t && valid.includes(t)) return t;
  const model = (vehicle?.model || '').toLowerCase();
  for (const [p, type] of VEHICLE_TYPE_MAP) { if (p.test(model)) return type; }
  return 'car';
}

function ringShadow(selected: boolean): string {
  return selected ? '0 0 0 3px rgba(37, 99, 235, 0.95), 0 4px 16px rgba(0,0,0,0.35)' : '0 2px 10px rgba(0,0,0,0.3)';
}

function labelInitial(name: string): string {
  return name?.trim() ? name.trim().slice(0, 2).toUpperCase() : '?';
}

function getMarkerIconSrc(vehicle: Vehicle): string {
  const status = resolveStatus(vehicle);
  const prefix = STATUS_PREFIX[status] || 'parking';
  const type = resolveVehicleType(vehicle);
  return `/markers/${prefix}_${type}.svg`;
}

function carInnerHtml(vehicle: Vehicle): string {
  return `
    <div class="fleet-car-icon-wrap" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;pointer-events:none;">
      <div class="fleet-car-img-shell" style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;">
        <img src="${getMarkerIconSrc(vehicle)}" width="44" height="44" alt="" draggable="false" style="width:44px;height:44px;object-fit:contain;display:block;user-select:none;-webkit-user-drag:none;" />
      </div>
      <span style="font-size:9px;font-weight:800;color:#0f172a;text-shadow:0 1px 0 #fff,0 0 6px rgba(255,255,255,0.9);letter-spacing:0.02em;font-family:system-ui,sans-serif;line-height:1;">${labelInitial(vehicle?.name)}</span>
    </div>`;
}

export function createCarMarkerElement(vehicle: Vehicle, isSelected: boolean): HTMLDivElement {
  const status = resolveStatus(vehicle);
  const c = STATUS_COLORS[status] || STATUS_COLORS.stopped;
  const rot = Number.isFinite(Number(vehicle?.course)) ? Number(vehicle.course) : 0;
  const root = document.createElement('div');
  root.style.cssText = 'cursor:pointer;z-index:1;position:relative;width:58px;height:58px;';
  const ring = document.createElement('div');
  ring.className = 'fleet-marker-ring';
  ring.style.cssText = `position:absolute;width:58px;height:58px;left:50%;top:50%;margin:-29px 0 0 -29px;border-radius:50%;pointer-events:none;transition:opacity 0.2s;background:radial-gradient(circle, ${c.glow} 0%, transparent 70%);opacity:${status === 'moving' ? 0.88 : 0.5};`;
  const inner = document.createElement('div');
  inner.className = 'fleet-car-marker';
  inner.style.cssText = `width:52px;min-height:56px;display:flex;align-items:center;justify-content:center;position:relative;transform:rotate(${rot}deg);filter:drop-shadow(${ringShadow(isSelected)});`;
  inner.innerHTML = carInnerHtml(vehicle);
  root.appendChild(ring);
  root.appendChild(inner);
  root.addEventListener('click', (e) => e.stopPropagation());
  return root;
}

export function updateCarMarkerElement(el: HTMLDivElement, vehicle: Vehicle, isSelected: boolean): void {
  const inner = el.querySelector('.fleet-car-marker') as HTMLElement | null;
  const ring = el.querySelector('.fleet-marker-ring') as HTMLElement | null;
  const status = resolveStatus(vehicle);
  const c = STATUS_COLORS[status] || STATUS_COLORS.stopped;
  const rot = Number.isFinite(Number(vehicle?.course)) ? Number(vehicle.course) : 0;
  el.style.zIndex = isSelected ? '10' : '1';
  if (inner) {
    inner.style.transform = `rotate(${rot}deg)`;
    inner.style.filter = `drop-shadow(${ringShadow(isSelected)})`;
    inner.innerHTML = carInnerHtml(vehicle);
  }
  if (ring) {
    ring.style.background = `radial-gradient(circle, ${c.glow} 0%, transparent 70%)`;
    ring.style.opacity = status === 'moving' ? '0.88' : '0.5';
  }
}
