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
  return { center: [121.5, 25.05] as [number, number], zoom: 10 };
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
  const { t } = useT();
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

  // Initialize map
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
        // Place vehicle markers
        vehicleMarkersRef.current.forEach((m) => m.remove());
        vehicleMarkersRef.current = [];
        vehiclesWithCoords.forEach((v) => {
          const el = document.createElement('div');
          el.className = 'flex items-center justify-center h-6 w-6 rounded-full bg-blue-600/80 border-2 border-white shadow-md cursor-pointer hover:scale-110 transition-transform';
          el.innerHTML = `<span style="font-size:9px;font-weight:700;color:#fff;">${(v.name || '?')[0].toUpperCase()}</span>`;
          el.title = `${v.name} (${v.plate || ''})`;
          el.addEventListener('click', () => {
            map.flyTo({ center: [v.lng, v.lat], zoom: 15 });
          });
          const marker = new maplibregl.Marker({ element: el })
            .setLngLat([v.lng, v.lat])
            .addTo(map);
          vehicleMarkersRef.current.push(marker);
        });
      });

      (map as unknown as Record<string, unknown>)._resizeObserver = resizeObserver;
    }, 200);

    // Try browser geolocation
    if ('geolocation' in navigator) {
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
  }, [open, vehiclesWithCoords]);

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
      const results = await searchOsm(osmQuery);
      setOsmResults(results as Array<{ display_name: string; osm_type: string; osm_id: number }>);
    } catch (err) {
      console.error('OSM search failed:', err);
    } finally {
      setSearching(false);
    }
  }, [osmQuery]);

  const handleOsmSelect = useCallback(async (item: { display_name: string; osm_type: string; osm_id: number }) => {
    setImporting(true);
    try {
      const geojson = await fetchOsmGeometry(item.osm_type, item.osm_id);
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
  }, [updateDrawLayer, showError]);

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
    setIsDrawing(false);
    setVertices([]);
    setCircleRadius(null);
    circleCenterRef.current = null;
    if (mapRef.current && mapRef.current.doubleClickZoom) {
      mapRef.current.doubleClickZoom.enable();
    }
  }, []);

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
    if (drawMode !== 'circle' || vertices.length !== 1 || !circleRadius || circleRadius <= 0) return;
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
  }, [circleRadius, drawMode, vertices]);

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
      <DialogContent className="max-w-4xl !w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('editGeofence') : t('addGeofence')}</DialogTitle>
          <DialogDescription>{t('clickZoneOnMap')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name & Description */}
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-sm">
              <span className="font-medium">{t('csvName')}</span>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Geofence name" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">{t('description')}</span>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('optional')} />
            </label>
          </div>

          {/* OSM Search */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Search className="h-4 w-4" /> {t('search')} OpenStreetMap
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
              <div className="max-h-40 overflow-y-auto rounded-lg border bg-background">
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

          {/* Vehicle Jump-to */}
          {vehiclesWithCoords.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Navigation className="h-4 w-4" /> {t('vehicles')}
              </label>
              <div className="relative">
                <Input
                  value={vehicleSearch}
                  onChange={(e) => setVehicleSearch(e.target.value)}
                  placeholder={`Search ${vehiclesWithCoords.length} vehicles…`}
                  className="pr-8"
                />
                <Navigation className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
              {vehicleSearch && filteredVehicles.length > 0 && (
                <div className="max-h-32 overflow-y-auto rounded-lg border bg-background">
                  {filteredVehicles.slice(0, 10).map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent transition-colors border-b last:border-0"
                      onClick={() => {
                        if (mapRef.current) {
                          mapRef.current.flyTo({ center: [v.lng, v.lat], zoom: 15 });
                        }
                        setVehicleSearch('');
                      }}
                    >
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                        {(v.name || '?')[0].toUpperCase()}
                      </span>
                      <span className="font-medium">{v.name}</span>
                      {v.plate && <span className="text-muted-foreground">· {v.plate}</span>}
                      <span className="ml-auto text-muted-foreground">{v.status}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {vehiclesWithCoords.slice(0, 20).map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                    onClick={() => {
                      if (mapRef.current) mapRef.current.flyTo({ center: [v.lng, v.lat], zoom: 15 });
                    }}
                    title={`${v.name} · ${v.lat?.toFixed(4)}, ${v.lng?.toFixed(4)}`}
                  >
                    {(v.name || '?').slice(0, 8)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Drawing Tools */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{t('chooseArea')}</span>
              <div className="flex gap-1">
                {DRAW_MODES.map(({ key, icon: Icon, labelKey }) => (
                  <Button
                    key={key}
                    variant={drawMode === key ? 'default' : 'outline'}
                    size="sm"
                    type="button"
                    onClick={() => startDraw(key)}
                    disabled={drawMode === key || isDrawing}
                    title={t(labelKey)}
                  >
                    <Icon className="h-4 w-4" />
                  </Button>
                ))}
                {drawMode === 'polygon' && vertices.length >= 3 && (
                  <Button variant="default" size="sm" type="button" onClick={handleConfirmDrawing}>
                    OK
                  </Button>
                )}
                {drawMode === 'circle' && circleRadius != null && circleRadius > 0 && (
                  <Button variant="default" size="sm" type="button" onClick={() => {
                    setDrawMode(null);
                    setIsDrawing(false);
                    setVertices([]);
                    verticesRef.current = [];
                    circleCenterRef.current = null;
                    clearMarkers();
                    if (mapRef.current?.doubleClickZoom) mapRef.current.doubleClickZoom.enable();
                  }}>
                    OK
                  </Button>
                )}
                {(drawMode || resultWkt) && (
                  <Button variant="ghost" size="sm" type="button" onClick={stopDrawing} title={t('cancel')}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
              {drawMode && (
                <span className="text-xs text-muted-foreground">
                  {drawMode === 'circle' && (vertices.length === 0 ? 'Click map to set center' : `${(circleRadius || 500).toLocaleString()}m radius — adjust below or click map to re-center`)}
                  {drawMode === 'polygon' && `Click to add points · OK to finish (${vertices.length} pts)`}
                  {drawMode === 'freehand' && 'Click & drag to draw'}
                </span>
              )}
              {!drawMode && resultWkt && (
                <span className="text-xs text-muted-foreground">
                  {coordsCountVal} pts · <button type="button" className="text-primary underline" onClick={() => startDraw('polygon')}>{t('edit')}</button>
                </span>
              )}
            </div>

            {/* Circle radius fine-tune input */}
            {drawMode === 'circle' && vertices.length === 1 && (
              <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2">
                <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">Radius (meters):</span>
                <input
                  type="number"
                  min={1}
                  max={1000000}
                  step={1}
                  value={circleRadius ?? ''}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (v > 0) setCircleRadius(v);
                  }}
                  placeholder="e.g. 500"
                  className="w-28 rounded-md border bg-background px-2 py-1 text-sm text-right font-mono outline-none focus:ring-2 focus:ring-primary"
                />
                <span className="text-xs text-muted-foreground">m</span>
                <div className="flex-1" />
                {[100, 500, 1000, 5000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                      circleRadius === preset
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background border hover:bg-accent'
                    }`}
                    onClick={() => setCircleRadius(preset)}
                  >
                    {preset >= 1000 ? `${preset / 1000}km` : `${preset}m`}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Map */}
          <div ref={mapContainer} className="h-[400px] w-full rounded-lg border overflow-hidden" />

          {/* Result */}
          {resultWkt && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  WKT · {coordsCountVal} coordinate{coordsCountVal !== 1 ? 's' : ''} · {resultWkt.length} chars
                </span>
                {resultWkt.length > 3500 && (
                  <span className="text-xs text-destructive font-medium">
                    ⚠ Too many characters — may exceed database limit
                  </span>
                )}
                {coordsCountVal > 100 && resultWkt.length < 3500 && (
                  <span className="text-xs text-amber-600 font-medium">
                    ⚠ {coordsCountVal} points — consider simplifying
                  </span>
                )}
              </div>
              <code className="block max-h-20 overflow-y-auto text-[11px] font-mono text-muted-foreground break-all">
                {resultWkt}
              </code>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleCancel} disabled={saving}>{t('cancel')}</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim() || !resultWkt}>
            {saving ? t('saving') : isEdit ? t('save') : t('addGeofence')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
