import { useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';

function haversineKm(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Hook for managing map measurement (ruler) state.
 * Tracks measurement points, marker line, and cumulative distance.
 */
export function useMapMeasurement() {
  const measureLineRef = useRef<maplibregl.Marker[]>([]);
  const measurePointsRef = useRef<{ lng: number; lat: number }[]>([]);
  const measureTotalKmRef = useRef(0);

  const clearMeasurement = useCallback(() => {
    measureLineRef.current.forEach((m) => m.remove());
    measureLineRef.current = [];
    measurePointsRef.current = [];
    measureTotalKmRef.current = 0;
  }, []);

  const addMeasurementPoint = useCallback((map: maplibregl.Map, lng: number, lat: number) => {
    const el = document.createElement('div');
    el.className = 'flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-white shadow-md';
    el.textContent = String(measurePointsRef.current.length + 1);

    const marker = new maplibregl.Marker({ element: el, draggable: false })
      .setLngLat([lng, lat])
      .addTo(map);
    measureLineRef.current.push(marker);

    // Update total distance
    const prev = measurePointsRef.current[measurePointsRef.current.length - 1];
    if (prev) {
      measureTotalKmRef.current += haversineKm(prev.lng, prev.lat, lng, lat);
    }
    measurePointsRef.current.push({ lng, lat });
  }, []);

  return {
    measureLineRef,
    measurePointsRef,
    measureTotalKmRef,
    clearMeasurement,
    addMeasurementPoint,
  };
}
