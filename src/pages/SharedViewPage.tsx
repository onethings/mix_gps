import { useMemo, useEffect, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Share2, MapPin, Clock, Calendar, AlertCircle, Navigation, Crosshair, Gauge, Map as MapIcon, Satellite } from 'lucide-react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import StatusBadge from '@/components/common/StatusBadge';
import { formatDate, cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { api } from '@/lib/api';
import type { VehicleStatus } from '@/types';

const STYLE_ROAD = 'https://tiles.openfreemap.org/styles/liberty';
const STYLE_SATELLITE = {
  version: 8 as const,
  sources: {
    satellite: {
      type: 'raster' as const,
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: '<a href="https://www.esri.com/" target="_blank" rel="noreferrer">Esri</a>',
      maxzoom: 22,
    },
  },
  layers: [{ id: 'satellite', type: 'raster' as const, source: 'satellite', minzoom: 0, maxzoom: 22 }],
};

function styleForBasemap(b: string): string | maplibregl.StyleSpecification {
  return b === 'satellite' ? (STYLE_SATELLITE as unknown as maplibregl.StyleSpecification) : STYLE_ROAD;
}

interface ShareVehicle {
  id: number;
  name: string;
  plate?: string;
  deviceId?: string;
  lat: number;
  lng: number;
  course?: number;
  speed?: number;
  status?: string;
  lastUpdate?: string;
}

function createCarMarker(status = 'moving', course = 0): string {
  const colors: Record<string, { fill: string; glow: string }> = {
    moving: { fill: '#2563eb', glow: 'rgba(37, 99, 235, 0.45)' },
    idle: { fill: '#d97706', glow: 'rgba(217, 119, 6, 0.42)' },
    stopped: { fill: '#64748b', glow: 'rgba(100, 116, 139, 0.38)' },
    offline: { fill: '#475569', glow: 'rgba(71, 85, 105, 0.35)' },
    alert: { fill: '#dc2626', glow: 'rgba(220, 38, 38, 0.45)' },
  };
  const c = colors[status] || colors.offline!;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
      <defs>
        <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="${c.glow}" flood-opacity="0.6"/>
        </filter>
      </defs>
      <g transform="rotate(${course || 0}, 16, 16)" filter="url(#shadow)">
        <rect x="8" y="10" width="16" height="12" rx="3" fill="${c.fill}" opacity="0.15"/>
        <path d="M6 18 L8 12 L24 12 L26 18 Z" fill="${c.fill}" opacity="0.95"/>
        <circle cx="11" cy="18" r="2.5" fill="white" opacity="0.9"/>
        <circle cx="21" cy="18" r="2.5" fill="white" opacity="0.9"/>
        <circle cx="11" cy="18" r="1.2" fill="${c.fill}"/>
        <circle cx="21" cy="18" r="1.2" fill="${c.fill}"/>
        <circle cx="16" cy="15" r="1.2" fill="white" opacity="0.8"/>
      </g>
    </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

function escapeHtml(s: unknown): string {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function SharedMap({ vehicles }: { vehicles: ShareVehicle[] }) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [basemap, setBasemap] = useState<'road' | 'satellite'>('road');

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: styleForBasemap('road'),
      center: [96.15, 16.84],
      zoom: 10,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = [];
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!map.loaded()) {
      map.once('load', () => map.setStyle(styleForBasemap(basemap)));
    } else {
      map.setStyle(styleForBasemap(basemap));
    }
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
  }, [basemap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !vehicles?.length) return;

    const addMarkers = () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      const validVehicles = vehicles.filter((v) => Number.isFinite(v.lat) && Number.isFinite(v.lng));
      if (validVehicles.length === 0) return;

      validVehicles.forEach((v) => {
        const el = document.createElement('div');
        el.innerHTML = `<img src="${createCarMarker(v.status || 'offline', v.course || 0)}" alt="${v.name}" style="width:36px;height:36px;pointer-events:auto;cursor:pointer;" />`;
        el.style.width = '36px';
        el.style.height = '36px';

        const popup = new maplibregl.Popup({ offset: [0, -18], closeButton: true, maxWidth: '280px' })
          .setHTML(`
            <div style="font-family:system-ui,sans-serif;padding:4px;min-width:180px;">
              <div style="font-weight:600;font-size:14px;margin-bottom:4px;">${escapeHtml(v.name)}</div>
              <div style="font-size:12px;color:#666;">
                <div>Plate: ${escapeHtml(v.plate || '—')}</div>
                <div>Device: ${escapeHtml(v.deviceId || '—')}</div>
                <div>Speed: ${v.speed ?? 0} km/h</div>
                <div>${formatDate(v.lastUpdate)}</div>
              </div>
            </div>
          `);

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([v.lng, v.lat])
          .setPopup(popup)
          .addTo(map);
        markersRef.current.push(marker);
      });

      if (validVehicles.length === 1) {
        const v = validVehicles[0]!;
        map.flyTo({ center: [v.lng, v.lat], zoom: 14, duration: 1000 });
      } else {
        const bounds = new maplibregl.LngLatBounds();
        validVehicles.forEach((v) => bounds.extend([v.lng, v.lat]));
        map.fitBounds(bounds, { padding: 60, duration: 1000 });
      }
    };

    if (map.loaded()) {
      addMarkers();
    } else {
      map.once('load', addMarkers);
    }
  }, [vehicles, basemap]);

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainer} className="h-full w-full rounded-lg" />

      <div className="absolute right-3 top-3 z-10 flex gap-1 rounded-lg border border-border bg-card p-1 shadow-md">
        <button
          type="button"
          onClick={() => setBasemap('road')}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
            basemap === 'road' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <MapIcon className="h-3.5 w-3.5" /> Map
        </button>
        <button
          type="button"
          onClick={() => setBasemap('satellite')}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
            basemap === 'satellite' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Satellite className="h-3.5 w-3.5" /> Satellite
        </button>
      </div>

      {vehicles?.length === 1 && Number.isFinite(vehicles[0]?.lat) && Number.isFinite(vehicles[0]?.lng) && (
        <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
          <Button size="sm" className="gap-2 shadow-lg" onClick={() => {
            const v = vehicles[0]!;
            window.open(`https://www.google.com/maps/dir/?api=1&destination=${v.lat},${v.lng}`, '_blank', 'noopener,noreferrer');
          }}>
            <Navigation className="h-4 w-4" /> Navigate
          </Button>
        </div>
      )}
    </div>
  );
}

