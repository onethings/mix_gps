import { useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { createCarMarkerElement, updateCarMarkerElement } from './carMarkerSvg';
import { wktToGeoJson } from '@/lib/geo';
import { api } from '@/lib/api';
import { cacheGet, cacheSet } from '@/lib/db';
import { loadPopupSettings, savePopupSetting, POPUP_FIELDS } from '@/lib/popupSettings';
import { useT } from '@/lib/i18n';
import type { Vehicle, TraccarGeofence } from '@/types';

const STYLE_ROAD = 'https://tiles.openfreemap.org/styles/liberty';
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
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<number, maplibregl.Marker>>(new Map());
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const popupDismissedRef = useRef(false);
  const geoSourceRef = useRef<string | null>(null);
  const measureLineRef = useRef<maplibregl.Marker[]>([]);
  const measurePointsRef = useRef<{ lng: number; lat: number }[]>([]);
  const measureTotalKmRef = useRef(0);
  const fitDoneRef = useRef(false);
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const [mapReady, setMapReady] = useState(false);
  const { t } = useT();

  useImperativeHandle(ref, () => ({
    fitAllVehicles: () => fitBounds(mapRef.current, vehicles, fitPadding),
    clearMeasurement: () => clearMeasure(),
    flyToVehicle: (lat: number, lng: number, zoom = 18) => {
      const map = mapRef.current;
      if (!map) return;
      map.flyTo({ center: [lng, lat], zoom, duration: 400 });
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
      address: t('address'), driver: t('driver'), odometer: t('odometer'),
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
    addData('odometer', '📊', `${vehicle.odometer ? Number(vehicle.odometer).toLocaleString() : '—'} ${t('unitKm')}`);

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
        <div data-key="replayLink"${settings.replayLink !== false ? '' : ' style="display:none"'}>
          <a href="javascript:void(0)" onclick="window.__openReplayTab('${vehicle.id}')" style="display:flex;align-items:center;justify-content:center;gap:3px;font-size:10px;color:#3b82f6;text-decoration:none;font-weight:500;padding:3px 0;border-top:1px solid #e5e7eb;cursor:pointer">▶ ${t('replayToday')}</a>
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
    popup.on('close', () => { popupDismissedRef.current = true; });
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
        // 1) Try IndexedDB cache first (same cache as ReplayPage uses)
        const cached = await cacheGet<Record<string, number>>('mileage', kmKey);
        if (cached && cached[dateStr] !== undefined) {
          const el = document.getElementById(todayMileageId);
          if (el) el.textContent = String(cached[dateStr]);
          return;
        }
        // 2) Fetch full month from API (more reliable than single-day query)
        const from = new Date(y, m, 1).toISOString();
        const to = new Date(y, m + 1, 0, 23, 59, 59).toISOString();
        try {
          const rows = await api.reports.summary({ from, to, deviceId: [vehicle.id], daily: true }) as Array<Record<string, unknown>>;
          const map: Record<string, number> = {};
          (rows || []).forEach((r: any) => {
            if (!r.startTime) return;
            const d = String(r.startTime).slice(0, 10);
            const km = Math.max(0, Math.round((Number(r.distance) || 0) / 1000));
            map[d] = km;
          });
          // 3) Cache for future use (same TTL as ReplayPage)
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

  // Expose global function so raw HTML popup can trigger tab-based navigation without full page reload
  useEffect(() => {
    (window as any).__openReplayTab = (deviceId: string) => {
      navigateRef.current(`/replay?deviceId=${deviceId}&date=today`);
    };
    return () => { delete (window as any).__openReplayTab; };
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
    }

    map.on('load', () => {
      mapRef.current = map;
      setMapReady(true);
    });

    // Fallback: if map loads very fast, load event may have already fired
    if (map.loaded()) {
      mapRef.current = map;
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

  // Update basemap style — re-sync markers after style loads
  const prevBasemapRef = useRef(basemap);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (prevBasemapRef.current === basemap) return;
    prevBasemapRef.current = basemap;
    map.setStyle(styleForBasemap(basemap));
    // After style change, re-add markers by triggering a re-sync
    // Markers will be re-created in the markers effect when mapReady stays true
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

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
          onSelectVehicle(v.id);
          showPopup(v);
        });
        markersRef.current.set(v.id, marker);
      }
    });

    // Fit bounds on first load
    if (!fitDoneRef.current && vehicles.length > 0) {
      fitBounds(map, vehicles, fitPadding);
      fitDoneRef.current = true;
    }
  }, [vehicles, selectedId, onSelectVehicle, fitPadding, mapReady]);

  // Show popup when vehicle is selected from sidebar (or close when deselected)
  useEffect(() => {
    if (!selectedId) {
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
      prevSelectedRef.current = null;
      return;
    }
    // Skip if same as before (avoid re-showing on marker re-sync)
    if (selectedId === prevSelectedRef.current) return;
    prevSelectedRef.current = selectedId;

    // Don't re-show popup on arrow nav if user previously closed it
    if (popupDismissedRef.current) return;

    const vehicle = vehicles.find((v) => v.id === selectedId);
    if (vehicle) showPopup(vehicle);
  }, [selectedId, vehicles]);

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
  }, [showGeofences, geofences]);

  /* ── Fly to selected vehicle on user click ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || selectedId == null) return;
    const vehicle = vehicles.find((v) => v.id === selectedId);
    if (!vehicle || !validCoord(vehicle.lat, vehicle.lng)) return;
    map.flyTo({ center: [vehicle.lng!, vehicle.lat!], zoom: 18, duration: 600 });
  }, [selectedId, mapReady]);

  // Add measurement click handler to map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !measuring) return;

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      const { lng, lat } = e.lngLat;

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
    };

    map.on('click', handleClick);
    return () => { map.off('click', handleClick); };
  }, [measuring]);

  return <div ref={containerRef} className={`h-full w-full ${className}`} />;
});

function fitBounds(map: maplibregl.Map | null, vehicles: Vehicle[], padding: number) {
  if (!map) return;
  const withCoords = vehicles.filter((v) => validCoord(v.lat, v.lng));
  if (withCoords.length === 0) return;

  const bounds = new maplibregl.LngLatBounds();
  withCoords.forEach((v) => bounds.extend([v.lng!, v.lat!]));
  map.fitBounds(bounds, { padding, maxZoom: 14 });
}

export default FleetMapLibre;
