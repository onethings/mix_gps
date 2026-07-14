import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Search, Circle, Pentagon, Pen, MapPin, Navigation, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useT } from '@/lib/i18n';
import { useFlash } from '@/context/FlashContext';
import { searchOsm, fetchOsmGeometry, geojsonToWkt, circleToWkt, simplifyGeoJson, sanitizeWkt } from '@/lib/geo';

interface VehicleShort {
  id: number;
  name: string;
  lat: number;
  lng: number;
  plate?: string;
  status?: string;
}

interface GeofenceEditorDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: { name?: string; description?: string; area?: string } | null;
  vehicles?: VehicleShort[];
  onSave: (data: { name: string; description?: string; area: string }) => Promise<void>;
}

const DRAW_MODES = [
  { key: 'polygon' as const, icon: Pentagon, labelKey: 'polygon' },
  { key: 'circle' as const, icon: Circle, labelKey: 'circleGeofence' },
  { key: 'freehand' as const, icon: Pen, labelKey: 'lineGeofence' },
];

const TILE_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

function guessDefaultCenter(vehicles: VehicleShort[]) {
  const withCoords = (vehicles || []).filter(
    (v) => Number.isFinite(v.lat) && Number.isFinite(v.lng) && !(v.lat === 0 && v.lng === 0),
  );
  if (withCoords.length > 0) {
    const avgLng = withCoords.reduce((s, v) => s + v.lng, 0) / withCoords.length;
    const avgLat = withCoords.reduce((s, v) => s + v.lat, 0) / withCoords.length;
    return { center: [avgLng, avgLat] as [number, number], zoom: Math.max(2, 14 - Math.log2(withCoords.length)) };
  }
  return { center: [139.6917, 35.6895] as [number, number], zoom: 10 };
}

/* ── WKT → GeoJSON for map display ── */
function wktToGeoJsonForDisplay(wkt: string): any | null {
  try {
    if (!wkt) return null;

    const parseCoord = (s: string): [number, number] => {
      const parts = s.trim().split(/\s+/).map(Number);
      const a = parts[0]!;
      const b = parts[1]!;
      if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180) return [b, a];
      if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 180 && Math.abs(b) <= 90) return [a, b];
      return [b, a];
    };

    const polyMatch = wkt.match(/^POLYGON\s*\(\(([^)]+)\)\)\s*$/i);
    if (polyMatch) {
      const ring = polyMatch[1]!.split(',').map((p) => parseCoord(p));
      return { type: 'Polygon' as const, coordinates: [ring] };
    }

    // Try MULTIPOLYGON with multiple polygons
    let remaining = wkt.replace(/^MULTIPOLYGON\s*\(/i, '').replace(/\)\s*$/, '');
    const ringTexts = remaining.split(/\s*\)\s*,\s*\(\s*/);
    if (ringTexts.length > 1) {
      const polygons: [number, number][][] = ringTexts.map((rt) => {
        const clean = rt.replace(/^\(|\)$/g, '');
        return clean.split(',').map((p) => parseCoord(p));
      });
      return { type: 'MultiPolygon' as const, coordinates: polygons.map((p) => [p]) };
    }

    // Single polygon multi
    const singleMulti = wkt.match(/^MULTIPOLYGON\s*\(\(\(([^)]+)\)\)\)\s*$/i);
    if (singleMulti) {
      const ring = singleMulti[1]!.split(',').map((p) => parseCoord(p));
      return { type: 'Polygon' as const, coordinates: [ring] };
    }
  } catch { /* ignore */ }
  return null;
}

/* ── Helper: simplify freehand drawn points ── */
function simplifyFreehand(points: [number, number][], step = 8): [number, number][] {
  const result: [number, number][] = [];
  for (let i = 0; i < points.length; i += step) {
    result.push(points[i]);
  }
  const last = points[points.length - 1];
  if (result[result.length - 1] !== last) {
    result.push(last);
  }
  return result;
}

/* ── Helper: count coordinates in WKT ── */
function countCoords(wkt: string): number {
  const m = wkt.match(/[\d.]+ [\d.]+/g);
  return m ? m.length : 0;
}