interface StoredShare {
  code?: string;
  expiresAt: string;
  vehicles?: ShareVehicle[];
  active?: boolean;
}

function getStoredShareByCode(code: string): StoredShare | null {
  try {
    const data = JSON.parse(localStorage.getItem('mixok-share-links') || '[]') as StoredShare[];
    return data.find((s) => s.code === code && s.active !== false) || null;
  } catch {
    return null;
  }
}

export default function SharedViewPage() {
  const { t } = useT();
  const [searchParams] = useSearchParams();
  const code = searchParams.get('code');
  const token = searchParams.get('token');

  const [serverVehicles, setServerVehicles] = useState<ShareVehicle[] | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [serverLoading, setServerLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setServerLoading(true);
    api.share.get(token)
      .then((data) => {
        if (cancelled) return;
        const raw = data as Record<string, unknown>;
        if (raw?.deviceId) {
          setServerVehicles([{
            id: Number(raw.deviceId),
            name: (raw.deviceName as string) || `Device ${raw.deviceId}`,
            plate: (raw.plate as string) || (raw.deviceName as string) || '',
            deviceId: String(raw.uniqueId || raw.deviceId),
            lat: raw.latitude != null ? Number(raw.latitude) : null!,
            lng: raw.longitude != null ? Number(raw.longitude) : null!,
            course: (raw.course as number) ?? 0,
            speed: (raw.speed as number) ?? 0,
            status: (raw.status as string) || 'online',
            lastUpdate: (raw.lastUpdate as string) || (raw.fixTime as string) || new Date().toISOString(),
          }]);
        } else if (Array.isArray(raw?.devices)) {
          setServerVehicles((raw.devices as Array<Record<string, unknown>>).map((d) => ({
            id: Number(d.id),
            name: (d.name as string) || `Device ${d.id}`,
            plate: (d.plate as string) || (d.name as string) || '',
            deviceId: String(d.uniqueId || d.id),
            lat: d.latitude != null ? Number(d.latitude) : null!,
            lng: d.longitude != null ? Number(d.longitude) : null!,
            course: (d.course as number) ?? 0,
            speed: (d.speed as number) ?? 0,
            status: (d.status as string) || 'online',
            lastUpdate: (d.lastUpdate as string) || (d.fixTime as string) || new Date().toISOString(),
          })));
        }
        setServerLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setServerError(err.message || 'Failed to load share');
        setServerLoading(false);
      });
    return () => { cancelled = true; };
  }, [token]);

  const share = useMemo(() => {
    if (!code) return null;
    return getStoredShareByCode(code);
  }, [code]);

  const liveVehicles: ShareVehicle[] | null = useMemo(() => {
    if (serverVehicles) return serverVehicles;
    return (share?.vehicles as ShareVehicle[]) || null;
  }, [serverVehicles, share]);

  const isExpired = useMemo(() => {
    if (serverVehicles) return false;
    if (!share) return true;
    return new Date(share.expiresAt) <= new Date();
  }, [share, serverVehicles]);

  const hasValidCoords = useMemo(() => {
    if (!liveVehicles) return false;
    return liveVehicles.some((v) => Number.isFinite(v.lat) && Number.isFinite(v.lng));
  }, [liveVehicles]);

  if (!code && !token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <CardTitle>{t('shareLink')}</CardTitle>
            <CardDescription>{t('invalidLink')}</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button variant="outline" asChild><Link to="/">{t('dashboard')}</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!share && !token && !serverVehicles) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <CardTitle>{t('shareLink')}</CardTitle>
            <CardDescription>{t('shareExpired')}</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button variant="outline" asChild><Link to="/">{t('dashboard')}</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (token && !serverVehicles && !serverLoading && !serverError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <CardTitle>{t('shareLink')}</CardTitle>
            <CardDescription>{t('loading')}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Navigation className="h-5 w-5 text-primary" />
            <span>{t('appTitle')}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {share ? `${t('shareExpiresAt')}: ${formatDate(share.expiresAt)}` : ''}
            {token ? (
              <Badge variant="default" className="text-[10px]">{t('liveMap')}</Badge>
            ) : isExpired ? (
              <Badge variant="destructive" className="text-[10px]">{t('expired')}</Badge>
            ) : (
              <Badge variant="success" className="text-[10px]">{t('active')}</Badge>
            )}
          </div>
          <Button variant="outline" size="sm" asChild><Link to="/">{t('signIn')}</Link></Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-4">
        {serverLoading && (
          <div className="mb-4 flex items-center justify-center gap-2 rounded-lg border border-border bg-muted/30 py-3 text-sm text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            {t('loading')}
          </div>
        )}
        {serverError && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
            {serverError}
          </div>
        )}

        <div className="mb-4 overflow-hidden rounded-xl border border-border">
          <div className="h-[420px] w-full sm:h-[500px]">
            {hasValidCoords ? (
              <SharedMap vehicles={liveVehicles!} />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 bg-muted/20 text-muted-foreground">
                <MapPin className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm">{t('noPositions')}</p>
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {liveVehicles?.map((v) => (
            <Card key={v.id} className="overflow-hidden transition-shadow hover:shadow-md">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="truncate text-base">{v.name}</CardTitle>
                    <CardDescription className="mt-0.5 flex items-center gap-2 text-xs">
                      <span>{t('plate')}: {v.plate || '—'}</span>
                      <span className="text-muted-foreground/50">·</span>
                      <span>{t('deviceId')}: {v.deviceId}</span>
                    </CardDescription>
                  </div>
                  <StatusBadge status={(v.status || 'online') as VehicleStatus} />
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="pt-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {Number.isFinite(v.lat) && Number.isFinite(v.lng) && (
                    <>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Crosshair className="h-3.5 w-3.5" />
                        <span>{v.lat.toFixed(5)}, {v.lng.toFixed(5)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Gauge className="h-3.5 w-3.5" />
                        <span>{v.speed ?? 0} {t('unitKmh')}</span>
                      </div>
                    </>
                  )}
                  <div className="col-span-2 flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    <span>{t('lastUpdate')}: {formatDate(v.lastUpdate)}</span>
                  </div>
                </div>
                {Number.isFinite(v.lat) && Number.isFinite(v.lng) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 w-full gap-2"
                    onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${v.lat},${v.lng}`, '_blank', 'noopener,noreferrer')}
                  >
                    <Navigation className="h-4 w-4" />
                    {t('open')} Google Maps
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-6 text-center text-xs text-muted-foreground">
          <p>{t('poweredBy')}</p>
        </div>
      </main>
    </div>
  );
}
