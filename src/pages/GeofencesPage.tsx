import { useState, useCallback, useRef, useEffect } from 'react';
import { useT } from '@/lib/i18n';
import { api } from '@/lib/api';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  Fence, Plus, Map as MapIcon, Edit3, Trash2, Search,
} from 'lucide-react';
import PageHeader from '@/components/common/PageHeader';
import EmptyState from '@/components/common/EmptyState';
import LoadingScreen from '@/components/common/LoadingScreen';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import GeofenceEditorDialog from '@/components/geofences/GeofenceEditorDialog';
import { useListFetch } from '@/hooks/useListFetch';
import { useLiveData } from '@/context/LiveDataContext';
import { cn, formatDate, wktPolygonAreaKm2 } from '@/lib/utils';
import type { TraccarGeofence } from '@/types';

const STYLE_ROAD = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

/* ── WKT parser ── */
function wktToGeoJson(wkt) {
  if (!wkt || typeof wkt !== 'string') return null;
  const trimmed = wkt.trim();

  // Traccar WKT: POLYGON((lat lng, lat lng, ...))
  const polyMatch = trimmed.match(/^POLYGON\s*\(\(([^)]+)\)\)\s*$/i);
  if (polyMatch) {
    const coords = polyMatch[1].split(',').map((pt) => {
      const [a, b] = pt.trim().split(/\s+/).map(Number);
      // Traccar WKT: [lat, lng] → convert to GeoJSON [lng, lat]
      if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180) return [b, a];
      // Standard WKT [lng, lat] → also convert to GeoJSON [lng, lat]
      if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 180 && Math.abs(b) <= 90) return [a, b];
      return [b, a];
    });
    // Close the ring if not already
    if (coords.length > 0) {
      const first = coords[0];
      const last = coords[coords.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        coords.push([...first]);
      }
    }
    return {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [coords] },
    };
  }

  // GEOMETRYCOLLECTION
  const gcMatch = trimmed.match(/^GEOMETRYCOLLECTION\s*\((.+)\)\s*$/i);
  if (gcMatch) {
    const inner = gcMatch[1];
    const geoms = [];
    let remaining = inner;
    const geomTypes = ['POLYGON', 'CIRCLE', 'LINESTRING', 'POINT'];
    while (remaining.trim().length > 0) {
      let matched = false;
      for (const t of geomTypes) {
        const re = new RegExp(`^${t}\\s*\\(`, 'i');
        if (re.test(remaining.trim())) {
          let depth = 0;
          let end = -1;
          for (let i = 0; i < remaining.length; i++) {
            if (remaining[i] === '(') depth++;
            if (remaining[i] === ')') {
              depth--;
              if (depth === 0) { end = i + 1; break; }
            }
          }
          if (end > 0) {
            const part = remaining.slice(0, end).trim();
            const parsed = wktToGeoJson(part);
            if (parsed) geoms.push(parsed.geometry);
            remaining = remaining.slice(end).replace(/^,\s*/, '');
            matched = true;
            break;
          }
        }
      }
      if (!matched) break;
    }
    if (geoms.length === 0) return null;
    return {
      type: 'Feature',
      geometry: { type: 'GeometryCollection', geometries: geoms },
    };
  }

  return null;
}

function geofenceToFeature(g, index) {
  const feature = wktToGeoJson(g.area);
  if (!feature) return null;
  return {
    ...feature,
    id: g.id || index,
    properties: {
      id: g.id,
      name: g.name || `Geofence #${g.id}`,
      description: g.description || '',
      color: g.attributes?.color || '#3b82f6',
    },
  };
}

/* ── Color palette for zones ── */
const COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
];

/* ── Helper: fit map to an array of GeoJSON features ── */
function fitMapToFeatures(map, features, padding, maxZoom) {
  try {
    const bounds = new maplibregl.LngLatBounds();
    let hasExtents = false;
    features.forEach((f) => {
      try {
        const coords = [];
        if (f.geometry.type === 'Polygon') {
          coords.push(...f.geometry.coordinates[0]);
        } else if (f.geometry.type === 'GeometryCollection') {
          f.geometry.geometries.forEach((g) => {
            if (g.type === 'Polygon') coords.push(...g.coordinates[0]);
          });
        }
        coords.forEach((c) => {
          if (
            Array.isArray(c) && c.length === 2 &&
            Number.isFinite(c[0]) && Number.isFinite(c[1]) &&
            Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90 &&
            !(c[0] === 0 && c[1] === 0)
          ) {
            bounds.extend(c as [number, number]);
            hasExtents = true;
          }
        });
      } catch { /* skip invalid feature */ }
    });
    if (hasExtents) {
      map.fitBounds(bounds, { padding, maxZoom });
    }
  } catch { /* ignore invalid bounds */ }
}

