import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";

export interface MapInset {
  left?: number;
  bottom?: number;
}

interface MapContextValue {
  selectedVehicleId: number | null;
  setSelectedVehicleId: (id: number | null) => void;
  popupDismissed: boolean | undefined;
  setPopupDismissed: (dismissed: boolean) => void;
  mapInset: MapInset;
  setMapInset: (inset: MapInset) => void;
  mapHandleRef: React.MutableRefObject<{
    fitAllVehicles: () => void;
    clearMeasurement: () => void;
    flyToVehicle: (lat: number, lng: number, zoom?: number) => void;
    _measureTotalKm?: number;
  } | null>;
}

const MapContext = createContext<MapContextValue | null>(null);

export function MapProvider({ children }: { children: ReactNode }) {
  const [mapInset, setMapInset] = useState<MapInset>({});
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(
    null,
  );
  const [popupDismissed, setPopupDismissed] = useState<boolean | undefined>(
    undefined,
  );
  const mapHandleRef = useRef<{
    fitAllVehicles: () => void;
    clearMeasurement: () => void;
    flyToVehicle: (lat: number, lng: number, zoom?: number) => void;
  } | null>(null);

  const handleSetSelected = useCallback((id: number | null) => {
    setSelectedVehicleId(id);
  }, []);

  return (
    <MapContext.Provider
      value={{
        selectedVehicleId,
        setSelectedVehicleId: handleSetSelected,
        popupDismissed,
        setPopupDismissed,
        mapInset,
        setMapInset,
        mapHandleRef,
      }}
    >
      {children}
    </MapContext.Provider>
  );
}

export function useMapContext(): MapContextValue {
  const ctx = useContext(MapContext);
  if (!ctx) throw new Error("useMapContext must be used within MapProvider");
  return ctx;
}
