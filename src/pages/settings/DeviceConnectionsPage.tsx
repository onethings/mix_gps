import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Link2 } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import LinkField from '@/components/settings/LinkField';
import { api } from '@/lib/api';
import type { TraccarDevice } from '@/types';

export default function DeviceConnectionsPage() {
  const { t } = useT();
  const { id } = useParams<{ id: string }>();
  const deviceId = Number(id);
  const [device, setDevice] = useState<TraccarDevice | null>(null);

  const fetchDevice = useCallback(async () => {
    try {
      const data = await api.devices.get(deviceId) as TraccarDevice;
      setDevice(data);
    } catch {
      // silently fail — the page still works without the device name
    }
  }, [deviceId]);

  useEffect(() => {
    fetchDevice();
  }, [fetchDevice]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/settings/devices">
            <ArrowLeft className="h-4 w-4 mr-1" />
            {t('backToSettings')}
          </Link>
        </Button>
      </div>

      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          {t('sharedConnections')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {device ? `${t('deviceTitle')}: ${device.name}` : t('loading')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('sharedConnections')}</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          <LinkField
            endpointAll="/api/geofences"
            endpointLinked={`/api/geofences?deviceId=${deviceId}`}
            baseId={deviceId}
            keyBase="deviceId"
            keyLink="geofenceId"
            label={t('sharedGeofence')}
          />
          <Separator />
          <LinkField
            endpointAll="/api/notifications"
            endpointLinked={`/api/notifications?deviceId=${deviceId}`}
            baseId={deviceId}
            keyBase="deviceId"
            keyLink="notificationId"
            label={t('notifications')}
          />
          <Separator />
          <LinkField
            endpointAll="/api/drivers"
            endpointLinked={`/api/drivers?deviceId=${deviceId}`}
            baseId={deviceId}
            keyBase="deviceId"
            keyLink="driverId"
            titleGetter={(item) => `${item.name} (${item.uniqueId || ''})`}
            label={t('sharedDriver')}
          />
          <Separator />
          <LinkField
            endpointAll="/api/attributes/computed"
            endpointLinked={`/api/attributes/computed?deviceId=${deviceId}`}
            baseId={deviceId}
            keyBase="deviceId"
            keyLink="attributeId"
            titleGetter={(item) => item.description || item.name}
            label={t('computedAttributes')}
          />
          <Separator />
          <LinkField
            endpointAll="/api/commands"
            endpointLinked={`/api/commands?deviceId=${deviceId}`}
            baseId={deviceId}
            keyBase="deviceId"
            keyLink="commandId"
            titleGetter={(item) => item.description || item.name}
            label={t('savedCommands')}
          />
          <Separator />
          <LinkField
            endpointAll="/api/maintenance"
            endpointLinked={`/api/maintenance?deviceId=${deviceId}`}
            baseId={deviceId}
            keyBase="deviceId"
            keyLink="maintenanceId"
            label={t('maintenance')}
          />
        </CardContent>
      </Card>
    </div>
  );
}
