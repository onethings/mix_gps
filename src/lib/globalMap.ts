import type maplibregl from 'maplibre-gl';

let currentMap: maplibregl.Map | null = null;

export function setGlobalMap(map: maplibregl.Map | null) {
  currentMap = map;
}

export function getGlobalMap(): maplibregl.Map | null {
  return currentMap;
}
