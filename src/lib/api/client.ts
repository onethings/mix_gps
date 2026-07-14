// Core API client — request(), WebSocket, shared helpers
import { ApiError } from '@/lib/apiError';

function apiBase() {
  if (import.meta.env.DEV) return '/api';
  const raw = import.meta.env.VITE_TRACCAR_URL;
  if (!raw || !String(raw).trim()) return '/api';
  const trimmed = String(raw).trim();
  try {
    if (typeof window !== 'undefined') {
      const apiOrigin = new URL(trimmed).origin;
      if (apiOrigin === window.location.origin) return '/api';
    }
  } catch { /* invalid VITE_TRACCAR_URL */ }
  return `${trimmed.replace(/\/$/, '')}/api`;
}

export const BASE = apiBase();
export const OPENID_AUTH_URL = `${BASE}/session/openid/auth`;

export function qs(params: Record<string, any> = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v == null) return;
    if (Array.isArray(v)) v.forEach((item) => search.append(k, item));
    else search.append(k, v as string);
  });
  const str = search.toString();
  return str ? `?${str}` : '';
}

function parseErrorBodyText(text: string) {
  try { return JSON.parse(text); }
  catch { return text; }
}

function messageFromBody(body: any, fallback: string) {
  if (body == null) return fallback;
  if (typeof body === 'string') return body || fallback;
  if (typeof body === 'object' && body.message) return String(body.message);
  return fallback;
}

export async function request(path: string, opts: Record<string, any> = {}) {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(opts.body && !opts.headers?.['Content-Type']
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...(opts.headers || {}),
      },
      ...opts,
    });
  } catch (e: any) {
    const err = new ApiError(e.message || 'Network error', { status: 0 });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fleet-api-error', { detail: err }));
    }
    throw err;
  }

  if (!res.ok) {
    if (res.status === 401 && res.headers.get('WWW-Authenticate') === 'TOTP') {
      throw new ApiError('TOTP required', { status: 401, needsTotp: true });
    }
    const text = await res.text().catch(() => '');
    const ct = res.headers.get('content-type') || '';
    const body = ct.includes('application/json') ? parseErrorBodyText(text) : text;
    const msg = messageFromBody(body, `${res.status} ${res.statusText}`);
    const err = new ApiError(msg, { status: res.status, body, raw: text });

    if (typeof window !== 'undefined' && res.status === 403) {
      window.dispatchEvent(new CustomEvent('fleet-api-error', { detail: err }));
    }

    const isLoginPost = path === '/session' && (opts.method === 'POST' || opts.method === 'post');
    const isTokenLoginAttempt = path.includes('token=');
    const pathOnly = path.split('?')[0];
    const isSessionProbe = (!opts.method || opts.method === 'GET') && pathOnly === '/session';
    const isSessionLogout = String(opts.method || '').toUpperCase() === 'DELETE' && pathOnly === '/session';

    if (
      typeof window !== 'undefined' &&
      res.status === 401 &&
      !isLoginPost && !isTokenLoginAttempt && !isSessionProbe && !isSessionLogout
    ) {
      window.dispatchEvent(new CustomEvent('fleet-session-expired'));
    }
    throw err;
  }
  if (res.status === 204) return null;
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.text();
}

export function openSocket(onMessage: (frame: any) => void): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = import.meta.env.DEV
    ? `${protocol}//${window.location.host}/api/socket`
    : (() => {
        // 1. 優先使用 VITE_WS_URL（直接用 Traccar WebSocket，繞過 proxy）
        const wsUrl = import.meta.env.VITE_WS_URL;
        if (wsUrl && String(wsUrl).trim()) {
          return String(wsUrl).trim().replace(/\/$/, '');
        }
        // 2. 從 VITE_TRACCAR_URL 推導 WebSocket URL
        const raw = import.meta.env.VITE_TRACCAR_URL;
        if (raw && String(raw).trim()) {
          const base = String(raw).trim().replace(/\/$/, '');
          const wsBase = base.replace(/^http/, 'ws');
          return `${wsBase}/api/socket`;
        }
        // 3. 同源
        return `${protocol}//${window.location.host}/api/socket`;
      })();

  // Read JSESSIONID from cookie for production environments
  const cookies = document.cookie.split(';').reduce<Record<string, string>>((acc, c) => {
    const [key, ...rest] = c.trim().split('=');
    if (key) acc[key] = rest.join('=');
    return acc;
  }, {});
  const jsessionId = cookies['JSESSIONID'];
  const url = jsessionId ? `${host}?JSESSIONID=${encodeURIComponent(jsessionId)}` : host;

  const socket = new WebSocket(url);
  socket.addEventListener('message', (event) => {
    try {
      const frame = JSON.parse(event.data);
      onMessage(frame);
    } catch { /* skip malformed frames */ }
  });
  return socket;
}