/* ── Map component ── */
function GeofenceMap({ geofences, selectedId, onSelect }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || initializedRef.current) return;
    initializedRef.current = true;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_ROAD,
      center: [78.9629, 20.5937], // India center as fallback
      zoom: 4,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    mapRef.current = map;

    return () => {
      map.remove();
      initializedRef.current = false;
    };
  }, []);

  // Render geofence layers + handle selection highlight + fly-to
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onLoad = () => {
      const srcId = 'geofences-source';
      const fillId = 'geofences-fill';
      const lineId = 'geofences-line';

      const features = (geofences || [])
        .map((g, i) => geofenceToFeature(g, i))
        .filter(Boolean);

      // Tag each feature with selected status so we can style via expression
      features.forEach((f) => {
        f.properties.selected = f.properties.id != null && f.properties.id === selectedId;
      });

      const geojson = { type: 'FeatureCollection', features };

      // Fit bounds to all features on first load (no selection yet)
      if (features.length > 0 && selectedId == null) {
        fitMapToFeatures(map, features, 60, 15);
      }

      // Remove old layers/source
      [fillId, fillId + '-sel', lineId, lineId + '-sel'].forEach((id) => {
        if (map.getLayer(id)) map.removeLayer(id);
      });
      if (map.getSource(srcId)) map.removeSource(srcId);

      if (features.length === 0) return;

      map.addSource(srcId, { type: 'geojson', data: geojson });

      // Base fill (all features, but selected ones render with higher opacity via paint)
      map.addLayer({
        id: fillId,
        type: 'fill',
        source: srcId,
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': [
            'case',
            ['boolean', ['get', 'selected'], false],
            0.35,
            0.15,
          ],
        },
      });

      // Base line (all features)
      map.addLayer({
        id: lineId,
        type: 'line',
        source: srcId,
        paint: {
          'line-color': ['get', 'color'],
          'line-width': [
            'case',
            ['boolean', ['get', 'selected'], false],
            4,
            2,
          ],
          'line-opacity': 0.8,
        },
      });

      // Click handler on fill layer (catches clicks anywhere on the zone)
      const onClick = (e) => {
        const feature = map.queryRenderedFeatures(e.point, { layers: [fillId] });
        if (feature.length > 0) {
          const id = feature[0].properties?.id;
          if (id != null) onSelect?.(id);
        }
      };
      map.on('click', fillId, onClick);

      // ── Fly to selected geofence (if any) ──
      if (selectedId != null) {
        const g = (geofences || []).find((x) => x.id === selectedId);
        if (g?.area) {
          const fit = wktToGeoJson(g.area);
          if (fit) {
            try {
              const allCoords = [];
              const extract = (geom) => {
                if (geom.type === 'Polygon') allCoords.push(...geom.coordinates[0]);
                else if (geom.type === 'MultiPolygon')
                  geom.coordinates.forEach((p) => allCoords.push(...p[0]));
                else if (geom.type === 'GeometryCollection')
                  geom.geometries.forEach(extract);
              };
              extract(fit.geometry);
              const valid = allCoords.filter(
                (c) => Array.isArray(c) && c.length === 2 &&
                  Number.isFinite(c[0]) && Number.isFinite(c[1]) &&
                  Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90 &&
                  !(c[0] === 0 && c[1] === 0),
              );
              if (valid.length > 0) {
                const bounds = valid.reduce(
                  (b, c) => b.extend(c),
                  new maplibregl.LngLatBounds(valid[0], valid[0]),
                );
                map.fitBounds(bounds, { padding: 20, maxZoom: 20 });
              }
            } catch { /* ignore invalid bounds */ }
          }
        }
      }

      return () => {
        try { map.off('click', fillId, onClick); } catch { /* ignore */ }
      };
    };

    if (map.loaded()) {
      onLoad();
    } else {
      map.once('load', onLoad);
    }
  }, [geofences, onSelect, selectedId]);

  return (
    <div
      ref={containerRef}
      className="h-[400px] w-full overflow-hidden rounded-xl border border-border"
    />
  );
}

