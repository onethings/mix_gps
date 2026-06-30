import { useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { createCarMarkerElement, updateCarMarkerElement } from './carMarkerSvg';
import { wktToGeoJson } from '@/lib/geo';
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
  const geoSourceRef = useRef<string | null>(null);
  const measureLineRef = useRef<maplibregl.Marker[]>([]);
  const measurePointsRef = useRef<{ lng: number; lat: number }[]>([]);
  const measureTotalKmRef = useRef(0);
  const fitDoneRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);

  useImperativeHandle(ref, () => ({
    fitAllVehicles: () => fitBounds(mapRef.current, vehicles, fitPadding),
    clearMeasurement: () => clearMeasure(),
    get _measureTotalKm() { return measureTotalKmRef.current; },
  }));

  function clearMeasure() {
    measureLineRef.current.forEach((m) => m.remove());
    measureLineRef.current = [];
    measurePointsRef.current = [];
    measureTotalKmRef.current = 0;
  }

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleForBasemap(basemap),
      center: [121.5, 25.05],
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

  // Sync markers
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
        marker.setLngLat([v.lng!, v.lat!]);
        updateCarMarkerElement(marker.getElement() as HTMLDivElement, v, isSelected);
      } else {
        const el = createCarMarkerElement(v, isSelected);
        marker = new maplibregl.Marker({ element: el })
          .setLngLat([v.lng!, v.lat!])
          .addTo(map);

        el.addEventListener('click', () => onSelectVehicle(v.id));
        markersRef.current.set(v.id, marker);
      }
    });

    // Fit bounds on first load
    if (!fitDoneRef.current && vehicles.length > 0) {
      fitBounds(map, vehicles, fitPadding);
      fitDoneRef.current = true;
    }
  }, [vehicles, selectedId, onSelectVehicle, fitPadding, mapReady]);

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
    map.flyTo({ center: [vehicle.lng!, vehicle.lat!], zoom: 15, duration: 600 });
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
