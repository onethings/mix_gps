import { useState, useEffect, useRef } from 'react';
import { Menu, X, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
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
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const pendingVehicleIdRef = useRef<number | null>(null);

  // Load persisted preferences once on mount
  useEffect(() => {
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
      setPrefsLoaded(true);
    });
  }, []);

  // Persist tracking prefs to IndexedDB (debounced to avoid TOCTOU race)
  useEffect(() => {
    if (!prefsLoaded) return;
    const timer = setTimeout(() => {
      getLiveTrackingPrefs().then((existing) => {
        setLiveTrackingPrefs({
          ...existing,
          showBottomPanel,
          showVehicleList,
          ...(selectedVehicleId != null ? { lastVehicleId: selectedVehicleId } : {}),
        });
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [showBottomPanel, showVehicleList, selectedVehicleId, prefsLoaded]);

  // Auto-select vehicle from cache, or leave null (FleetMapLibre shows all vehicles)
  useEffect(() => {
    if (!prefsLoaded) return;
    if (!vehicles.length) { setSelectedVehicleId(null); return; }
    // Only auto-select if nothing is selected yet
    if (selectedVehicleId == null) {
      const pendingId = pendingVehicleIdRef.current;
      pendingVehicleIdRef.current = null;
      if (pendingId != null && vehicles.some((v) => v.id === pendingId)) {
        setSelectedVehicleId(pendingId);
      }
      // No cached vehicle → leave null so FleetMapLibre shows all vehicles via fitBounds
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicles, prefsLoaded]);

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
        {/* Desktop Vehicle List Sidebar — hidden on mobile */}
        <aside className={cn(
          'shrink-0 border-r border-border bg-card/95 backdrop-blur-md pointer-events-auto transition-all duration-200',
          'max-md:hidden',
          showVehicleList ? 'w-[320px] lg:w-[320px]' : 'w-[40px]',
        )}>
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

        {/* Mobile drawer trigger — floating button, only on mobile */}
        <button
          type="button"
          onClick={() => setMobileDrawerOpen(true)}
          className="pointer-events-auto absolute left-2 top-2 z-30 flex md:hidden h-9 w-9 items-center justify-center rounded-lg border border-border bg-card/95 text-foreground shadow-md backdrop-blur transition-colors hover:bg-accent"
          title={t('showList')}
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Mobile drawer — simple vehicle list overlay */}
        {mobileDrawerOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            {/* Backdrop — pointer-events-auto needed because ancestor has pointer-events-none */}
            <div
              className="pointer-events-auto absolute inset-0 bg-black/40"
              onClick={() => setMobileDrawerOpen(false)}
            />
            {/* Drawer panel — pointer-events-auto for scrolling */}
            <div className="pointer-events-auto absolute left-0 top-0 flex h-full w-[85vw] max-w-[320px] flex-col bg-card shadow-xl">
              <div className="flex items-center justify-between border-b border-border px-4 py-3 shrink-0">
                <span className="text-sm font-semibold">{t('vehicles')} ({vehicles.length})</span>
                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto overscroll-contain">
                {vehicles.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">{t('noDevicesAssigned')}</div>
                ) : (
                  vehicles.map((v) => {
                    const statusColor: Record<string, string> = {
                      moving: 'bg-blue-500', idle: 'bg-amber-500', stopped: 'bg-slate-500',
                      offline: 'bg-gray-400', alert: 'bg-red-500', maintenance: 'bg-purple-500',
                    };
                    const dotColor = statusColor[v.status] || 'bg-slate-500';
                    const isSelected = v.id === selectedVehicleId;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => {
                          setSelectedVehicleId(v.id);
                          setMobileDrawerOpen(false);
                          // Fly to the selected vehicle on the map
                          if (v.lat != null && v.lng != null) {
                            setTimeout(() => {
                              mapHandleRef.current?.flyToVehicle(Number(v.lat), Number(v.lng));
                            }, 350);
                          }
                        }}
                        className={cn(
                          'flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors hover:bg-accent/50',
                          isSelected && 'bg-accent shadow-[inset_3px_0_0_0] shadow-primary',
                        )}
                      >
                        <span className={cn('h-2 w-2 shrink-0 rounded-full', dotColor)} />
                        <div className="flex-1 min-w-0">
                          <div className="truncate text-sm font-medium">{v.name}</div>
                        </div>
                        {v.status === 'moving' && (
                          <div className="shrink-0 text-right">
                            <div className="text-sm font-bold tabular-nums">{v.speed}</div>
                            <div className="text-[10px] text-muted-foreground">km/h</div>
                          </div>
                        )}
                        {v.status === 'alert' && (
                          <div className="shrink-0 text-xs font-semibold text-red-500">{t('alert')}</div>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

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
  const hasSelection = selectedId != null;
  const hasPrev = hasSelection ? idx > 0 : vehicles.length > 0;
  const hasNext = hasSelection ? idx >= 0 && idx < vehicles.length - 1 : vehicles.length > 0;

  const goPrev = () => {
    if (hasSelection) {
      if (!hasPrev) return;
      onSelect(vehicles[idx - 1].id);
    } else {
      // No selection → go to last vehicle
      onSelect(vehicles[vehicles.length - 1].id);
    }
  };

  const goNext = () => {
    if (hasSelection) {
      if (!hasNext) return;
      onSelect(vehicles[idx + 1].id);
    } else {
      // No selection → go to first vehicle
      onSelect(vehicles[0].id);
    }
  };

  return (
    <div className="pointer-events-auto absolute bottom-24 left-0 right-0 z-30 flex items-center justify-center gap-6 md:hidden safe-bottom">
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
        {selectedId != null ? `${idx + 1} / ${vehicles.length}` : `⚡ ${vehicles.length}`}
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