export default function GeofencesPage() {
  const { t } = useT();
  const { data: geofences, loading, error, reload } = useListFetch<TraccarGeofence[]>(
    () => api.geofences.list() as Promise<TraccarGeofence[]>,
    [],
  );
  const { vehicles } = useLiveData();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [showMap, setShowMap] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editGeofence, setEditGeofence] = useState<TraccarGeofence | null>(null);

  const filtered = (geofences || []).filter((g) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (g.name || '').toLowerCase().includes(q) || (g.description || '').toLowerCase().includes(q);
  });

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.geofences.remove(deleteTarget.id);
      setDeleteTarget(null);
      reload();
    } catch (err) {
      console.error('Delete geofence failed', err);
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget]);

  const handleSelectFence = useCallback((id) => {
    setSelectedId((prev) => (prev === id ? null : id));
  }, []);

  const handleSaveGeofence = useCallback(async (data: { name: string; description?: string; area: string }) => {
    await api.geofences.create(data);
    reload();
  }, [reload]);

  if (loading) return <LoadingScreen />;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={t('geofences')}
        description={t('geofencesMapDesc') + ' — ' + t('clickZoneOnMap')}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowMap((v) => !v)}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            <MapIcon className="h-4 w-4" />
            {showMap ? t('hideMap') : t('showMap')}
          </button>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            {t('addGeofence')}
          </button>
        </div>
      </PageHeader>

      {/* Map */}
      {showMap && (
        <div className="space-y-2">
          <GeofenceMap
            geofences={filtered}
            selectedId={selectedId}
            onSelect={handleSelectFence}
          />
          <p className="text-xs text-muted-foreground">
            <MapIcon className="mr-1 inline h-3 w-3" />
            {t('clickZoneOnMap')}
          </p>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchGeofences')}
          className="w-full rounded-lg border border-border bg-background py-2 pl-10 pr-4 text-sm outline-none ring-offset-background transition-colors placeholder:text-muted-foreground focus:ring-2 focus:ring-primary"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
          {t('failedLoadGeofences')}: {(error as any)?.message || error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <EmptyState icon={Fence} title={t('noGeofences')} description={t('noGeofencesMsg')} />
      )}

      {/* Geofence cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((g, i) => {
          const isSelected = selectedId === g.id;
          const color = (g.attributes?.color as string) || COLORS[i % COLORS.length];
          const areaKm2 = wktPolygonAreaKm2(g.area);
          return (
            <div
              key={g.id}
              className={cn(
                'group cursor-pointer rounded-xl border bg-card p-5 shadow-sm transition-all hover:shadow-md',
                isSelected ? 'border-primary ring-1 ring-primary' : 'border-border',
              )}
              onClick={() => handleSelectFence(g.id)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ backgroundColor: `${color}20` }}>
                    <Fence className="h-5 w-5" style={{ color: color }} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">{g.name || `Geofence #${g.id}`}</h3>
                    {g.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{g.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setEditGeofence(g); }}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent"
                    title={t('editTooltip')}
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(g); }}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title={t('deleteTooltip')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="mt-4 space-y-1.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color as string }} />
                  <span className="font-medium text-foreground">{g.name || `Zone #${g.id}`}</span>
                </div>
                {g.calendarId && (
                  <div className="flex justify-between">
                    <span>{t('calendar')}</span>
                    <span className="text-foreground">#{g.calendarId}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>{t('zoneType')}</span>
                  <span className="font-mono text-foreground">
                    {g.area?.startsWith('POLYGON') ? t('polygon') :
                     g.area?.startsWith('CIRCLE') ? t('circleGeofence') :
                     g.area?.startsWith('LINESTRING') ? t('lineGeofence') : '—'}
                  </span>
                </div>
                {areaKm2 != null && (
                  <div className="flex justify-between">
                    <span>Area</span>
                    <span className="font-mono text-foreground tabular-nums">
                      {areaKm2 >= 1000 ? `${(areaKm2 / 1000).toFixed(1)}k km²` : `${areaKm2.toFixed(1)} km²`}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={() => setDeleteTarget(null)}
          title={t('deleteGeofenceTitle')}
          description={`${t('deleteGeofenceMsg')} "${deleteTarget.name || `Geofence #${deleteTarget.id}`}"?`}
          confirmLabel={t('delete')}
          onConfirm={handleDelete}
          destructive
        />
      )}

      <GeofenceEditorDialog
        open={dialogOpen || !!editGeofence}
        onOpenChange={(open) => { if (!open) { setDialogOpen(false); setEditGeofence(null); } }}
        initial={editGeofence ? { name: editGeofence.name, description: editGeofence.description, area: editGeofence.area } : null}
        vehicles={(vehicles || []).map((v: any) => ({
          id: v.id,
          name: v.name,
          lat: v.lat ?? 0,
          lng: v.lng ?? 0,
          plate: v.plate || v.uniqueId,
          status: v.status,
        }))}
        onSave={editGeofence ? async (data) => { await api.geofences.update(editGeofence.id, data); reload(); setEditGeofence(null); } : handleSaveGeofence}
      />
    </div>
  );
}
