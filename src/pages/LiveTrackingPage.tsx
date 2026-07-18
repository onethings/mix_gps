import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import VehicleList from '@/components/tracking/VehicleList';
import LiveTrackingBottomPanel from '@/components/tracking/LiveTrackingBottomPanel';
import { useLiveData } from '@/context/LiveDataContext';
import { useMapContext } from '@/context/MapContext';
import { useT } from '@/lib/i18n';
import { getLiveTrackingPrefs, setLiveTrackingPrefs } from '@/lib/preferences';

export default function LiveTrackingPage() {
  const { vehicles, loading } = useLiveData();
  const { selectedVehicleId, setSelectedVehicleId, mapHandleRef } = useMapContext();
  const { t } = useT();
  const [showBottomPanel, setShowBottomPanel] = useState(true);
  const [showVehicleList, setShowVehicleList] = useState(() => window.innerWidth >= 768);
  const prefsLoadedRef = useRef(false);
  const pendingVehicleIdRef = useRef<number | null>(null);

  // Load persisted preferences once on mount
  useEffect(() => {
    if (prefsLoadedRef.current) return;
    getLiveTrackingPrefs().then((prefs) => {
      if (prefs.showBottomPanel !== undefined) {
        setShowBottomPanel(prefs.showBottomPanel);
      }
      if (prefs.showVehicleList !== undefined) {
        setShowVehicleList(prefs.showVehicleList);
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

  // Persist showVehicleList whenever it changes
  useEffect(() => {
    if (!prefsLoadedRef.current) return;
    getLiveTrackingPrefs().then((existing) => {
      setLiveTrackingPrefs({ ...existing, showVehicleList });
    });
  }, [showVehicleList]);

  // Persist last selected vehicle
  useEffect(() => {
    if (!prefsLoadedRef.current || selectedVehicleId == null) return;
    getLiveTrackingPrefs().then((existing) => {
      setLiveTrackingPrefs({ ...existing, lastVehicleId: selectedVehicleId });
    });
  }, [selectedVehicleId]);

  // Auto-select vehicle or fit all on initial load
  const initialFitDoneRef = useRef(false);
  useEffect(() => {
    if (!vehicles.length) { setSelectedVehicleId(null); return; }
    // Only auto-select if nothing is selected yet
    if (selectedVehicleId == null) {
      const pendingId = pendingVehicleIdRef.current;
      pendingVehicleIdRef.current = null;
      if (pendingId != null && vehicles.some((v) => v.id === pendingId)) {
        setSelectedVehicleId(pendingId);
      } else {
        // On mobile, show all vehicles instead of selecting first
        if (window.innerWidth < 768 && !initialFitDoneRef.current) {
          initialFitDoneRef.current = true;
          // Small delay to let map finish initializing
          requestAnimationFrame(() => {
            mapHandleRef.current?.fitAllVehicles();
          });
        } else if (window.innerWidth >= 768) {
          setSelectedVehicleId(vehicles[0]?.id ?? null);
        }
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
        <div className="rounded-lg border border-dashed border-border bg-background/80 p-6 md:p-12 text-center">
          <p className="text-sm font-medium">{t('noDevicesAssigned')}</p>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">{t('signInToSee')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 overflow-hidden">
        {/* Vehicle List Sidebar — collapsible; overlay on mobile, sidebar on desktop */}
        <aside className={cn(
          'shrink-0 border-r border-border bg-card/95 backdrop-blur-md pointer-events-auto transition-all duration-200',
          'max-md:absolute max-md:inset-y-0 max-md:z-30 max-md:shadow-xl',
          showVehicleList
            ? 'max-md:w-[85vw] max-md:left-0 w-[320px] lg:w-[320px]'
            : 'max-md:w-0 max-md:overflow-hidden w-[40px]',
        )}>
          {/* Mobile backdrop */}
          {showVehicleList && (
            <div
              className="fixed inset-0 z-[-1] bg-black/40 md:hidden"
              onClick={() => setShowVehicleList(false)}
            />
          )}
          {showVehicleList ? (
            <VehicleList
              vehicles={vehicles}
              selectedId={selectedVehicleId}
              onSelect={(v) => setSelectedVehicleId(v.id)}
              showList={showVehicleList}
              onToggleList={() => setShowVehicleList((v) => !v)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowVehicleList(true)}
              className="flex h-full w-full items-start justify-center pt-3 text-muted-foreground hover:text-foreground transition-colors"
              title={t('showList')}
            >
              <Eye className="h-5 w-5" />
            </button>
          )}
        </aside>

        {/* Empty center section — the global map shows through and is interactive */}
        <section className="relative flex-1 pointer-events-none" />
      </div>

      {/* Bottom panel toggle button — hidden on mobile for full-screen map */}
      <button
        type="button"
        onClick={() => setShowBottomPanel((v) => !v)}
        className="pointer-events-auto hidden md:flex h-6 items-center justify-center gap-1.5 border-t border-border bg-card/80 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors shrink-0 backdrop-blur-sm"
        title={showBottomPanel ? t('hidePanel') : t('showPanel')}
      >
        {showBottomPanel ? (
          <><ChevronDown className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t('hide')}</span></>
        ) : (
          <><ChevronUp className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t('show')}</span></>
        )}
      </button>

      {/* Bottom panel — hidden on mobile */}
      {showBottomPanel && (
        <div className="hidden md:block h-[180px] shrink-0 md:h-[220px] lg:h-[260px] border-t border-border bg-card/95 backdrop-blur-md pointer-events-auto">
          <LiveTrackingBottomPanel
            vehicles={vehicles}
            selectedId={selectedVehicleId}
            onSelect={(v) => setSelectedVehicleId(v.id)}
          />
        </div>
      )}

      {/* Mobile: prev/next vehicle navigation above bottom nav */}
      {vehicles.length > 0 && (
        <VehicleNav
          vehicles={vehicles}
          selectedId={selectedVehicleId}
          onSelect={setSelectedVehicleId}
        />
      )}
    </div>
  );
}

/* ── Mobile prev/next vehicle nav ── */
function VehicleNav({ vehicles, selectedId, onSelect }: {
  vehicles: any[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}) {
  const idx = selectedId != null ? vehicles.findIndex((v) => v.id === selectedId) : -1;
  const hasPrev = idx > 0;
  const hasNext = idx >= 0 && idx < vehicles.length - 1;

  const goPrev = () => {
    if (!hasPrev) return;
    const prev = vehicles[idx - 1];
    onSelect(prev.id);
  };

  const goNext = () => {
    if (!hasNext) return;
    const next = vehicles[idx + 1];
    onSelect(next.id);
  };

  return (
    <div className="pointer-events-auto absolute bottom-20 left-0 right-0 z-30 flex items-center justify-center gap-6 md:hidden">
      <button
        type="button"
        onClick={goPrev}
        disabled={!hasPrev}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-primary shadow-lg text-primary-foreground transition-all active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
        aria-label="Previous vehicle"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>
      <div className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary shadow-sm border border-primary/20">
        {selectedId != null ? `${idx + 1} / ${vehicles.length}` : `${vehicles.length}`}
      </div>
      <button
        type="button"
        onClick={goNext}
        disabled={!hasNext}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-primary shadow-lg text-primary-foreground transition-all active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
        aria-label="Next vehicle"
      >
        <ChevronRight className="h-6 w-6" />
      </button>
    </div>
  );
}
