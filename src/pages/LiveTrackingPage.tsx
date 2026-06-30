import { useState, useEffect } from 'react';
import VehicleList from '@/components/tracking/VehicleList';
import MapView from '@/components/tracking/MapView';
import VehicleDetails from '@/components/tracking/VehicleDetails';
import { useLiveData } from '@/context/LiveDataContext';
import { useT } from '@/lib/i18n';
import type { Vehicle } from '@/types';

function TrackingSkeleton() {
  return (
    <div className="-mx-4 -my-6 flex min-h-[640px] flex-col gap-3 lg:-mx-8 lg:-my-8 lg:flex-row">
      <aside className="h-48 shrink-0 border border-border bg-muted/40 lg:h-auto lg:w-[320px] lg:border-0 lg:border-r">
        <div className="space-y-3 p-4">
          <div className="h-6 w-32 animate-pulse rounded bg-muted" />
          <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
          <div className="h-24 animate-pulse rounded-lg bg-muted" />
        </div>
      </aside>
      <section className="relative min-h-[280px] flex-1 animate-pulse rounded-lg bg-muted/50 lg:min-h-[640px]" />
      <aside className="h-64 shrink-0 border border-border bg-muted/40 lg:h-auto lg:w-[360px] lg:border-0 lg:border-l">
        <div className="space-y-3 p-4">
          <div className="h-8 w-40 animate-pulse rounded bg-muted" />
          <div className="h-32 animate-pulse rounded-lg bg-muted" />
        </div>
      </aside>
    </div>
  );
}

export default function LiveTrackingPage() {
  const { vehicles, loading } = useLiveData();
  const { t } = useT();
  const [selected, setSelected] = useState<Vehicle | null>(null);

  useEffect(() => {
    if (!vehicles.length) { setSelected(null); return; }
    setSelected((prev) => {
      if (prev && vehicles.some((v) => v.id === prev.id)) return prev;
      return vehicles[0] || null;
    });
  }, [vehicles]);

  if (loading && !vehicles.length) return <TrackingSkeleton />;

  if (!vehicles.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 p-12 text-center">
        <p className="text-sm font-medium">{t('noDevicesAssigned')}</p>
        <p className="max-w-md text-xs text-muted-foreground">{t('signInToSee')}</p>
      </div>
    );
  }

  return (
    <div className="-mx-4 -my-6 flex h-[calc(100vh-4rem)] min-h-[640px] flex-col lg:-mx-8 lg:-my-8 lg:flex-row">
      <aside className="border-b border-border bg-card lg:w-[320px] lg:border-b-0 lg:border-r">
        <VehicleList vehicles={vehicles} selectedId={selected?.id ?? null} onSelect={setSelected} />
      </aside>
      <section className="relative min-h-[360px] flex-1">
        <MapView vehicles={vehicles} selectedId={selected?.id ?? null} onSelect={setSelected} />
      </section>
      <aside className="border-t border-border bg-card lg:w-[380px] lg:border-l lg:border-t-0">
        <VehicleDetails vehicle={selected} />
      </aside>
    </div>
  );
}
