import { useState, memo } from 'react';
import { Link } from 'react-router-dom';
import {
  Navigation, Play, Repeat, Share2, Gauge, Fuel, Power,
  User, MapPin, Wrench, Activity,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import StatusBadge from '@/components/common/StatusBadge';
import ShareDialog from '@/components/common/ShareDialog';
import { formatDate } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import type { Vehicle } from '@/types';

function Row({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-2.5 text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <div className="text-right font-medium text-foreground">{children}</div>
    </div>
  );
}

interface VehicleDetailsProps {
  vehicle: Vehicle | null;
}

const VehicleDetails = memo(function VehicleDetails({ vehicle }: VehicleDetailsProps) {
  const { t } = useT();
  const [shareOpen, setShareOpen] = useState(false);

  if (!vehicle) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center">
          <Navigation className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">{t('noVehicleSelected')}</p>
          <p className="text-xs text-muted-foreground/60 mt-1">{t('pickVehicleFromList')}</p>
        </div>
      </div>
    );
  }

  const fuel = vehicle.fuel ?? 0;
  const hasLatLng =
    vehicle.lat != null && vehicle.lng != null &&
    Number.isFinite(Number(vehicle.lat)) && Number.isFinite(Number(vehicle.lng));

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-lg font-semibold text-foreground">{vehicle.name ?? '—'}</div>
            <div className="text-xs text-muted-foreground">
              {vehicle.model ?? '—'} · {vehicle.plate ?? '—'}
            </div>
          </div>
          <StatusBadge status={vehicle.status} />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t('speed')}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{vehicle.speed}</div>
            <div className="text-[10px] text-muted-foreground">{t('unitKmh')}</div>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t('fuel')}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{fuel}%</div>
            <Progress value={fuel} className="mt-1.5" />
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t('odometer')}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">
              {vehicle.odometer != null ? Number(vehicle.odometer).toLocaleString() : '0'}
            </div>
            <div className="text-[10px] text-muted-foreground">km</div>
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">
        {/* Location card */}
        {hasLatLng && (
          <div className="mb-5 rounded-xl border border-primary/30 bg-primary/5 p-4 shadow-sm ring-1 ring-primary/10">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-primary">
              <MapPin className="h-4 w-4 shrink-0" />
              {t('currentLocation')}
            </div>
            {vehicle.address ? (
              <p className="mt-2 text-sm font-medium leading-snug text-foreground">{vehicle.address}</p>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">{t('noAddress')}</p>
            )}
            <p className="mt-2 font-mono text-[11px] text-muted-foreground">
              {Number(vehicle.lat).toFixed(5)}, {Number(vehicle.lng).toFixed(5)}
            </p>
            <p className="mt-2 border-t border-primary/15 pt-2 text-[11px] text-muted-foreground">
              {t('lastUpdate')}: <span className="font-medium text-foreground">{formatDate(vehicle.lastUpdate)}</span>
            </p>
          </div>
        )}

        {/* Info rows */}
        <div className="divide-y divide-border">
          <Row icon={Power} label={t('ignition')}>
            {vehicle.ignition ? (
              <span className="text-green-600 dark:text-green-400">{t('on')}</span>
            ) : (
              <span className="text-muted-foreground">{t('off')}</span>
            )}
          </Row>
          <Row icon={User} label={t('driver')}>{vehicle.driver || t('unassigned')}</Row>
          <Row icon={Activity} label={t('group')}>{vehicle.group || '—'}</Row>
          <Row icon={Gauge} label={t('currentTrip')}>{vehicle.currentTripId || '—'}</Row>
          <Row icon={Fuel} label="VIN">
            <span className="font-mono text-xs">{vehicle.vin || '—'}</span>
          </Row>
          <Row icon={Wrench} label={t('lastUpdate')}>{formatDate(vehicle.lastUpdate)}</Row>
        </div>

        <Separator className="my-5" />

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link to="/tracking">
              <Navigation className="h-4 w-4" /> {t('liveMap')}
            </Link>
          </Button>
          <Button size="sm" variant="default" asChild>
            <Link to={`/replay?deviceId=${vehicle.id}`}>
              <Play className="h-4 w-4" /> {t('replay')}
            </Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to={`/devices/${vehicle.id}`}>
              <Repeat className="h-4 w-4" /> {t('device')}
            </Link>
          </Button>
          <Button
            size="sm"
            variant="outline"
            type="button"
            disabled={!hasLatLng}
            onClick={() => {
              const url = `https://www.google.com/maps/dir/?api=1&destination=${vehicle.lat},${vehicle.lng}`;
              window.open(url, '_blank', 'noopener,noreferrer');
            }}
          >
            <Navigation className="h-4 w-4" /> Google Maps
          </Button>
        </div>

        {/* Call driver */}
        {vehicle.phone && (
          <a
            href={`tel:${vehicle.phone}`}
            className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-primary/10 px-3 py-2.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
          >
            {t('callDriver')}: {vehicle.phone}
          </a>
        )}

        <Separator className="my-4" />

        {/* Share button */}
        <Button variant="secondary" className="w-full" size="sm" onClick={() => setShareOpen(true)}>
          <Share2 className="mr-2 h-4 w-4" /> {t('share')}
        </Button>

        <ShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          vehicles={[vehicle]}
          title={t('shareVehicle')}
        />
      </div>
    </div>
  );
});

export default VehicleDetails;
