import { useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { createCarMarkerElement, updateCarMarkerElement } from './carMarkerSvg';
import { wktToGeoJson, circleToGeoJson, kmlToGeoJson } from '@/lib/geo';
import { api } from '@/lib/api';
import { cacheGet, cacheSet } from '@/lib/db';
import { loadPopupSettings, savePopupSetting, POPUP_FIELDS } from '@/lib/popupSettings';
import { useT } from '@/lib/i18n';
import { useSession } from '@/context/SessionContext';
import { supportsDailySummary } from '@/lib/serverVersion';
import type { Vehicle, TraccarGeofence } from '@/types';

const STYLE_ROAD = '/custom/liberty.json';
const STYLE_SATELLITE = {
  version: 8 as const,
  sources: {
    satellite: {
      type: 'raster' as const,
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: '<a href="https://www.esri.com/" target="_blank" rel="noreferrer">Esri</a>',
      maxzoom: 22,
    },
  },
  layers: [{ id: 'satellite', type: 'raster' as const, source: 'satellite', minzoom: 0, maxzoom: 22 }],
} as const;

function styleForBasemap(basemap: string): string | maplibregl.StyleSpecification {
  return basemap === 'satellite' ? (STYLE_SATELLITE as unknown as maplibregl.StyleSpecification) : STYLE_ROAD;
}

function validCoord(lat: number | null | undefined, lng: number | null | undefined): boolean {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
  if (Math.abs(la) > 90 || Math.abs(ln) > 180) return false;
  return !(la === 0 && ln === 0);
}

function escapeHtml(s: string | number | null | undefined): string {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function haversineKm(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const GEOFENCE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4', '#ec4899'];

function geofenceToFeature(g: TraccarGeofence, index: number): GeoJSON.Feature | null {
  const feature = wktToGeoJson(g.area);
  if (!feature) return null;
  const attrColor = g.attributes?.color as string | undefined;
  const color = attrColor || GEOFENCE_COLORS[index % GEOFENCE_COLORS.length];
  feature.properties = {
    ...feature.properties,
    name: g.name,
    id: g.id,
    color,
    fill: `${color}22`,
  };
  return feature;
}

export interface FleetMapLibreHandle {
  fitAllVehicles: () => void;
  clearMeasurement: () => void;
  flyToVehicle: (lat: number, lng: number, zoom?: number) => void;
  flyToBounds: (bounds: [[number, number], [number, number]], options?: { padding?: number }) => void;
  _measureTotalKm?: number;
}

interface FleetMapLibreProps {
  vehicles: Vehicle[];
  selectedId: number | null;
  onSelectVehicle: (id: number | null) => void;
  className?: string;
  showControls?: boolean;
  showGeolocate?: boolean;
  fitPadding?: number;
  basemap?: string;
  showGeofences?: boolean;
  geofences?: TraccarGeofence[];
  measuring?: boolean;
  onMeasuringChange?: (m: boolean) => void;
  onMapClick?: (lat: number, lng: number) => void;
  initialZoom?: number;
  onZoomChange?: (zoom: number) => void;
  zoomPrefResolved?: boolean;
  /** Initial popup dismissed state loaded from IndexedDB */
  initialPopupDismissed?: boolean;
  /** Called when user opens/closes the popup */
  onPopupDismissedChange?: (dismissed: boolean) => void;
  /** Whether to show the day's route trail for the selected vehicle */
  showRoute?: boolean;
}

const FleetMapLibre = forwardRef<FleetMapLibreHandle, FleetMapLibreProps>(function FleetMapLibre(
  {
    vehicles,
    selectedId,
    onSelectVehicle,
    className = '',
    showControls = true,
    showGeolocate = true,
    fitPadding = 50,
    basemap = 'road',
    showGeofences = false,
    geofences = [],
    measuring = false,
    onMeasuringChange,
    initialZoom,
    onZoomChange,
    zoomPrefResolved,
    initialPopupDismissed,
    onPopupDismissedChange,
    onMapClick,
    showRoute = false,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<number, maplibregl.Marker>>(new Map());
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const popupDismissedRef = useRef(false);
  const vehiclesRef = useRef(vehicles);
  vehiclesRef.current = vehicles;
  // Initialize popupDismissedRef from persisted preference on mount
  if (initialPopupDismissed !== undefined) {
    popupDismissedRef.current = initialPopupDismissed;
  }
  const geoSourceRef = useRef<string | null>(null);
  const measureLineRef = useRef<maplibregl.Marker[]>([]);
  const measurePointsRef = useRef<{ lng: number; lat: number }[]>([]);
  const measureTotalKmRef = useRef(0);
  const fitDoneRef = useRef(false);
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const serverVersionRef = useRef<string | undefined>(undefined);
  const [mapReady, setMapReady] = useState(false);
  const [mapVisible, setMapVisible] = useState(false);
  const [styleKey, setStyleKey] = useState(0); // increments when basemap changes to re-create style-based layers
  const mapVisibleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { t } = useT();

  // Accumulator editor state
  const [accEditOpen, setAccEditOpen] = useState(false);
  const [accSaving, setAccSaving] = useState(false);
  const [editHours, setEditHours] = useState('');
  const [editDistance, setEditDistance] = useState('');
  const [accVehicleId, setAccVehicleId] = useState<number | null>(null);

  useImperativeHandle(ref, () => ({
    fitAllVehicles: () => fitBounds(mapRef.current, vehicles, fitPadding, {}),
    clearMeasurement: () => clearMeasure(),
    flyToVehicle: (lat: number, lng: number, zoom = 18) => {
      const map = mapRef.current;
      if (!map) return;
      map.flyTo({ center: [lng, lat], zoom, duration: 400 });
    },
    flyToBounds: (bounds: [[number, number], [number, number]], options?: { padding?: number }) => {
      const map = mapRef.current;
      if (!map) return;
      map.fitBounds(bounds, { padding: options?.padding ?? 60, maxZoom: 18, duration: 600 });
    },
    get _measureTotalKm() { return measureTotalKmRef.current; },
  }));

  function clearMeasure() {
    measureLineRef.current.forEach((m) => m.remove());
    measureLineRef.current = [];
    measurePointsRef.current = [];
    measureTotalKmRef.current = 0;
  }

  function showPopup(vehicle: Vehicle) {
    const map = mapRef.current;
    if (!map || !validCoord(vehicle.lat, vehicle.lng)) return;
    if (popupRef.current) popupRef.current.remove();

    const isMobile = window.innerWidth < 768;
    const settings = loadPopupSettings();
    const statusColors: Record<string, string> = {
      moving: '#3b82f6', idle: '#f59e0b', stopped: '#6b7280', offline: '#6b7280', alert: '#ef4444', maintenance: '#8b5cf6',
    };
    const sc = statusColors[vehicle.status] || '#6b7280';
    const dateStr = vehicle.lastUpdate
      ? new Date(vehicle.lastUpdate).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
      : '—';

    const todayMileageId = `mileage-${vehicle.id}-${Date.now()}`;

    const settingsId = `popup-settings-${vehicle.id}-${Date.now()}`;
    const panelId = `popup-panel-${vehicle.id}-${Date.now()}`;

    // Map POPUP_FIELDS keys to translation labels
    const fieldLabels: Record<string, string> = {
      speed: t('speed'), ignition: t('ignition'), updated: t('updated'),
      address: t('address'), driver: t('driver'), accumulators: t('sharedDeviceAccumulators'),
      todayMileage: t('today'), replayLink: t('replayLink'),
    };

    const settingsHtml = `
      <div id="${settingsId}" style="position:relative;display:inline-block">
        <span style="cursor:pointer;font-size:14px;opacity:0.5" onclick="(function(){
          var p=document.getElementById('${panelId}');
          if(p)p.style.display=p.style.display==='block'?'none':'block'
        })()">⚙</span>
        <div id="${panelId}" style="display:none;position:absolute;top:20px;right:0;z-index:9999;background:#fff;border:1px solid #d1d5db;border-radius:8px;padding:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);min-width:160px;font-size:11px;color:#111">
          <div style="font-weight:600;padding:4px 6px 6px;border-bottom:1px solid #e5e7eb;margin-bottom:4px">${t('displayFields')}</div>
          ${POPUP_FIELDS.map(f => `
            <label style="display:flex;align-items:center;gap:6px;padding:4px 6px;cursor:pointer;border-radius:4px"
              onmouseenter="this.style.background='#f3f4f6'" onmouseleave="this.style.background=''">
              <input type="checkbox" ${settings[f.key] !== false ? 'checked' : ''}
                onchange="try{var s=JSON.parse(localStorage.getItem('popup-display-fields')||'{}');s['${f.key}']=this.checked;localStorage.setItem('popup-display-fields',JSON.stringify(s));var p=this.closest('.maplibregl-popup-content');if(p){var e=p.querySelector('[data-key=\\'${f.key}\\']');if(e)e.style.display=this.checked?'':'none'}}catch(e){}"
                style="accent-color:#3b82f6">
              ${fieldLabels[f.key] || f.label}
            </label>
          `).join('')}
        </div>
      </div>
    `;

    /* ── Compact inline data rows ── */
    const dataRows: string[] = [];
    const addData = (key: string, label: string, valueHtml: string) => {
      const hidden = settings[key] === false ? ' style="display:none"' : '';
      dataRows.push(`<span data-key="${key}"${hidden} style="background:#f3f4f6;border-radius:4px;padding:2px 6px;white-space:nowrap;font-size:10px;line-height:1.6"><span style="color:#6b7280">${label}</span> <b style="color:#111">${valueHtml}</b></span>`);
    };
    addData('speed', '⚡', `${escapeHtml(vehicle.speed)} ${t('unitKmh')}`);
    addData('ignition', '🔑', vehicle.ignition ? '<span style="color:#22c55e">ON</span>' : '<span style="color:#6b7280">OFF</span>');
    addData('updated', '🕐', dateStr);
    if (!isMobile) {
      addData('address', '📍', escapeHtml(vehicle.address || '—'));
    }
    addData('driver', '👤', escapeHtml(vehicle.driver || '—'));

    // Consolidated engine hours & odometer row (with inline gear edit)
    const rawHours = vehicle._raw?.position?.attributes?.hours;
    const rawDist = vehicle._raw?.position?.attributes?.totalDistance;
    const rawOdo = vehicle.odometer;
    let hoursDisplay = '—';
    if (rawHours != null) {
      let n = Number(rawHours);
      if (Number.isFinite(n)) {
        n = n / 3600000;
        hoursDisplay = n.toFixed(1);
      }
    }
    // Use odometer (already in km, from vehicle) as primary distance; fallback to totalDistance
    let distDisplay = '—';
    if (rawOdo != null && Number.isFinite(Number(rawOdo))) {
      distDisplay = Number(rawOdo).toLocaleString();
    } else if (rawDist != null) {
      const n = Number(rawDist);
      if (Number.isFinite(n)) distDisplay = Math.round(n / 1000).toLocaleString();
    }
    const accEditId = `acc-edit-${vehicle.id}-${Date.now()}`;
    const hiddenAttr = settings.accumulators === false ? ' style="display:none"' : '';
    const accHtml = `
      <span data-key="accumulators"${hiddenAttr} style="background:#f3f4f6;border-radius:4px;padding:2px 7px;white-space:nowrap;font-size:10px;line-height:1.6">
        <span style="color:#6b7280">⏱</span> <b style="color:#111;margin-right:3px">${hoursDisplay}</b><span style="color:#6b7280">h</span>
        <span style="color:#d1d5db;margin:0 2px">|</span>
        <span style="color:#6b7280">📏</span> <b style="color:#111;margin-right:3px">${distDisplay}</b><span style="color:#6b7280">km</span>
        <span id="${accEditId}" style="cursor:pointer;margin-left:1px;color:#9ca3af" onclick="window.__openAccumulatorEditor(${vehicle.id})">⚙</span>
      </span>`;
    dataRows.push(accHtml);

    const todayMileageRender = `<span data-key="todayMileage"${settings.todayMileage !== false ? '' : ' style="display:none"'} style="background:#f3f4f6;border-radius:4px;padding:2px 6px;white-space:nowrap;font-size:10px;line-height:1.6"><span style="color:#6b7280">📅</span> <b style="color:#111"><span id="${todayMileageId}">—</span> ${t('unitKm')}</b></span>`;

    const html = `
      <div style="font-family:system-ui,-apple-system,sans-serif;font-size:12px;line-height:1.4;min-width:180px;max-width:${isMobile ? '200px' : '280px'}">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;padding-bottom:4px;border-bottom:1px solid #e5e7eb">
          <span style="width:7px;height:7px;border-radius:50%;background:${sc};flex-shrink:0"></span>
          <span style="font-weight:600;font-size:12px;color:#111;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(vehicle.name)}</span>
          ${settingsHtml}
          <span style="font-size:9px;padding:1px 5px;border-radius:3px;background:${sc}22;color:${sc};font-weight:600;text-transform:capitalize">${escapeHtml(vehicle.status)}</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:4px">
          ${dataRows.join('')}
          ${todayMileageRender}
        </div>
        <div data-key="replayLink"${settings.replayLink !== false ? '' : ' style="display:none"'} style="display:flex;gap:8px;border-top:1px solid #e5e7eb;padding:3px 0">
          <a href="javascript:void(0)" onclick="window.__openDeviceProfile(${vehicle.id})" style="flex:1;display:flex;align-items:center;justify-content:center;gap:3px;font-size:10px;color:#3b82f6;text-decoration:none;font-weight:500;cursor:pointer">🔍 ${t('details')}</a>
          <a href="javascript:void(0)" onclick="window.__openReplayTab('${vehicle.id}')" style="flex:1;display:flex;align-items:center;justify-content:center;gap:3px;font-size:10px;color:#3b82f6;text-decoration:none;font-weight:500;cursor:pointer">▶ ${t('replayToday')}</a>
        </div>
      </div>
    `;

    const popup = new maplibregl.Popup({
      offset: [0, -10],
      closeButton: true,
      closeOnClick: false,
      maxWidth: isMobile ? '200px' : '300px',
    })
      .setLngLat([vehicle.lng!, vehicle.lat!])
      .setHTML(html)
      .addTo(map);

    // Remember when user dismisses popup (X button) — don't re-show on arrow nav
    // IMPORTANT: reset after removal above so old popup's close event doesn't pollute state
    popupDismissedRef.current = false;
    popup.on('close', () => {
      popupDismissedRef.current = true;
      onPopupDismissedChange?.(true);
    });
    popupRef.current = popup;

    // Fetch today's mileage asynchronously — try replay cache first, then API
    if (settings.todayMileage !== false) {
      const today = new Date();
      const y = today.getFullYear();
      const m = today.getMonth();
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const monthStr = `${y}-${String(m + 1).padStart(2, '0')}`;
      const kmKey = `replay-km-${vehicle.id}-${monthStr}`;

      (async () => {
        // 1) Load existing cache from IndexedDB (may have data from ReplayPage)
        const cached = await cacheGet<Record<string, number>>('mileage', kmKey);
        const map: Record<string, number> = cached ? { ...cached } : {};
        if (map[dateStr] !== undefined) {
          const el = document.getElementById(todayMileageId);
          if (el) el.textContent = String(map[dateStr]);
          return;
        }
        // 2) Fetch missing data (only today for popup)
        const from = new Date(y, m, 1).toISOString();
        const to = new Date(y, m + 1, 0, 23, 59, 59).toISOString();
        try {
          if (supportsDailySummary(serverVersionRef.current)) {
            // v5+: use summary with daily=true (single API call for whole month)
            const summaryParams: any = { from, to, deviceId: [vehicle.id] };
            summaryParams.daily = true;
            const rows = await api.reports.summary(summaryParams) as Array<Record<string, unknown>>;
            (rows || []).forEach((r: any) => {
              if (!r.startTime) return;
              const d = String(r.startTime).slice(0, 10);
              const km = Math.max(0, Math.round((Number(r.distance) || 0) / 1000));
              map[d] = km;
            });
          } else {
            // v4.4: fetch just today's summary (single day query)
            const todayDay = today.getDate();
            const todayFrom = new Date(Date.UTC(y, m, todayDay, 0, 0, 0)).toISOString();
            const todayTo = new Date(Date.UTC(y, m, todayDay, 23, 59, 59)).toISOString();
            const rows = await api.reports.summary({ from: todayFrom, to: todayTo, deviceId: [vehicle.id] }) as Array<any>;
            if (rows && rows.length > 0) {
              const km = Math.max(0, Math.round((Number(rows[0].distance) || 0) / 1000));
              map[dateStr] = km;
            }
          }
          // 3) Merge with existing cache & save
          const isCurrentMonth = y === new Date().getFullYear() && m === new Date().getMonth();
          const ttl = isCurrentMonth ? 5 * 60 * 1000 : 60 * 24 * 60 * 60 * 1000;
          cacheSet('mileage', kmKey, map, ttl);
          const el = document.getElementById(todayMileageId);
          if (el) {
            el.textContent = map[dateStr] !== undefined ? String(map[dateStr]) : '0';
          }
        } catch {
          const el = document.getElementById(todayMileageId);
          if (el) el.textContent = '—';
        }
      })();
    }
  }

  // Expose global functions so raw HTML popup can trigger React actions
  useEffect(() => {
    (window as any).__openReplayTab = (deviceId: string) => {
      navigateRef.current(`/replay?deviceId=${deviceId}&date=today`);
    };
    (window as any).__openDeviceProfile = (deviceId: number) => {
      navigateRef.current(`/devices/${deviceId}`);
    };
    (window as any).__openAccumulatorEditor = (deviceId: number) => {
      setAccVehicleId(deviceId);
      const vehicle = vehiclesRef.current.find((v) => v.id === deviceId);
      const attr = vehicle?._raw?.position?.attributes || {};
      const rawHours = attr.hours;
      const rawDist = attr.totalDistance;
      if (rawHours != null) {
        let n = Number(rawHours);
        if (!Number.isFinite(n)) { setEditHours('0'); } else {
          n = n / 3600000;
          setEditHours(n.toFixed(1));
        }
      } else { setEditHours('0'); }
      if (rawDist != null) {
        const n = Number(rawDist);
        setEditDistance(Number.isFinite(n) ? (n / 1000).toFixed(1) : '0');
      } else { setEditDistance('0'); }
      setAccEditOpen(true);
    };
    return () => {
      delete (window as any).__openReplayTab;
      delete (window as any).__openDeviceProfile;
      delete (window as any).__openAccumulatorEditor;
    };
  }, []);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleForBasemap(basemap),
      center: [139.6917, 35.6895],
      zoom: 5,
      attributionControl: false as const,
    });

    if (showControls) {
      map.addControl(new maplibregl.NavigationControl(), 'top-right');
      if (showGeolocate) {
        map.addControl(new maplibregl.GeolocateControl({
          positionOptions: { enableHighAccuracy: true },
          trackUserLocation: true,
        }), 'top-right');
      }
      map.addControl(new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 120 }), 'bottom-left');
    }

    map.on('load', () => {
      mapRef.current = map;
      // Restore saved zoom after map loads
      if (initialZoom != null) {
        map.jumpTo({ zoom: initialZoom });
      }
      setMapReady(true);
    });

    // Listen for zoom changes to persist
    map.on('zoomend', () => {
      if (onZoomChange) {
        onZoomChange(map.getZoom());
      }
    });

    // Fallback: if map loads very fast, load event may have already fired
    if (map.loaded()) {
      mapRef.current = map;
      if (initialZoom != null) {
        map.jumpTo({ zoom: initialZoom });
      }
      setMapReady(true);
    } else {
      // Store map ref early so it can be used in cleanup
      mapRef.current = map;
    }

    return () => {
      if (popupRef.current) popupRef.current.remove();
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update basemap style — re-create style-based layers after style loads
  const prevBasemapRef = useRef(basemap);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (prevBasemapRef.current === basemap) return;
    prevBasemapRef.current = basemap;
    const onStyleLoad = () => setStyleKey((k) => k + 1);
    map.on('style.load', onStyleLoad);
    map.setStyle(styleForBasemap(basemap));
    return () => { map.off('style.load', onStyleLoad); };
  }, [basemap, mapReady]);

  // Track previous selectedId separately so marker sync effect doesn't re-run on selection changes
  const prevSelectedRef = useRef<number | null>(null);

  // RAF-based marker position updates — batch position changes into a single frame
  const pendingPositionsRef = useRef<Map<number, { lng: number; lat: number }>>(new Map());
  const rafIdRef = useRef<number | null>(null);

  function flushPendingPositions() {
    const map = mapRef.current;
    if (!map) return;
    pendingPositionsRef.current.forEach((pos, id) => {
      const marker = markersRef.current.get(id);
      if (!marker) return;
      marker.setLngLat([pos.lng, pos.lat]);
      const el = marker.getElement();
      el.setAttribute('data-lng', String(pos.lng));
      el.setAttribute('data-lat', String(pos.lat));
      if (popupRef.current && id === prevSelectedRef.current) {
        popupRef.current.setLngLat([pos.lng, pos.lat]);
      }
    });
    pendingPositionsRef.current.clear();
    rafIdRef.current = null;
  }

  function schedulePositionUpdate(id: number, lng: number, lat: number) {
    pendingPositionsRef.current.set(id, { lng, lat });
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(flushPendingPositions);
    }
  }

  // Sync markers — only for structural changes (add/remove), appearance changes happen inline
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    // Wait until IndexedDB prefs are loaded (zoom + popupDismissed)
    if (!zoomPrefResolved) return;

    const currentIds = new Set(markersRef.current.keys());
    const vehicleIds = new Set(vehicles.filter((v) => validCoord(v.lat, v.lng)).map((v) => v.id));

    // Remove stale markers
    currentIds.forEach((id) => {
      if (!vehicleIds.has(id)) {
        markersRef.current.get(id)?.remove();
        markersRef.current.delete(id);
      }
    });

    // Add/update markers
    vehicles.forEach((v) => {
      if (!validCoord(v.lat, v.lng)) return;

      const isSelected = v.id === selectedId;
      let marker = markersRef.current.get(v.id);

      if (marker) {
        const el = marker.getElement();
        const prevLng = el.getAttribute('data-lng');
        const prevLat = el.getAttribute('data-lat');
        const lng = String(v.lng);
        const lat = String(v.lat);
        const posChanged = prevLng !== lng || prevLat !== lat;
        const prevCourse = el.getAttribute('data-course');
        const prevStatus = el.getAttribute('data-status');
        const courseChanged = prevCourse !== String(Number.isFinite(Number(v.course)) ? Number(v.course) : 0);
        const statusChanged = prevStatus !== v.status;

        if (posChanged) {
          // Schedule position update via RAF to batch with other changes
          schedulePositionUpdate(v.id, v.lng!, v.lat!);
        }
        // Only call full updateCarMarkerElement when appearance (course/status/selection) actually changed
        if (courseChanged || statusChanged || isSelected !== (prevSelectedRef.current === v.id)) {
          updateCarMarkerElement(el as HTMLDivElement, v, isSelected);
        }
      } else {
        const el = createCarMarkerElement(v, isSelected);
        el.setAttribute('data-lng', String(v.lng));
        el.setAttribute('data-lat', String(v.lat));
        marker = new maplibregl.Marker({ element: el })
          .setLngLat([v.lng!, v.lat!])
          .addTo(map);

        el.addEventListener('click', () => {
          popupDismissedRef.current = false;
          onPopupDismissedChange?.(false);
          onSelectVehicle(v.id);
          // Popup effect will handle showing popup with latest data
        });
        markersRef.current.set(v.id, marker);
      }
    });

    // Fit bounds on first load, or on mobile when no vehicle is selected
    // Uses duration:0 so the map is already at correct position when revealed
    if (vehicles.length > 0 && (selectedId == null || !fitDoneRef.current)) {
      if (selectedId == null) {
        // No vehicle selected → show all vehicles with saved zoom
        fitBounds(map, vehicles, fitPadding, { duration: 0 });
        if (initialZoom != null) {
          map.jumpTo({ zoom: initialZoom });
        }
      }
      if (!fitDoneRef.current) {
        fitDoneRef.current = true;
      }
      setMapVisible(true);
    }
  }, [vehicles, selectedId, onSelectVehicle, fitPadding, mapReady, zoomPrefResolved]);

  // Show popup when vehicle is selected (from sidebar, map click, or arrow nav)
  useEffect(() => {
    if (!selectedId) {
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
      prevSelectedRef.current = null;
      return;
    }
    // Wait until zoom/popup preferences are resolved (loaded from IndexedDB)
    if (!zoomPrefResolved) return;

    // Same vehicle, popup already showing → just update position (handles RAF-moved markers)
    if (selectedId === prevSelectedRef.current) {
      if (popupRef.current) {
        const vehicle = vehicles.find((v) => v.id === selectedId);
        if (vehicle && validCoord(vehicle.lat, vehicle.lng)) {
          popupRef.current.setLngLat([vehicle.lng!, vehicle.lat!]);
        }
      }
      return;
    }
    prevSelectedRef.current = selectedId;

    // Don't re-show popup on arrow nav if user previously closed it
    if (popupDismissedRef.current) return;

    const vehicle = vehicles.find((v) => v.id === selectedId);
    if (vehicle) {
      showPopup(vehicle);
      onPopupDismissedChange?.(false);
    }
  }, [selectedId, vehicles, zoomPrefResolved]);

  // Fit bounds when vehicles change significantly
  useEffect(() => {
    return () => { fitDoneRef.current = false; };
  }, [vehicles.length]);

  // Sync geofences
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove existing geofence layers
    ['geofences-fill', 'geofences-line'].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    if (map.getSource('geofences')) map.removeSource('geofences');

    if (!showGeofences || !geofences.length) return;

    const features = geofences.map(geofenceToFeature).filter(Boolean) as GeoJSON.Feature[];

    map.addSource('geofences', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features },
    });

    map.addLayer({
      id: 'geofences-fill',
      type: 'fill',
      source: 'geofences',
      paint: {
        'fill-color': ['get', 'fill'],
        'fill-opacity': 0.3,
      },
    });

    map.addLayer({
      id: 'geofences-line',
      type: 'line',
      source: 'geofences',
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 2,
        'line-opacity': 0.8,
      },
    });
  }, [showGeofences, geofences, styleKey]);

  /* ── Accuracy circles ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const id = 'accuracy-circles';
    const srcId = 'accuracy-src';

    // Create source & layer on first run
    if (!map.getSource(srcId)) {
      map.addSource(srcId, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id,
        type: 'fill',
        source: srcId,
        paint: {
          'fill-color': '#3b82f6',
          'fill-opacity': 0.15,
          'fill-outline-color': '#3b82f6',
        },
      } as any);
    }

    // Build circles for vehicles with accuracy > 0
    const features = vehicles
      .filter((v) => v.lat != null && v.lng != null && (v.accuracy ?? 0) > 0)
      .map((v) => circleToGeoJson([v.lng!, v.lat!], v.accuracy! * 0.5, 24));

    (map.getSource(srcId) as maplibregl.GeoJSONSource)?.setData({ type: 'FeatureCollection', features });

    return () => {
      try {
        if (map.getLayer(id)) map.removeLayer(id);
        if (map.getSource(srcId)) map.removeSource(srcId);
      } catch { /* ignore if map already destroyed */ }
    };
  }, [mapReady, vehicles, styleKey]);

  /* ── Live route trail for selected vehicle (cached in IndexedDB) ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const id = 'live-route';
    const srcId = 'live-route-src';

    if (!map.getSource(srcId)) {
      map.addSource(srcId, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id,
        type: 'line',
        source: srcId,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#3b82f6',
          'line-width': 3,
          'line-opacity': 0.6,
        },
      } as any);
    }

    // If route toggle is off or no vehicle selected, clear and bail
    if (!showRoute || selectedId == null) {
      (map.getSource(srcId) as maplibregl.GeoJSONSource)?.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    let cancelled = false;
    const cacheKey = `route-${selectedId}`;

    const applyToMap = (positions: any[]) => {
      if (cancelled || !map.getSource(srcId)) return;
      const coords = (positions || [])
        .filter((p: any) => p.latitude != null && p.longitude != null)
        .sort((a: any, b: any) => (a.fixTime || a.serverTime || '').localeCompare(b.fixTime || b.serverTime || ''))
        .map((p: any) => [p.longitude, p.latitude] as [number, number]);
      if (coords.length < 2) {
        (map.getSource(srcId) as maplibregl.GeoJSONSource)?.setData({ type: 'FeatureCollection', features: [] });
        return;
      }
      (map.getSource(srcId) as maplibregl.GeoJSONSource)?.setData({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: {},
        }],
      });
    };

    (async () => {
      // 1) Show cached data immediately (if available)
      const cached = await cacheGet<{ positions: any[]; latestFixTime: string }>('routes', cacheKey);
      if (cancelled) return;
      if (cached && cached.positions.length > 0) {
        applyToMap(cached.positions);
      }

      // 2) Smart refresh: skip API call if vehicle hasn't moved since last cache
      const vehicle = vehicles.find((v) => v.id === selectedId);
      const vehicleLatestTime = vehicle?.lastUpdate;
      if (cached && vehicleLatestTime && cached.latestFixTime && vehicleLatestTime <= cached.latestFixTime) {
        return; // Nothing new — keep showing cached data
      }

      // 3) Fetch fresh data
      try {
        const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const to = new Date().toISOString();
        const data = await api.positions.list({ deviceId: selectedId, from, to }) as any[];
        if (cancelled) return;
        applyToMap(data);
        // Store both positions and latest timestamp for smarter expiry next time
        const latestFixTime =
          (data || [])
            .map((p: any) => p.fixTime || p.serverTime || '')
            .filter(Boolean)
            .sort()
            .reverse()[0] || vehicleLatestTime || '';
        cacheSet('routes', cacheKey, { positions: data, latestFixTime }).catch(() => {});
      } catch { /* ignore */ }
    })();

    return () => { cancelled = true; };
  }, [mapReady, selectedId, showRoute, styleKey]);

  /* ── POI Layer (KML overlay from user settings) ── */
  const { user, server } = useSession();
  serverVersionRef.current = server?.version;
  const poiLayerUrl = (user?.attributes as Record<string, string> | undefined)?.poiLayer;

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !poiLayerUrl) return;

    const id = 'poi-src';
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(poiLayerUrl);
        const text = await res.text();
        if (cancelled || !map.getSource(id)) return;
        const data = kmlToGeoJson(text);

        (map.getSource(id) as maplibregl.GeoJSONSource)?.setData(data);
      } catch { /* ignore invalid KML URL */ }
    })();

    return () => { cancelled = true; };
  }, [mapReady, poiLayerUrl, styleKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const id = 'poi-src';

    if (!map.getSource(id)) {
      map.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

      map.addLayer({
        source: id, id: 'poi-fill', type: 'fill',
        filter: ['==', '$type', 'Polygon'],
        paint: { 'fill-color': ['coalesce', ['get', 'fill'], '#3b82f6'], 'fill-opacity': 0.3 },
      } as any);
      map.addLayer({
        source: id, id: 'poi-line', type: 'line',
        paint: { 'line-color': ['coalesce', ['get', 'stroke'], '#3b82f6'], 'line-width': 2 },
      } as any);
      map.addLayer({
        source: id, id: 'poi-point', type: 'circle',
        filter: ['==', '$type', 'Point'],
        paint: { 'circle-radius': 5, 'circle-color': ['coalesce', ['get', 'icon-color'], '#3b82f6'] },
      } as any);
      map.addLayer({
        source: id, id: 'poi-label', type: 'symbol',
        layout: {
          'text-field': ['coalesce', ['get', 'name'], ''],
          'text-anchor': 'top', 'text-offset': [0, 1.5],
          'text-size': 11,
        },
        paint: { 'text-halo-color': 'white', 'text-halo-width': 1 },
      } as any);
    }

    return () => {
      ['poi-label', 'poi-point', 'poi-line', 'poi-fill'].forEach((l) => {
        try { if (map.getLayer(l)) map.removeLayer(l); } catch { /* ignore */ }
      });
      try { if (map.getSource(id)) map.removeSource(id); } catch { /* ignore */ }
    };
  }, [mapReady, styleKey]);

  /* ── Fly to selected vehicle — adaptive zoom ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || selectedId == null) return;
    // Wait until zoom pref has been resolved (loaded from IndexedDB or confirmed absent)
    if (!zoomPrefResolved) return;
    const vehicle = vehicles.find((v) => v.id === selectedId);
    if (!vehicle || !validCoord(vehicle.lat, vehicle.lng)) return;
    const zoom = window.innerWidth < 768 ? 14 : 16;
    map.flyTo({ center: [vehicle.lng!, vehicle.lat!], zoom, duration: 600 });
  }, [selectedId, mapReady, zoomPrefResolved]);

  // Handle map clicks (measurement or emulator)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!measuring && !onMapClick) return;

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      const { lng, lat } = e.lngLat;
      if (onMapClick) {
        onMapClick(lat, lng);
      }
      if (measuring) {
        // Add marker
        const el = document.createElement('div');
        el.style.cssText = 'width:10px;height:10px;border-radius:50%;background:#f59e0b;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4);';
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([lng, lat])
          .addTo(map);
        measureLineRef.current.push(marker);
        measurePointsRef.current.push({ lng, lat });

        // Update total distance
        const pts = measurePointsRef.current;
        if (pts.length >= 2) {
          const last = pts[pts.length - 1]!;
          const prev = pts[pts.length - 2]!;
          measureTotalKmRef.current += haversineKm(prev.lng, prev.lat, last.lng, last.lat);
        }
      }
    };

    map.on('click', handleClick);
    return () => { map.off('click', handleClick); };
  }, [measuring, onMapClick]);

  // Fallback: show map after 3s even if fitBounds never triggered (no vehicles/slow data)
  useEffect(() => {
    if (mapVisible) return;
    mapVisibleTimerRef.current = setTimeout(() => setMapVisible(true), 3000);
    return () => { if (mapVisibleTimerRef.current) clearTimeout(mapVisibleTimerRef.current); };
  }, [mapVisible]);

  return (
    <>
      <div ref={containerRef} className={`h-full w-full ${className} ${!mapVisible ? 'opacity-0' : ''}`} />

      {/* Accumulator editor modal */}
      {accEditOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60" onClick={() => setAccEditOpen(false)}>
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-4">{t('posField_editAccumulators')}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">{t('posField_editHours')}</label>
                <input type="number" step="0.1" value={editHours}
                  onChange={(e) => setEditHours(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">{t('posField_editDistance')}</label>
                <input type="number" step="0.1" value={editDistance}
                  onChange={(e) => setEditDistance(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary" />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setAccEditOpen(false)}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">
                {t('posField_cancel')}
              </button>
              <button onClick={async () => {
                if (accVehicleId == null) return;
                setAccSaving(true);
                try {
                  const payload: Record<string, unknown> = { deviceId: accVehicleId };
                  const parsedH = parseFloat(editHours);
                  const parsedD = parseFloat(editDistance);
                  payload.hours = Number.isFinite(parsedH) ? parsedH * 3600000 : 0;
                  payload.totalDistance = Number.isFinite(parsedD) ? parsedD * 1000 : 0;
                  await api.devices.putAccumulators(accVehicleId, payload);
                  setAccEditOpen(false);
                } catch (e) {
                  console.error('Failed to save accumulators', e);
                } finally {
                  setAccSaving(false);
                }
              }} disabled={accSaving}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {accSaving ? t('saving') : t('posField_save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

function fitBounds(map: maplibregl.Map | null, vehicles: Vehicle[], padding: number, extraOptions: Record<string, unknown> = {}) {
  if (!map) return;
  const withCoords = vehicles.filter((v) => validCoord(v.lat, v.lng));
  if (withCoords.length === 0) return;

  const bounds = new maplibregl.LngLatBounds();
  withCoords.forEach((v) => bounds.extend([v.lng!, v.lat!]));
  map.fitBounds(bounds, { padding, maxZoom: 14, ...extraOptions });
}

export default FleetMapLibre;
