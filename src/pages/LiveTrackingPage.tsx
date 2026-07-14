import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import VehicleList from '@/components/tracking/VehicleList';
import LiveTrackingBottomPanel from '@/components/tracking/LiveTrackingBottomPanel';
import { useLiveData } from '@/context/LiveDataContext';
import { useMapContext } from '@/context/MapContext';
import { useT } from '@/lib/i18n';
import { getLiveTrackingPrefs, setLiveTrackingPrefs } from '@/lib/preferences';

export default function LiveTrackingPage() {
  const { vehicles, loading } = useLiveData();
  const { selectedVehicleId, setSelectedVehicleId } = useMapContext();
  const { t } = useT();
  const [showBottomPanel, setShowBottomPanel] = useState(true);
  const prefsLoadedRef = useRef(false);
  const pendingVehicleIdRef = useRef<number | null>(null);

  // Load persisted preferences once on mount
  useEffect(() => {
    if (prefsLoadedRef.current) return;
    getLiveTrackingPrefs().then((prefs) => {
      if (prefs.showBottomPanel !== undefined) {
        setShowBottomPanel(prefs.showBottomPanel);
      }
      if (prefs.lastVehicleId != null) {
        pendingVehicleIdRef.current = prefs.lastVehicleId;
      }
      prefsLoadedRef.current = true;
    });
  }, []);

  // Persist showBottomPanel whenever it changes
  useEffect(() => {
    if (!prefsLoadedRef.current) return;
    getLiveTrackingPrefs().then((existing) => {
      setLiveTrackingPrefs({ ...existing, showBottomPanel });
    });
  }, [showBottomPanel]);

  // Persist last selected vehicle
  useEffect(() => {
    if (!prefsLoadedRef.current || selectedVehicleId == null) return;
    getLiveTrackingPrefs().then((existing) => {
      setLiveTrackingPrefs({ ...existing, lastVehicleId: selectedVehicleId });
    });
  }, [selectedVehicleId]);

  // Auto-select first vehicle on initial load
  useEffect(() => {
    if (!vehicles.length) { setSelectedVehicleId(null); return; }
    // Only auto-select if nothing is selected yet
    if (selectedVehicleId == null) {
      const pendingId = pendingVehicleIdRef.current;
      pendingVehicleIdRef.current = null;
      if (pendingId != null && vehicles.some((v) => v.id === pendingId)) {
        setSelectedVehicleId(pendingId);
      } else {
        setSelectedVehicleId(vehicles[0]?.id ?? null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicles]);

  if (loading && !vehicles.length) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          <span className="text-sm">{t('loading')}</span>
        </div>
      </div>
    );
  }

  if (!vehicles.length) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="rounded-lg border border-dashed border-border bg-background/80 p-12 text-center">
          <p className="text-sm font-medium">{t('noDevicesAssigned')}</p>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">{t('signInToSee')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 overflow-hidden">
        {/* Vehicle List Sidebar — floats over the global map */}
        <aside className="w-[320px] shrink-0 border-r border-border bg-card/95 backdrop-blur-md pointer-events-auto">
          <VehicleList
            vehicles={vehicles}
            selectedId={selectedVehicleId}
            onSelect={(v) => setSelectedVehicleId(v.id)}
          />
        </aside>

        {/* Empty center section — the global map shows through and is interactive */}
        <section className="relative flex-1 pointer-events-none" />
      </div>

      {/* Bottom panel toggle button */}
      <button
        type="button"
        onClick={() => setShowBottomPanel((v) => !v)}
        className="pointer-events-auto flex h-6 items-center justify-center gap-1.5 border-t border-border bg-card/80 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors shrink-0 backdrop-blur-sm"
        title={showBottomPanel ? t('hidePanel') : t('showPanel')}
      >
        {showBottomPanel ? (
          <><ChevronDown className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t('hide')}</span></>
        ) : (
          <><ChevronUp className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t('show')}</span></>
        )}
      </button>

      {/* Bottom panel */}
      {showBottomPanel && (
        <div className="h-[240px] shrink-0 lg:h-[260px] border-t border-border bg-card/95 backdrop-blur-md pointer-events-auto">
          <LiveTrackingBottomPanel
            vehicles={vehicles}
            selectedId={selectedVehicleId}
            onSelect={(v) => setSelectedVehicleId(v.id)}
          />
        </div>
      )}
    </div>
  );
}