export default function GeofenceEditorDialog({ open, onOpenChange, initial, vehicles = [], onSave }: GeofenceEditorDialogProps) {
  const { t, locale } = useT();
  const { showError } = useFlash();
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const drawLayerRef = useRef<string | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const vehicleMarkersRef = useRef<maplibregl.Marker[]>([]);
  const [drawMode, setDrawMode] = useState<string | null>(null);
  const [vertices, setVertices] = useState<{ lng: number; lat: number }[]>([]);
  const verticesRef = useRef<{ lng: number; lat: number }[]>([]);
  const [circleRadius, setCircleRadius] = useState<number | null>(null);
  const circleCenterRef = useRef<{ lng: number; lat: number } | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [circleEditing, setCircleEditing] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [osmQuery, setOsmQuery] = useState('');
  const [osmResults, setOsmResults] = useState<Array<{ display_name: string; osm_type: string; osm_id: number }>>([]);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [resultWkt, setResultWkt] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [vehicleSearch, setVehicleSearch] = useState('');
  const isEdit = Boolean(initial);
  const [showWkt, setShowWkt] = useState(false);
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<Set<number>>(new Set());

  const toggleVehicle = useCallback((id: number) => {
    setSelectedVehicleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const vehiclesWithCoords = useMemo(
    () => (vehicles || []).filter((v) => Number.isFinite(v.lat) && Number.isFinite(v.lng) && !(v.lat === 0 && v.lng === 0) && v.lat != null && v.lng != null),
    [vehicles],
  );

  const filteredVehicles = useMemo(() => {
    const q = vehicleSearch.trim().toLowerCase();
    if (!q) return vehiclesWithCoords;
    return vehiclesWithCoords.filter(
      (v) => v.name?.toLowerCase().includes(q) || v.plate?.toLowerCase().includes(q),
    );
  }, [vehiclesWithCoords, vehicleSearch]);

  // Initialize map (only on open/close, NOT on vehicles change)
  useEffect(() => {
    if (!open) return;

    const defaultView = guessDefaultCenter(vehicles);

    const timer = setTimeout(() => {
      if (!mapContainer.current || mapRef.current) return;

      const map = new maplibregl.Map({
        container: mapContainer.current,
        style: TILE_STYLE,
        center: defaultView.center,
        zoom: defaultView.zoom,
      });

      map.addControl(new maplibregl.NavigationControl(), 'top-right');
      mapRef.current = map;

      const resizeObserver = new ResizeObserver(() => {
        try { map.resize(); } catch { /* ignore */ }
      });
      if (mapContainer.current) resizeObserver.observe(mapContainer.current);

      map.on('load', () => {
        map.resize();
        if (!map.getSource('draw-source')) {
          map.addSource('draw-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
          map.addLayer({
            id: 'draw-fill', type: 'fill', source: 'draw-source',
            paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.15 },
          });
          map.addLayer({
            id: 'draw-line', type: 'line', source: 'draw-source',
            paint: { 'line-color': '#2563eb', 'line-width': 2, 'line-opacity': 0.8, 'line-dasharray': [3, 3] },
          });
          drawLayerRef.current = 'draw-source';
        }
        setMapReady(true);
        placeVehicleMarkers(map);
      });

      (map as unknown as Record<string, unknown>)._resizeObserver = resizeObserver;
    }, 200);

    // Try browser geolocation only when creating (not editing)
    if (!isEdit && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (mapRef.current) {
            mapRef.current.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 12 });
          }
        },
        () => { /* user denied */ },
        { timeout: 3000, enableHighAccuracy: false },
      );
    }

    return () => {
      clearTimeout(timer);
      setMapReady(false);
      if (mapRef.current) {
        const m = mapRef.current as unknown as Record<string, unknown>;
        if (m._resizeObserver) (m._resizeObserver as ResizeObserver).disconnect();
        mapRef.current.remove();
        mapRef.current = null;
      }
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      vehicleMarkersRef.current.forEach((m) => m.remove());
      vehicleMarkersRef.current = [];
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Update vehicle markers when vehicles change (without destroying map)
  const placeVehicleMarkers = useCallback((map?: maplibregl.Map | null) => {
    const m = map || mapRef.current;
    if (!m || !m.loaded()) return;
    vehicleMarkersRef.current.forEach((mk) => mk.remove());
    vehicleMarkersRef.current = [];
    vehiclesWithCoords.forEach((v) => {
      const el = document.createElement('div');
      el.className = 'flex items-center justify-center h-6 w-6 rounded-full bg-blue-600/80 border-2 border-white shadow-md cursor-pointer hover:scale-110 transition-transform';
      el.innerHTML = `<span style="font-size:9px;font-weight:700;color:#fff;">${(v.name || '?')[0].toUpperCase()}</span>`;
      el.title = `${v.name} (${v.plate || ''})`;
      el.addEventListener('click', () => {
        m.flyTo({ center: [v.lng, v.lat], zoom: 15 });
      });
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([v.lng, v.lat])
        .addTo(m);
      vehicleMarkersRef.current.push(marker);
    });
  }, [vehiclesWithCoords]);

  useEffect(() => {
    if (!open || !mapRef.current || !mapReady) return;
    placeVehicleMarkers();
  }, [open, mapReady, placeVehicleMarkers]);

  // If editing, load initial geofence data
  useEffect(() => {
    if (!open || !initial?.area || !mapRef.current || !mapReady) return;
    const map = mapRef.current;
    setName(initial.name || '');
    setDescription(initial.description || '');
    setResultWkt(initial.area);

    const geojson = wktToGeoJsonForDisplay(initial.area);
    if (geojson) {
      const src = map.getSource('draw-source') as maplibregl.GeoJSONSource | undefined;
      if (src) {
        src.setData({
          type: 'FeatureCollection',
          features: [{ type: 'Feature', geometry: geojson as GeoJSON.Geometry, properties: {} }],
        });
      }
      // Fit map
      const allRings: number[][] = [];
      if (geojson.type === 'Polygon') {
        (geojson.coordinates as number[][][]).forEach((r) => r.forEach((c) => allRings.push(c)));
      } else if (geojson.type === 'MultiPolygon') {
        (geojson.coordinates as number[][][][]).forEach((poly) => poly.forEach((r) => r.forEach((c) => allRings.push(c))));
      }
      const allPoints = allRings.filter((c) => Number.isFinite(c[0]) && Number.isFinite(c[1]) && !(c[0] === 0 && c[1] === 0));
      if (allPoints.length > 0) {
        try {
          const bounds = allPoints.reduce(
            (b, c) => b.extend(c as [number, number]),
            new maplibregl.LngLatBounds(allPoints[0] as [number, number], allPoints[0] as [number, number]),
          );
          map.fitBounds(bounds, { padding: 60 });
        } catch { /* ignore */ }
      }
    }
  }, [open, initial, mapReady]);

  const clearMarkers = useCallback(() => {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
  }, []);

  const updateDrawLayer = useCallback((geojson: any | null) => {
    if (!mapRef.current) return;
    const src = mapRef.current.getSource('draw-source') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData({
      type: 'FeatureCollection',
      features: geojson ? [{ type: 'Feature', geometry: geojson as GeoJSON.Geometry, properties: {} }] : [],
    });
  }, []);

  // ── OSM Search ──
  const handleOsmSearch = useCallback(async () => {
    if (!osmQuery.trim()) return;
    setSearching(true);
    try {
      const results = await searchOsm(osmQuery, locale);
      setOsmResults(results as Array<{ display_name: string; osm_type: string; osm_id: number }>);
    } catch (err) {
      console.error('OSM search failed:', err);
    } finally {
      setSearching(false);
    }
  }, [osmQuery, locale]);

  const handleOsmSelect = useCallback(async (item: { display_name: string; osm_type: string; osm_id: number }) => {
    setImporting(true);
    try {
      const geojson = await fetchOsmGeometry(item.osm_type, item.osm_id, locale);
      if (!geojson) {
        showError('No boundary data available for this location');
        return;
      }

      const countPoints = (g: any): number => {
        if (g.type === 'Polygon') return (g.coordinates as number[][][])[0]?.length || 0;
        if (g.type === 'MultiPolygon') {
          let n = 0;
          (g.coordinates as number[][][][]).forEach((p) => { p.forEach((r) => { n += r.length; }); });
          return n;
        }
        return 0;
      };
      const rawPoints = countPoints(geojson);
      const tolerance = rawPoints > 800 ? 0.005 : rawPoints > 400 ? 0.002 : rawPoints > 200 ? 0.001 : 0.0005;
      const simplified = simplifyGeoJson(geojson, tolerance);

      let wkt = geojsonToWkt(simplified);
      if (!wkt) {
        showError('Failed to convert boundary to WKT');
        return;
      }

      const MAX_WKT_LEN = 3800;
      if (wkt.length > MAX_WKT_LEN) {
        let aggressiveTolerance = tolerance;
        while (wkt.length > MAX_WKT_LEN && aggressiveTolerance < 0.05) {
          aggressiveTolerance *= 2;
          const reSimplified = simplifyGeoJson(geojson, aggressiveTolerance);
          wkt = geojsonToWkt(reSimplified);
          if (!wkt) break;
        }
        if (!wkt || wkt.length > MAX_WKT_LEN) {
          showError('Boundary too complex — try a smaller area');
          return;
        }
      }

      const displayGeoJson = wktToGeoJsonForDisplay(wkt);
      if (displayGeoJson) updateDrawLayer(displayGeoJson);
      setResultWkt(wkt);

      const shortName = item.display_name?.split(',')[0]?.trim() || item.display_name || '';
      setName((prev) => prev || shortName);

      // Fit map
      if (mapRef.current && displayGeoJson) {
        const allRings: number[][] = [];
        if (displayGeoJson.type === 'Polygon') {
          (displayGeoJson.coordinates as number[][][])[0]?.forEach((c) => allRings.push(c));
        } else if (displayGeoJson.type === 'MultiPolygon') {
          (displayGeoJson.coordinates as number[][][][]).forEach((poly) => poly.forEach((r) => r.forEach((c) => allRings.push(c))));
        }
        if (allRings.length > 0) {
          const bounds = allRings.reduce(
            (b, c) => b.extend(c as [number, number]),
            new maplibregl.LngLatBounds(allRings[0] as [number, number], allRings[0] as [number, number]),
          );
          mapRef.current.fitBounds(bounds, { padding: 40 });
        }
      }

      setOsmResults([]);
      setDrawMode(null);
      setIsDrawing(false);
    } catch (err) {
      showError((err as Error).message || 'Failed to import boundary');
    } finally {
      setImporting(false);
    }
  }, [updateDrawLayer, showError, locale]);

  // ── Drawing ──
  const startDraw = useCallback((mode: string) => {
    setDrawMode(mode);
    setResultWkt('');
    setVertices([]);
    verticesRef.current = [];
    setCircleRadius(null);
    circleCenterRef.current = null;
    setIsDrawing(false);
    updateDrawLayer(null);

    if (mapRef.current && mapRef.current.doubleClickZoom) {
      mapRef.current.doubleClickZoom.disable();
    }

    if (mode === 'circle' || mode === 'polygon' || mode === 'freehand') {
      setIsDrawing(true);
    }
  }, [updateDrawLayer]);

  const stopDrawing = useCallback(() => {
    setDrawMode(null);
    setCircleEditing(false);
    setIsDrawing(false);
    setVertices([]);
    setCircleRadius(null);
    circleCenterRef.current = null;
    if (mapRef.current && mapRef.current.doubleClickZoom) {
      mapRef.current.doubleClickZoom.enable();
    }
  }, []);

  const drawCircleAtVehicle = useCallback((v: VehicleShort) => {
    const map = mapRef.current;
    if (!map) return;

    // Clear any existing drawing state
    clearMarkers();
    setDrawMode(null);
    setCircleEditing(true);
    setIsDrawing(true);
    setVertices([]);
    verticesRef.current = [];
    if (map.doubleClickZoom) map.doubleClickZoom.enable();

    const center = { lng: v.lng, lat: v.lat };
    verticesRef.current = [center];
    circleCenterRef.current = center;
    setVertices([center]);
    setCircleRadius(500);

    // Generate circle WKT and update draw layer
    const wkt = circleToWkt([v.lng, v.lat], 500);
    setResultWkt(wkt);
    setDescription((prev) => prev || `Around ${v.name}`);

    const geojson = wktToGeoJsonForDisplay(wkt);
    if (geojson) {
      const src = map.getSource('draw-source') as maplibregl.GeoJSONSource | undefined;
      if (src) {
        src.setData({
          type: 'FeatureCollection',
          features: [{ type: 'Feature', geometry: geojson as GeoJSON.Geometry, properties: {} }],
        });
      }
    }

    // Place center marker
    const el = document.createElement('div');
    el.className = 'h-3 w-3 rounded-full bg-blue-600 border-2 border-white shadow-md';
    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([v.lng, v.lat])
      .addTo(map);
    markersRef.current.push(marker);

    map.flyTo({ center: [v.lng, v.lat], zoom: 14 });
  }, [clearMarkers]);

  const handleConfirmDrawing = useCallback(() => {
    const map = mapRef.current;
    const verts = verticesRef.current;
    if (!map || verts.length < 3) return;
    const coords = verts.map((v) => [v.lat, v.lng]);
    coords.push([...coords[0]!]);
    const wkt = `POLYGON ((${coords.map((c) => c.join(' ')).join(', ')}))`;
    setResultWkt(wkt);
    const geojson = wktToGeoJsonForDisplay(wkt);
    if (geojson) {
      const src = map.getSource('draw-source') as maplibregl.GeoJSONSource | undefined;
      if (src) {
        src.setData({
          type: 'FeatureCollection',
          features: [{ type: 'Feature', geometry: geojson as GeoJSON.Geometry, properties: {} }],
        });
      }
    }
    setVertices([]);
    verticesRef.current = [];
    setDrawMode(null);
    setIsDrawing(false);
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    if (map.doubleClickZoom) map.doubleClickZoom.enable();
  }, []);

  // Map click handlers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !drawMode) return;

    const syncCircle = (center: { lng: number; lat: number }, radius: number) => {
      if (!center || !radius || radius <= 0) return;
      const wkt = circleToWkt([center.lng, center.lat], radius);
      setResultWkt(wkt);
      const geojson = wktToGeoJsonForDisplay(wkt);
      if (geojson) {
        const src = map.getSource('draw-source') as maplibregl.GeoJSONSource | undefined;
        if (src) {
          src.setData({
            type: 'FeatureCollection',
            features: [{ type: 'Feature', geometry: geojson as GeoJSON.Geometry, properties: {} }],
          });
        }
      }
    };

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      if (drawMode === 'circle') {
        const center = { lng: e.lngLat.lng, lat: e.lngLat.lat };
        verticesRef.current = [center];
        circleCenterRef.current = center;
        syncCircle(center, 500);
        setVertices([center]);
        setCircleRadius(500);
        setIsDrawing(true);
        clearMarkers();
        const el = document.createElement('div');
        el.className = 'h-3 w-3 rounded-full bg-blue-600 border-2 border-white shadow-md';
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([e.lngLat.lng, e.lngLat.lat])
          .addTo(map);
        markersRef.current.push(marker);
      } else if (drawMode === 'polygon') {
        const newVerts = [...vertices, { lng: e.lngLat.lng, lat: e.lngLat.lat }];
        setVertices(newVerts);
        verticesRef.current = newVerts;
        const el = document.createElement('div');
        el.className = 'h-2.5 w-2.5 rounded-full bg-blue-500 border-2 border-white shadow';
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([e.lngLat.lng, e.lngLat.lat])
          .addTo(map);
        markersRef.current.push(marker);
        if (newVerts.length >= 2) {
          const previewCoords = newVerts.map((v) => [v.lng, v.lat]);
          updateDrawLayer({
            type: 'LineString',
            coordinates: previewCoords as [number, number][],
          });
        }
      }
    };

    const handleDblClick = (e: maplibregl.MapMouseEvent & { originalEvent: MouseEvent }) => {
      if (drawMode === 'polygon') {
        e.originalEvent.preventDefault();
      }
    };

    let freehandPoints: [number, number][] = [];

    const handleMouseDown = (e: maplibregl.MapMouseEvent) => {
      if (drawMode === 'freehand') {
        freehandPoints = [[e.lngLat.lat, e.lngLat.lng]];
        map.dragPan.disable();
      }
    };

    const handleMouseMove = (e: maplibregl.MapMouseEvent) => {
      if (drawMode === 'freehand' && freehandPoints.length > 0) {
        freehandPoints.push([e.lngLat.lat, e.lngLat.lng]);
        if (freehandPoints.length > 5) {
          const pts = [...freehandPoints];
          pts.push([...pts[0]!]);
          const wkt = `POLYGON ((${pts.map((c) => c.join(' ')).join(', ')}))`;
          const geojson = wktToGeoJsonForDisplay(wkt);
          if (geojson) updateDrawLayer(geojson);
        }
      }
    };

    const handleMouseUp = () => {
      if (drawMode === 'freehand' && freehandPoints.length > 3) {
        const simplified = simplifyFreehand(freehandPoints);
        simplified.push([...simplified[0]!]);
        const wkt = `POLYGON ((${simplified.map((c) => c.join(' ')).join(', ')}))`;
        setResultWkt(wkt);
        const geojson = wktToGeoJsonForDisplay(wkt);
        if (geojson) updateDrawLayer(geojson);
        freehandPoints = [];
        setDrawMode(null);
        setIsDrawing(false);
        map.dragPan.enable();
        if (map.doubleClickZoom) map.doubleClickZoom.enable();
      } else if (drawMode === 'freehand') {
        freehandPoints = [];
        map.dragPan.enable();
      }
    };

    map.on('click', handleClick);
    map.on('dblclick', handleDblClick);
    map.on('mousedown', handleMouseDown);
    map.on('mousemove', handleMouseMove);
    map.on('mouseup', handleMouseUp);

    return () => {
      map.off('click', handleClick);
      map.off('dblclick', handleDblClick);
      map.off('mousedown', handleMouseDown);
      map.off('mousemove', handleMouseMove);
      map.off('mouseup', handleMouseUp);
      if (map.doubleClickZoom) map.doubleClickZoom.enable();
    };
  }, [drawMode, vertices, updateDrawLayer, clearMarkers]);

  // Circle radius change → redraw
  useEffect(() => {
    if (!circleRadius || circleRadius <= 0) return;
    if (drawMode !== 'circle' && !circleEditing) return;
    if (vertices.length !== 1) return;
    const map = mapRef.current;
    if (!map) return;
    const center = vertices[0]!;
    const wkt = circleToWkt([center.lng, center.lat], circleRadius);
    setResultWkt(wkt);
    const geojson = wktToGeoJsonForDisplay(wkt);
    if (geojson) {
      const src = map.getSource('draw-source') as maplibregl.GeoJSONSource | undefined;
      if (src) {
        src.setData({
          type: 'FeatureCollection',
          features: [{ type: 'Feature', geometry: geojson as GeoJSON.Geometry, properties: {} }],
        });
      }
    }
  }, [circleRadius, drawMode, circleEditing, vertices]);

  // Keep result on map after drawing done
  useEffect(() => {
    if (!resultWkt || drawMode) return;
    const map = mapRef.current;
    if (!map) return;
    const geojson = wktToGeoJsonForDisplay(resultWkt);
    if (!geojson) return;
    const src = map.getSource('draw-source') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: geojson as GeoJSON.Geometry, properties: {} }],
    });
  }, [resultWkt, drawMode]);

  const handleSave = async () => {
    if (!name.trim() || !resultWkt) return;
    const cleanWkt = sanitizeWkt(resultWkt);
    if (!cleanWkt) return;
    if (cleanWkt.length > 4000) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), description: description.trim() || undefined, area: cleanWkt });
      onOpenChange(false);
      resetState();
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const resetState = () => {
    setName('');
    setDescription('');
    setResultWkt('');
    setVertices([]);
    verticesRef.current = [];
    setCircleRadius(null);
    circleCenterRef.current = null;
    setDrawMode(null);
    setCircleEditing(false);
    setIsDrawing(false);
    setOsmQuery('');
    setOsmResults([]);
    clearMarkers();
    updateDrawLayer(null);
  };

  const handleCancel = () => {
    resetState();
    onOpenChange(false);
  };

  const coordsCountVal = resultWkt ? countCoords(resultWkt) : 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleCancel(); else onOpenChange(v); }}>
      <DialogContent className="max-w-6xl !w-[95vw] !p-0 max-h-[90vh] overflow-hidden">
        <div className="flex h-[85vh] flex-col">
          {/* Top header bar */}
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <DialogHeader className="!p-0">
              <DialogTitle>{isEdit ? t('editGeofence') : t('addGeofence')}</DialogTitle>
              <DialogDescription>{t('clickZoneOnMap')}</DialogDescription>
            </DialogHeader>
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* ── Left Panel: Form fields ── */}
            <div className="flex w-[36%] flex-col border-r border-border">
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Name & Description */}
                <div className="space-y-3">
                  <label className="space-y-1 text-sm block">
                    <span className="font-medium">{t('csvName')}</span>
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Geofence name" />
                  </label>
                  <label className="space-y-1 text-sm block">
                    <span className="font-medium">{t('description')}</span>
                    <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('optional')} />
                  </label>
                </div>

                {/* OSM Search */}
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Search className="h-4 w-4" /> OpenStreetMap
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        value={osmQuery}
                        onChange={(e) => setOsmQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleOsmSearch()}
                        placeholder="Search ward, town, city, country…"
                        className="pr-8"
                      />
                      {searching && <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
                    </div>
                    <Button variant="outline" size="sm" onClick={handleOsmSearch} disabled={searching || !osmQuery.trim()}>
                      <Search className="h-4 w-4" />
                    </Button>
                  </div>
                  {osmResults.length > 0 && (
                    <div className="max-h-36 overflow-y-auto rounded-lg border bg-background">
                      {osmResults.map((item, i) => (
                        <button
                          key={`${item.osm_type}-${item.osm_id}-${i}`}
                          type="button"
                          className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs hover:bg-accent transition-colors border-b last:border-0"
                          onClick={() => handleOsmSelect(item)}
                          disabled={importing}
                        >
                          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <div className="font-medium truncate">{item.display_name?.split(',')[0]}</div>
                            <div className="text-muted-foreground truncate">{item.display_name}</div>
                          </div>
                          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                            {item.osm_type}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {importing && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Importing boundary…
                    </div>
                  )}
                </div>

                {/* Vehicle Checkbox List */}
                {vehiclesWithCoords.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <Navigation className="h-4 w-4" /> {t('vehicles')}
                      <span className="text-xs text-muted-foreground font-normal">({selectedVehicleIds.size} selected)</span>
                    </label>
                    <div className="relative">
                      <Input
                        value={vehicleSearch}
                        onChange={(e) => setVehicleSearch(e.target.value)}
                        placeholder={`Search ${vehiclesWithCoords.length} vehicles…`}
                        className="pl-8 h-8"
                      />
                      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    </div>
                    <div className="max-h-48 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                      {(vehicleSearch ? filteredVehicles : vehiclesWithCoords).map((v) => (
                        <label
                          key={v.id}
                          className="flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-accent/50 transition-colors cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedVehicleIds.has(v.id)}
                            onChange={() => toggleVehicle(v.id)}
                            className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary/40"
                          />
                          <button
                            type="button"
                            className="flex flex-1 items-center gap-2 text-left min-w-0"
                            onClick={(e) => {
                              e.preventDefault();
                              if (mapRef.current) {
                                mapRef.current.flyTo({ center: [v.lng, v.lat], zoom: 15 });
                              }
                            }}
                            title="Jump to vehicle on map"
                          >
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                              {(v.name || '?')[0].toUpperCase()}
                            </span>
                            <span className="font-medium truncate">{v.name}</span>
                            {v.plate && <span className="text-muted-foreground shrink-0">· {v.plate}</span>}
                          </button>
                          <button
                            type="button"
                            className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
                            onClick={(e) => { e.preventDefault(); drawCircleAtVehicle(v); }}
                            title="Draw 500m circle around this vehicle"
                          >
                            <Circle className="h-3 w-3 inline" />
                          </button>
                        </label>
                      ))}
                      {vehicleSearch && filteredVehicles.length === 0 && (
                        <p className="px-3 py-4 text-center text-[11px] text-muted-foreground">No vehicles match</p>
                      )}
                    </div>
                    {selectedVehicleIds.size > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {vehiclesWithCoords.filter((v) => selectedVehicleIds.has(v.id)).map((v) => (
                          <span key={v.id} className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                            {v.name}
                            <button type="button" onClick={() => toggleVehicle(v.id)} className="hover:text-destructive">&times;</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Drawing Tools (compact) */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{t('chooseArea')}</span>
                    <div className="flex gap-0.5">
                      {DRAW_MODES.map(({ key, icon: Icon, labelKey }) => (
                        <Button
                          key={key}
                          variant={drawMode === key ? 'default' : 'outline'}
                          size="sm"
                          type="button"
                          onClick={() => startDraw(key)}
                          disabled={drawMode === key || isDrawing}
                          title={key === 'polygon' ? 'Draw polygon — click points on map' : key === 'circle' ? 'Draw circle — click center on map' : 'Freehand draw — click & drag on map'}
                        >
                          <Icon className="h-4 w-4" />
                        </Button>
                      ))}
                      {drawMode === 'polygon' && vertices.length >= 3 && (
                        <Button variant="default" size="sm" type="button" onClick={handleConfirmDrawing}>OK</Button>
                      )}
                      {(drawMode === 'circle' || circleEditing) && circleRadius != null && circleRadius > 0 && (
                        <Button variant="default" size="sm" type="button" onClick={() => {
                          setDrawMode(null); setCircleEditing(false); setIsDrawing(false);
                          setVertices([]); verticesRef.current = []; circleCenterRef.current = null;
                          clearMarkers();
                          if (mapRef.current?.doubleClickZoom) mapRef.current.doubleClickZoom.enable();
                        }}>OK</Button>
                      )}
                      {(drawMode || resultWkt) && (
                        <Button variant="ghost" size="sm" type="button" onClick={stopDrawing} title={t('cancel')}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {(drawMode || circleEditing) && (
                    <p className="text-[11px] text-muted-foreground">
                      {(drawMode === 'circle' || circleEditing) && (vertices.length === 0 ? 'Click map to set center' : `${(circleRadius || 500).toLocaleString()}m radius`)}
                      {drawMode === 'polygon' && `Click map to add points · OK to finish (${vertices.length} pts)`}
                      {drawMode === 'freehand' && 'Click & drag on map to draw'}
                    </p>
                  )}
                  {!drawMode && !circleEditing && resultWkt && (
                    <p className="text-[11px] text-muted-foreground">
                      {coordsCountVal} pts · <button type="button" className="text-primary underline" onClick={() => startDraw('polygon')}>{t('edit')}</button>
                    </p>
                  )}

                  {/* Circle radius fine-tune */}
                  {(drawMode === 'circle' || circleEditing) && vertices.length === 1 && (
                    <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Radius:</span>
                        <input type="range" min={10} max={10000} step={10}
                          value={circleRadius ?? 500}
                          onChange={(e) => setCircleRadius(parseInt(e.target.value, 10))}
                          className="flex-1 h-1.5 cursor-pointer accent-primary" />
                        <input type="number" min={1} max={1000000}
                          value={circleRadius ?? ''}
                          onChange={(e) => { const v = parseInt(e.target.value, 10); if (v > 0) setCircleRadius(v); }}
                          className="w-20 rounded-md border bg-background px-2 py-1 text-sm text-right font-mono outline-none focus:ring-2 focus:ring-primary" />
                        <span className="text-xs text-muted-foreground">m</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {[50, 100, 200, 500, 1000, 2000, 5000, 10000].map((preset) => (
                          <button key={preset} type="button"
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${circleRadius === preset ? 'bg-primary text-primary-foreground' : 'bg-background border hover:bg-accent'}`}
                            onClick={() => setCircleRadius(preset)}>
                            {preset >= 1000 ? `${preset / 1000}km` : `${preset}m`}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Collapsible WKT */}
                {resultWkt && (
                  <div className="rounded-lg border bg-muted/30">
                    <button type="button" onClick={() => setShowWkt((v) => !v)}
                      className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                      <span className="flex items-center gap-2">
                        <code className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">WKT</code>
                        {coordsCountVal} pts · {resultWkt.length} chars
                      </span>
                      <svg className={`h-3 w-3 transition-transform ${showWkt ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                    </button>
                    {showWkt && (
                      <div className="border-t border-border px-3 py-2">
                        <code className="block max-h-32 overflow-y-auto text-[11px] font-mono text-muted-foreground break-all leading-relaxed">
                          {resultWkt}
                        </code>
                        {resultWkt.length > 3500 && <p className="mt-1 text-[10px] text-destructive font-medium">⚠ Too many characters — may exceed database limit</p>}
                        {coordsCountVal > 100 && resultWkt.length < 3500 && <p className="mt-1 text-[10px] text-amber-600 font-medium">⚠ {coordsCountVal} points — consider simplifying</p>}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer buttons */}
              <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
                <Button variant="outline" size="sm" onClick={handleCancel} disabled={saving}>{t('cancel')}</Button>
                <Button size="sm" onClick={handleSave} disabled={saving || !name.trim() || !resultWkt}>
                  {saving ? t('saving') : isEdit ? t('save') : t('addGeofence')}
                </Button>
              </div>
            </div>

            {/* ── Right Panel: Map ── */}
            <div className="relative flex w-[64%] flex-col">
              <div ref={mapContainer} className="flex-1 min-h-0" />
              {/* Drawing mode hint overlay */}
              {drawMode && (
                <div className="pointer-events-none absolute left-3 top-3 z-20 rounded-md bg-card/90 px-2.5 py-1.5 text-[11px] font-medium text-foreground shadow-sm backdrop-blur">
                  {drawMode === 'polygon' && '✏️ Click to add polygon points'}
                  {drawMode === 'circle' && '📍 Click map to set circle center'}
                  {drawMode === 'freehand' && '✏️ Click & drag to freehand draw'}
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
