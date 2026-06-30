import { useMemo } from 'react';
import { MapPin } from 'lucide-react';
import FleetMapLibre from '@/components/tracking/FleetMapLibre';
import type { Vehicle } from '@/types';

function validLatLng(lat: number | null | undefined, lng: number | null | undefined): boolean {
  if (lat == null || lng == null) return false;
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
  if (la === 0 && ln === 0) return false;
  return la >= -90 && la <= 90 && ln >= -180 && ln <= 180;
}

interface MiniMapProps {
  vehicles: Vehicle[];
}

export default function MiniMap({ vehicles = [] }: MiniMapProps) {
  const onMap = useMemo(() => vehicles.filter((v) => validLatLng(v.lat, v.lng)), [vehicles]);

  const preview = useMemo(() => {
    const withAddr = vehicles.find((v) => validLatLng(v.lat, v.lng) && v.address);
    return withAddr || vehicles.find((v) => validLatLng(v.lat, v.lng));
  }, [vehicles]);

  return (
    <div className="relative aspect-[16/9] w-full min-h-[180px] overflow-hidden rounded-lg border border-border bg-background">
      <FleetMapLibre
        className="absolute inset-0 min-h-[180px]"
        vehicles={vehicles}
        selectedId={null}
        onSelectVehicle={() => {}}
        showControls={false}
        showGeolocate={false}
        fitPadding={32}
      />
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 border-t border-border/80 bg-card/95 px-3 py-2 backdrop-blur sm:px-3.5">
        <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="font-medium text-foreground">
              Live · {onMap.length} on map
              {vehicles.length > 0 && onMap.length === 0 && (
                <span className="font-normal text-muted-foreground"> · waiting for GPS</span>
              )}
            </div>
            {preview?.address && (
              <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-foreground/90">
                {preview.address}
              </p>
            )}
            {preview && !preview.address && onMap.length > 0 && (
              <p className="mt-0.5 text-[10px] text-muted-foreground">Open Live Tracking for full addresses</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
