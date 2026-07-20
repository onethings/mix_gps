// API client — organized by Traccar API resource
import { request, qs, BASE } from './client';

export { request, OPENID_AUTH_URL, openSocket } from './client';

export const api = {
  session: {
    get: () => request('/session'),
    login: (email: string, password: string, code?: string) => {
      const body = new URLSearchParams({ email, password });
      if (code) body.append('code', code);
      return request('/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
    },
    loginWithToken: (token: string) => request(`/session?token=${encodeURIComponent(token)}`),
    logout: async () => {
      let res: Response;
      try {
        res = await fetch(`${import('./client').then(m => m.BASE)}/session`, {
          method: 'DELETE',
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
      } catch { return null; }
      if (res.ok || res.status === 401) return null;
      const text = await res.text().catch(() => '');
      const { ApiError } = await import('@/lib/apiError');
      throw new ApiError(text || `${res.status}`, { status: res.status, raw: text });
    },
    server: () => request('/server'),
    becomeUser: (userId: number) => request(`/session/${userId}`, { method: 'POST' }),
    generateToken: async (expirationIso: string) => {
      const res = await fetch(`${BASE}/session/token`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ expiration: expirationIso }).toString(),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const { ApiError } = await import('@/lib/apiError');
        throw new ApiError(text || `${res.status}`, { status: res.status, raw: text });
      }
      // Server returns a plain token string (not JSON) despite application/json content-type
      return res.text() as unknown as string;
    },
    revokeToken: (token: string) =>
      request('/session/token/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: String(token) }).toString(),
      }),
  },

  server: {
    get: () => request('/server'),
    update: (payload: any) => request('/server', { method: 'PUT', body: JSON.stringify(payload) }),
    reboot: () => request('/server/reboot', { method: 'POST' }),
    geocode: (params: any) => request(`/server/geocode${qs(params)}`),
    timezones: () => request('/server/timezones'),
    uploadFile: (filePath: string, body: any) =>
      request(`/server/file/${encodeURIComponent(filePath)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body,
      }),
    gc: () => request('/server/gc'),
    cache: () => request('/server/cache'),
  },

  health: {
    check: () => request('/health'),
  },

  users: {
    list: (params = {}) => request(`/users${qs(params)}`),
    get: (id: number) => request(`/users/${id}`),
    create: (payload: any) => request('/users', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id: number, payload: any) => request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    remove: (id: number) => request(`/users/${id}`, { method: 'DELETE' }),
    register: (payload: any) => request('/users', { method: 'POST', body: JSON.stringify(payload) }),
    totpSetup: () => request('/users/totp', { method: 'POST' }),
  },

  password: {
    reset: (email: string) =>
      request('/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ email: String(email) }).toString(),
      }),
    update: (token: string, password: string) =>
      request('/password/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: String(token), password: String(password) }).toString(),
      }),
  },

  permissions: {
    list: () => request('/permissions'),
    create: (payload: any) => request('/permissions', { method: 'POST', body: JSON.stringify(payload) }),
    update: (payload: any) => request('/permissions', { method: 'PUT', body: JSON.stringify(payload) }),
    remove: (payload: any) => request('/permissions', { method: 'DELETE', body: JSON.stringify(payload) }),
    bulkCreate: (payload: any) => request('/permissions/bulk', { method: 'POST', body: JSON.stringify(payload) }),
    bulkRemove: (payload: any) => request('/permissions/bulk', { method: 'DELETE', body: JSON.stringify(payload) }),
  },

  devices: {
    list: (params = {}) => request(`/devices${qs(params)}`),
    get: (id: number) => request(`/devices/${id}`),
    create: (payload: any) => request('/devices', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id: number, payload: any) => request(`/devices/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    remove: (id: number) => request(`/devices/${id}`, { method: 'DELETE' }),
    getAccumulators: (deviceId: number) => request(`/devices/${deviceId}/accumulators`),
    putAccumulators: (deviceId: number, payload: any) =>
      request(`/devices/${deviceId}/accumulators`, { method: 'PUT', body: JSON.stringify(payload) }),
    uploadImage: (id: number, imageBlob: Blob) =>
      request(`/devices/${id}/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'image/*' },
        body: imageBlob,
      }),
  },

  positions: {
    list: (params = {}) => request(`/positions${qs(params)}`),
    delete: (id: number) => request(`/positions/${id}`, { method: 'DELETE' }),
    deleteByDevice: (deviceId: number, from: string, to: string) =>
      request(`/positions/delete/${deviceId}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { method: 'DELETE' }),
    kml: (params = {}) => request(`/positions/kml${qs(params)}`),
    csv: (params = {}) => request(`/positions/csv${qs(params)}`),
    gpx: (params = {}) => request(`/positions/gpx${qs(params)}`),
  },

  share: {
    device: (deviceId: number, expiration: string) =>
      request('/share/device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ deviceId: String(deviceId), expiration }).toString(),
      }),
    group: (groupId: number, expiration: string) =>
      request('/share/group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ groupId: String(groupId), expiration }).toString(),
      }),
    get: (token: string) => request(`/share/${encodeURIComponent(token)}`),
  },

  drivers: {
    list: (params = {}) => request(`/drivers${qs(params)}`),
    get: (id: number) => request(`/drivers/${id}`),
    create: (payload: any) => request('/drivers', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id: number, payload: any) => request(`/drivers/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    remove: (id: number) => request(`/drivers/${id}`, { method: 'DELETE' }),
  },

  maintenance: {
    list: (params = {}) => request(`/maintenance${qs(params)}`),
    get: (id: number) => request(`/maintenance/${id}`),
    create: (payload: any) => request('/maintenance', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id: number, payload: any) => request(`/maintenance/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    remove: (id: number) => request(`/maintenance/${id}`, { method: 'DELETE' }),
  },

  groups: {
    list: (params = {}) => request(`/groups${qs(params)}`),
    get: (id: number) => request(`/groups/${id}`),
    create: (payload: any) => request('/groups', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id: number, payload: any) => request(`/groups/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    remove: (id: number) => request(`/groups/${id}`, { method: 'DELETE' }),
  },

  geofences: {
    list: (params = {}) => request(`/geofences${qs(params)}`),
    get: (id: number) => request(`/geofences/${id}`),
    create: (payload: any) => request('/geofences', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id: number, payload: any) => request(`/geofences/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    remove: (id: number) => request(`/geofences/${id}`, { method: 'DELETE' }),
  },

  orders: {
    list: (params = {}) => request(`/orders${qs(params)}`),
    get: (id: number) => request(`/orders/${id}`),
    create: (payload: any) => request('/orders', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id: number, payload: any) => request(`/orders/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    remove: (id: number) => request(`/orders/${id}`, { method: 'DELETE' }),
  },

  notifications: {
    list: (params = {}) => request(`/notifications${qs(params)}`),
    get: (id: number) => request(`/notifications/${id}`),
    create: (payload: any) => request('/notifications', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id: number, payload: any) => request(`/notifications/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    remove: (id: number) => request(`/notifications/${id}`, { method: 'DELETE' }),
    types: () => request('/notifications/types'),
    notificators: (params = {}) => request(`/notifications/notificators${qs(params)}`),
    test: () => request('/notifications/test', { method: 'POST' }),
    testNotificator: (notificator: string) =>
      request('/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ notificator }).toString(),
      }),
    send: (notificator: string, userIds: number[], body: any) =>
      request('/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ notificator, userIds: userIds.join(','), body: String(body) }).toString(),
      }),
  },

  commands: {
    list: (params = {}) => request(`/commands${qs(params)}`),
    get: (id: number) => request(`/commands/${id}`),
    create: (payload: any) => request('/commands', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id: number, payload: any) => request(`/commands/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    remove: (id: number) => request(`/commands/${id}`, { method: 'DELETE' }),
    send: (payload: any, groupId?: number) =>
      request(`/commands/send${groupId ? `?groupId=${groupId}` : ''}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    getSendList: (deviceId: number) =>
      request(`/commands/send?deviceId=${deviceId}`),
    types: (deviceId: number, textChannel?: string) =>
      request(`/commands/types?deviceId=${deviceId}${textChannel ? `&textChannel=${encodeURIComponent(textChannel)}` : ''}`),
  },

  calendars: {
    list: (params = {}) => request(`/calendars${qs(params)}`),
    get: (id: number) => request(`/calendars/${id}`),
    create: (payload: any) => request('/calendars', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id: number, payload: any) => request(`/calendars/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    remove: (id: number) => request(`/calendars/${id}`, { method: 'DELETE' }),
  },

  computedAttributes: {
    list: (params = {}) => request(`/attributes/computed${qs(params)}`),
    get: (id: number) => request(`/attributes/computed/${id}`),
    create: (payload: any) => request('/attributes/computed', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id: number, payload: any) => request(`/attributes/computed/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    remove: (id: number) => request(`/attributes/computed/${id}`, { method: 'DELETE' }),
    test: (deviceId: number, payload: any) =>
      request(`/attributes/computed/test?deviceId=${deviceId}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  },

  events: {
    get: (id: number) => request(`/events/${id}`),
  },

  reports: {
    trips: (params: any) => request(`/reports/trips${qs(params)}`),
    events: (params: any) => request(`/reports/events${qs(params)}`),
    stops: (params: any) => request(`/reports/stops${qs(params)}`),
    summary: (params: any) => request(`/reports/summary${qs(params)}`),
    route: (params: any) => request(`/reports/route${qs(params)}`),
    combined: (params: any) => request(`/reports/combined${qs(params)}`),
    chart: (params: any) => request(`/reports/chart${qs(params)}`),
    statistics: (params: any) => request(`/reports/statistics${qs(params)}`),
    geofences: (params: any) => request(`/reports/geofences${qs(params)}`),
    routeDownload: (type: string, params: any) =>
      request(`/reports/route/${type}${qs(params)}`),
    eventsDownload: (type: string, params: any) =>
      request(`/reports/events/${type}${qs(params)}`),
    summaryDownload: (type: string, params: any) =>
      request(`/reports/summary/${type}${qs(params)}`),
    tripsDownload: (type: string, params: any) =>
      request(`/reports/trips/${type}${qs(params)}`),
    stopsDownload: (type: string, params: any) =>
      request(`/reports/stops/${type}${qs(params)}`),
    devicesDownload: (type: string) => request(`/reports/devices/${type}`),
  },

  audit: {
    list: (params = {}) => request(`/audit${qs(params)}`),
  },

  logs: {
    list: (params = {}) => request(`/logs${qs(params)}`),
  },

  scheduledReports: {
    list: () => request('/reports'),
    get: (id: number) => request(`/reports/${id}`),
    create: (payload: any) => request('/reports', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id: number, payload: any) => request(`/reports/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    remove: (id: number) => request(`/reports/${id}`, { method: 'DELETE' }),
  },

  statistics: {
    list: (params = {}) => request(`/statistics${qs(params)}`),
  },

  stream: {
    playlist: (deviceId: number, channel: string) =>
      request(`/stream/${deviceId}/playlist.m3u8?channel=${encodeURIComponent(channel)}`),
    segment: (deviceId: number, channel: string, index: number) =>
      request(`/stream/${deviceId}/${channel}/segments/${index}`),
  },
};
