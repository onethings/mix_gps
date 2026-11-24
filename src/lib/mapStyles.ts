import type { StyleSpecification } from 'maplibre-gl';

export type MapStyleId = string;

export interface MapStyleDef {
  id: MapStyleId;
  /** i18n key; languages without a translation fall back to `label` */
  labelKey: string;
  label: string;
  icon: 'map' | 'satellite' | 'globe' | 'mountain';
  /** Raster tile templates. Omitted for the vector road style. */
  tiles?: string[];
  minZoom?: number;
  maxZoom?: number;
  attribution?: string;
}

const ROAD_STYLE_URL = '/custom/liberty.json';

const ROAD_STYLE_DEF: MapStyleDef = {
  id: 'road',
  labelKey: 'mapStyleRoad',
  label: 'Map',
  icon: 'map',
};

export const MAP_STYLES: MapStyleDef[] = [
  ROAD_STYLE_DEF,
  {
    id: 'satellite',
    labelKey: 'mapStyleSatellite',
    label: 'Satellite',
    icon: 'satellite',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    maxZoom: 22,
    attribution: '© Esri',
  },
  {
    id: 'hybrid',
    labelKey: 'mapStyleHybrid',
    label: 'Satellite Hybrid',
    icon: 'globe',
    tiles: [0, 1, 2, 3].map((i) => `https://mt${i}.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}&s=Ga`),
    maxZoom: 21,
    attribution: '© Google',
  },
  {
    id: 'street',
    labelKey: 'mapStyleStreet',
    label: 'Streets',
    icon: 'map',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'],
    maxZoom: 20,
    attribution: '© Esri',
  },
  {
    id: 'topo',
    labelKey: 'mapStyleTopo',
    label: 'Terrain',
    icon: 'mountain',
    tiles: ['a', 'b', 'c'].map((h) => `https://${h}.tile.opentopomap.org/{z}/{x}/{y}.png`),
    maxZoom: 17,
    attribution: '© OpenTopoMap',
  },
  {
    id: 'osm',
    labelKey: 'mapStyleOsm',
    label: 'OpenStreetMap',
    icon: 'globe',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors',
  },
];

export const DEFAULT_MAP_STYLE_ID: MapStyleId = 'road';

export function rasterStyle(
  tiles: string[],
  options: { minZoom?: number; maxZoom?: number; attribution?: string } = {},
): StyleSpecification {
  return {
    version: 8,
    sources: {
      raster: {
        type: 'raster',
        tiles,
        tileSize: 256,
        ...(options.minZoom != null ? { minzoom: options.minZoom } : {}),
        ...(options.maxZoom != null ? { maxzoom: options.maxZoom } : {}),
        ...(options.attribution ? { attribution: options.attribution } : {}),
      },
    },
    layers: [{ id: 'raster', type: 'raster', source: 'raster' }],
  } as StyleSpecification;
}

export function getMapStyleDef(id: MapStyleId): MapStyleDef {
  return MAP_STYLES.find((s) => s.id === id) ?? ROAD_STYLE_DEF;
}

export function resolveMapStyle(id: MapStyleId): string | StyleSpecification {
  const def = getMapStyleDef(id);
  if (!def.tiles) return ROAD_STYLE_URL;
  return rasterStyle(def.tiles, { minZoom: def.minZoom, maxZoom: def.maxZoom, attribution: def.attribution });
}
