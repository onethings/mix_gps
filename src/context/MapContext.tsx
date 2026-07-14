import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';

interface MapContextValue {
  /** Currently selected vehicle ID (shared across all map-aware pages) */
  selectedVehicleId: number | null;
  setSelectedVehicleId: (id: number | null) => void;
  /** Ref to the global FleetMapLibre handle for calling fitAllVehicles etc. */
  mapHandleRef: React.MutableRefObject<{
    fitAllVehicles: () => void;
    clearMeasurement: () => void;
    _measureTotalKm?: number;
  } | null>;
}

const MapContext = createContext<MapContextValue | null>(null);

export function MapProvider({ children }: { children: ReactNode }) {
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const mapHandleRef = useRef<{ fitAllVehicles: () => void; clearMeasurement: () => void } | null>(null);

  const handleSetSelected = useCallback((id: number | null) => {
    setSelectedVehicleId(id);
  }, []);

  return (
    <MapContext.Provider value={{ selectedVehicleId, setSelectedVehicleId: handleSetSelected, mapHandleRef }}>
      {children}
    </MapContext.Provider>
  );
}

export function useMapContext(): MapContextValue {
  const ctx = useContext(MapContext);
  if (!ctx) throw new Error('useMapContext must be used within MapProvider');
  return ctx;
}
