import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Link2 } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import LinkField from '@/components/settings/LinkField';
import { api } from '@/lib/api';
import type { TraccarUser } from '@/types';

export default function UserConnectionsPage() {
  const { t } = useT();
  const { id } = useParams<{ id: string }>();
  const userId = Number(id);
  const [user, setUser] = useState<TraccarUser | null>(null);

  const fetchUser = useCallback(async () => {
    try {
      const data = await api.users.get(userId) as TraccarUser;
      setUser(data);
    } catch {
      // silently fail
    }
  }, [userId]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/settings/users">
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
          {user ? `${t('users')}: ${user.name || user.email}` : t('loading')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('sharedConnections')}</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          <LinkField
            endpointAll="/api/devices?all=true"
            endpointLinked={`/api/devices?userId=${userId}`}
            baseId={userId}
            keyBase="userId"
            keyLink="deviceId"
            titleGetter={(item) => `${item.name} (${item.uniqueId || ''})`}
            label={t('deviceTitle')}
          />
          <Separator />
          <LinkField
            endpointAll="/api/groups?all=true"
            endpointLinked={`/api/groups?userId=${userId}`}
            baseId={userId}
            keyBase="userId"
            keyLink="groupId"
            label={t('groups')}
          />
          <Separator />
          <LinkField
            endpointAll="/api/geofences?all=true"
            endpointLinked={`/api/geofences?userId=${userId}`}
            baseId={userId}
            keyBase="userId"
            keyLink="geofenceId"
            label={t('sharedGeofence')}
          />
          <Separator />
          <LinkField
            endpointAll="/api/notifications?all=true"
            endpointLinked={`/api/notifications?userId=${userId}`}
            baseId={userId}
            keyBase="userId"
            keyLink="notificationId"
            label={t('notifications')}
          />
          <Separator />
          <LinkField
            endpointAll="/api/calendars?all=true"
            endpointLinked={`/api/calendars?userId=${userId}`}
            baseId={userId}
            keyBase="userId"
            keyLink="calendarId"
            label={t('calendars')}
          />
          <Separator />
          <LinkField
            endpointAll="/api/users?all=true"
            endpointLinked={`/api/users?userId=${userId}`}
            baseId={userId}
            keyBase="userId"
            keyLink="managedUserId"
            titleGetter={(item) => `${item.name || item.email} (${item.id})`}
            label={t('users')}
          />
          <Separator />
          <LinkField
            endpointAll="/api/attributes/computed?all=true"
            endpointLinked={`/api/attributes/computed?userId=${userId}`}
            baseId={userId}
            keyBase="userId"
            keyLink="attributeId"
            titleGetter={(item) => item.description || item.name}
            label={t('computedAttributes')}
          />
          <Separator />
          <LinkField
            endpointAll="/api/drivers?all=true"
            endpointLinked={`/api/drivers?userId=${userId}`}
            baseId={userId}
            keyBase="userId"
            keyLink="driverId"
            titleGetter={(item) => `${item.name} (${item.uniqueId || ''})`}
            label={t('sharedDriver')}
          />
          <Separator />
          <LinkField
            endpointAll="/api/commands?all=true"
            endpointLinked={`/api/commands?userId=${userId}`}
            baseId={userId}
            keyBase="userId"
            keyLink="commandId"
            titleGetter={(item) => item.description || item.name}
            label={t('savedCommands')}
          />
          <Separator />
          <LinkField
            endpointAll="/api/maintenance?all=true"
            endpointLinked={`/api/maintenance?userId=${userId}`}
            baseId={userId}
            keyBase="userId"
            keyLink="maintenanceId"
            label={t('maintenance')}
          />
        </CardContent>
      </Card>
    </div>
  );
}
