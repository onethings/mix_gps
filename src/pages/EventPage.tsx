import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, MapPin, Bell } from 'lucide-react';
import { api } from '@/lib/api';
import { useLiveData } from '@/context/LiveDataContext';
import { useT } from '@/lib/i18n';
import { formatDate } from '@/lib/utils';

interface EventItem {
  id: number;
  type: string;
  serverTime?: string;
  deviceId?: number;
  positionId?: number;
  geofenceId?: number;
  attributes?: Record<string, unknown>;
}

export default function EventPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { devicesById } = useLiveData();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [position, setPosition] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await api.events.get(parseInt(id, 10)) as EventItem;
        if (!cancelled) setEvent(data);
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [id]);

  // Fetch position if event has positionId
  useEffect(() => {
    if (!event?.positionId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await api.positions.list({ id: event.positionId }) as any[];
        if (!cancelled && data?.length > 0) setPosition(data[0]);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [event?.positionId]);

  const deviceName = event?.deviceId ? devicesById[event.deviceId]?.name : null;
  const eventTypeLabel = event?.type
    ? (t(`eventType_${event.type}`) !== `eventType_${event.type}` ? t(`eventType_${event.type}`) : event.type.replace(/([A-Z])/g, ' $1').trim())
    : '';

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <button type="button" onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          {t('back')}
        </button>
        <h1 className="text-base font-semibold truncate">
          <Bell className="mr-1.5 inline h-4 w-4 text-muted-foreground" />
          {eventTypeLabel || t('eventTitle')}
        </h1>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{t('loading')}…</div>
        ) : !event ? (
          <div className="py-8 text-center text-sm text-muted-foreground">{t('noData')}</div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-6">
            {/* Event details */}
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('eventDetails')}
              </h2>
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b">
                      <td className="px-3 py-2 text-xs text-muted-foreground w-32">ID</td>
                      <td className="px-3 py-2 text-xs font-medium">{event.id}</td>
                    </tr>
                    <tr className="border-b">
                      <td className="px-3 py-2 text-xs text-muted-foreground">{t('positionType')}</td>
                      <td className="px-3 py-2 text-xs font-medium">{eventTypeLabel}</td>
                    </tr>
                    <tr className="border-b">
                      <td className="px-3 py-2 text-xs text-muted-foreground">{t('positionServerTime')}</td>
                      <td className="px-3 py-2 text-xs font-medium">{event.serverTime ? formatDate(event.serverTime) : '—'}</td>
                    </tr>
                    <tr className="border-b">
                      <td className="px-3 py-2 text-xs text-muted-foreground">{t('reportDevice')}</td>
                      <td className="px-3 py-2 text-xs font-medium">
                        {deviceName ? (
                          <Link to={`/devices/${event.deviceId}`} className="text-primary hover:underline">
                            {deviceName}
                          </Link>
                        ) : '—'}
                      </td>
                    </tr>
                    {event.geofenceId != null && (
                      <tr className="border-b">
                        <td className="px-3 py-2 text-xs text-muted-foreground">{t('reportGeofence')}</td>
                        <td className="px-3 py-2 text-xs font-medium">{event.geofenceId}</td>
                      </tr>
                    )}
                    {event.positionId != null && (
                      <tr>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{t('positionTitle')}</td>
                        <td className="px-3 py-2 text-xs font-medium">
                          <Link to={`/position/${event.positionId}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                            <MapPin className="h-3 w-3" />
                            #{event.positionId}
                          </Link>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Position map preview */}
            {position && (
              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('positionTitle')}
                </h2>
                <div className="overflow-hidden rounded-lg border">
                  <table className="w-full text-sm">
                    <tbody>
                      <tr className="border-b">
                        <td className="px-3 py-2 text-xs text-muted-foreground w-32">{t('positionFixTime')}</td>
                        <td className="px-3 py-2 text-xs font-medium">{position.fixTime ? formatDate(position.fixTime) : '—'}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="px-3 py-2 text-xs text-muted-foreground">{t('positionLatitude')}</td>
                        <td className="px-3 py-2 text-xs font-medium">{position.latitude?.toFixed(6)}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="px-3 py-2 text-xs text-muted-foreground">{t('positionLongitude')}</td>
                        <td className="px-3 py-2 text-xs font-medium">{position.longitude?.toFixed(6)}</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{t('positionSpeed')}</td>
                        <td className="px-3 py-2 text-xs font-medium">{position.speed != null ? `${(position.speed * 1.852).toFixed(1)} km/h` : '—'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Attributes */}
            {event.attributes && Object.keys(event.attributes).length > 0 && (
              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('eventAttributes')}
                </h2>
                <div className="overflow-hidden rounded-lg border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('stateName')}</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('stateValue')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(event.attributes).map(([key, val]) => (
                        <tr key={key} className="border-b last:border-0">
                          <td className="px-3 py-2 text-xs text-muted-foreground font-mono">{key}</td>
                          <td className="px-3 py-2 text-xs font-medium">{String(val ?? '—')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
