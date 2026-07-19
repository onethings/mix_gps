import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { useLiveData } from '@/context/LiveDataContext';
import FleetMapLibre, { type FleetMapLibreHandle } from '@/components/tracking/FleetMapLibre';

export default function EmulatorPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const { devices, positions } = useLiveData();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [lastSent, setLastSent] = useState<{ lat: number; lng: number } | null>(null);
  const [sending, setSending] = useState(false);
  const mapRef = useRef<FleetMapLibreHandle>(null);

  const selectedDevice = selectedId ? devices.find((d) => d.id === selectedId) : null;
  const vehicleList = useRef(devices);
  useEffect(() => { vehicleList.current = devices; }, [devices]);

  const handleMapClick = useCallback(async (lat: number, lng: number) => {
    if (!selectedId) return;
    setSending(true);
    setLastSent({ lat, lng });
    try {
      const device = vehicleList.current.find((d) => d.id === selectedId);
      if (!device) return;

      const params = new URLSearchParams();
      params.append('id', device.uniqueId);
      params.append('lat', String(lat));
      params.append('lon', String(lng));
      params.append('timestamp', new Date().toISOString());

      // Try sending to current origin first (Traccar HTTPS mode),
      // fall back to port 5055 (Traccar device emulator HTTP mode)
      try {
        await fetch(window.location.origin, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        });
      } catch {
        // Fallback: send to Traccar device emulator port
        await fetch(`http://${window.location.hostname}:5055?${params.toString()}`, {
          method: 'POST',
          mode: 'no-cors',
        });
      }
    } catch {
      // silently fail
    } finally {
      setSending(false);
    }
  }, [selectedId]);

  // Build a synthetic vehicle array for the map with just the selected device at the clicked position
  const mapVehicles = useCallback(() => {
    if (!selectedId) return [];
    const device = devices.find((d) => d.id === selectedId);
    if (!device) return [];
    const pos = positions[selectedId];
    return [{
      id: device.id,
      name: device.name,
      uniqueId: device.uniqueId,
      status: device.status || 'offline',
      lat: pos?.latitude ?? lastSent?.lat ?? null,
      lng: pos?.longitude ?? lastSent?.lng ?? null,
      speed: pos?.speed ?? 0,
      course: pos?.course ?? 0,
      attributes: device.attributes || {},
    }] as any;
  }, [selectedId, devices, positions, lastSent]);

  return (
    <div className="flex h-full flex-col">
      {/* Header bar */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('back')}
        </button>
        <h1 className="text-base font-semibold">{t('sharedEmulator')}</h1>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 shrink-0 border-r bg-card p-4 space-y-4 overflow-y-auto">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t('reportDevice')}</label>
            <select
              value={selectedId ?? ''}
              onChange={(e) => setSelectedId(e.target.value ? parseInt(e.target.value, 10) : null)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="">{t('selectDevice')}</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>{d.name} ({d.uniqueId})</option>
              ))}
            </select>
          </div>

          {selectedDevice && (
            <div className="rounded-md border bg-muted/30 p-3 space-y-2">
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{selectedDevice.name}</span>
                <br />
                {selectedDevice.uniqueId}
              </div>
              <div className="border-t pt-2 text-xs text-muted-foreground">
                <p>{t('emulatorClickHint')}</p>
              </div>
              {lastSent && (
                <div className="flex items-center gap-1.5 text-xs text-primary">
                  <MapPin className="h-3 w-3" />
                  {lastSent.lat.toFixed(5)}, {lastSent.lng.toFixed(5)}
                </div>
              )}
              {sending && (
                <div className="text-xs text-muted-foreground animate-pulse">{t('sending')}…</div>
              )}
            </div>
          )}

          {!selectedId && (
            <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
              <MapPin className="mx-auto mb-2 h-8 w-8 opacity-30" />
              {t('emulatorSelectDevice')}
            </div>
          )}
        </div>

        {/* Map */}
        <div className="flex-1 relative">
          <FleetMapLibre
            ref={mapRef}
            vehicles={mapVehicles()}
            selectedId={selectedId}
            onSelectVehicle={(id) => setSelectedId(id)}
            onMapClick={handleMapClick}
            showGeolocate
            fitPadding={20}
          />
        </div>
      </div>
    </div>
  );
}
