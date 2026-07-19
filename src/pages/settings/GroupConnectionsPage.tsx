import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Link2 } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import LinkField from '@/components/settings/LinkField';
import { api } from '@/lib/api';
import type { TraccarGroup } from '@/types';

export default function GroupConnectionsPage() {
  const { t } = useT();
  const { id } = useParams<{ id: string }>();
  const groupId = Number(id);
  const [group, setGroup] = useState<TraccarGroup | null>(null);

  const fetchGroup = useCallback(async () => {
    try {
      const data = await api.groups.get(groupId) as TraccarGroup;
      setGroup(data);
    } catch {
      // silently fail
    }
  }, [groupId]);

  useEffect(() => {
    fetchGroup();
  }, [fetchGroup]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/settings/groups">
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
          {group ? `${t('groups')}: ${group.name}` : t('loading')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('sharedConnections')}</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          <LinkField
            endpointAll="/api/geofences"
            endpointLinked={`/api/geofences?groupId=${groupId}`}
            baseId={groupId}
            keyBase="groupId"
            keyLink="geofenceId"
            label={t('sharedGeofence')}
          />
          <Separator />
          <LinkField
            endpointAll="/api/notifications"
            endpointLinked={`/api/notifications?groupId=${groupId}`}
            baseId={groupId}
            keyBase="groupId"
            keyLink="notificationId"
            label={t('notifications')}
          />
          <Separator />
          <LinkField
            endpointAll="/api/drivers"
            endpointLinked={`/api/drivers?groupId=${groupId}`}
            baseId={groupId}
            keyBase="groupId"
            keyLink="driverId"
            titleGetter={(item) => `${item.name} (${item.uniqueId || ''})`}
            label={t('sharedDriver')}
          />
          <Separator />
          <LinkField
            endpointAll="/api/attributes/computed"
            endpointLinked={`/api/attributes/computed?groupId=${groupId}`}
            baseId={groupId}
            keyBase="groupId"
            keyLink="attributeId"
            titleGetter={(item) => item.description || item.name}
            label={t('computedAttributes')}
          />
          <Separator />
          <LinkField
            endpointAll="/api/commands"
            endpointLinked={`/api/commands?groupId=${groupId}`}
            baseId={groupId}
            keyBase="groupId"
            keyLink="commandId"
            titleGetter={(item) => item.description || item.name}
            label={t('savedCommands')}
          />
          <Separator />
          <LinkField
            endpointAll="/api/maintenance"
            endpointLinked={`/api/maintenance?groupId=${groupId}`}
            baseId={groupId}
            keyBase="groupId"
            keyLink="maintenanceId"
            label={t('maintenance')}
          />
        </CardContent>
      </Card>
    </div>
  );
}
