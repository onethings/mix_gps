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

/**
 * ── Error handling helpers ──────────────────────────────────────────────
 * Inspired by traccar-web-master's ErrorHandler + fetchOrThrow pattern.
 * Rather than slavishly copying, we standardise sanitisation at the
 * network layer so raw Java stack traces / HTML error pages never reach
 * the UI.  The result is a clear, short message for every HTTP error code
 * the Traccar server can return (see openapi.yaml).
 */

/** Check if text looks like an HTML page (including Java error pages) */
function isHtml(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith('<!') || trimmed.startsWith('<html') || trimmed.startsWith('<HTML');
}

/** Check if a string looks like a Java exception / stack trace */
function isJavaStackTrace(text: string): boolean {
  return /^\s*(?:jakarta\.|java\.|org\.traccar\.|org\.apache\.)[a-zA-Z]/.test(text.trim());
}

/**
 * Strip Java exception prefixes from the first line, like traccar-web-master's
 * ErrorHandler does:
 *   "jakarta.ws.rs.WebApplicationException: HTTP 401 Unauthorized"  →  "HTTP 401 Unauthorized"
 *   "java.lang.IllegalArgumentException: bad request"               →  "bad request"
 */
function stripJavaPrefix(text: string): string {
  return text.replace(/^(?:(?:[\w$]+\.)*[\w$]+(?:Exception|Error)?:\s*)+/i, '');
}

/**
 * HTTP status-code → context-aware friendly description.
 * These are modelled on the descriptions in openapi.yaml.
 */
const STATUS_LABELS: Record<number, string> = {
  400: 'Bad request',
  401: 'Unauthorized — please check your credentials',
  403: 'Forbidden — you do not have permission',
  404: 'Not found',
  405: 'Method not allowed',
  409: 'Conflict — the resource already exists',
  422: 'Invalid data',
  429: 'Too many requests — please slow down',
  500: 'Server error — please try again later',
  502: 'Bad gateway — upstream server error',
  503: 'Service unavailable — please try again later',
  504: 'Gateway timeout — upstream server timed out',
};

const STATUS_LABEL_FALLBACK = 'Request failed';

/**
 * Build a user-safe error message from a raw server response body.
 *
 * Strategy (derived from traccar-web-master practices):
 *  1. HTML / Java stack trace → discard body, use status label
 *  2. Valid JSON with `.message` → use that (server-authored error)
 *  3. Plain text → strip Java prefix, take first line only
 *  4. Empty / unparseable → status label
 */
function sanitizeBody(rawText: string, status: number, ct: string): string {
  const label = STATUS_LABELS[status] || `${status} ${statusTextFor(status)}`;

  if (!rawText) return label;

  // ── HTML / Java stack trace → never show to user ──
  if (isHtml(rawText) || isJavaStackTrace(rawText)) {
    return label;
  }

  // ── JSON payload ──
  if (ct.includes('application/json')) {
    try {
      const obj = JSON.parse(rawText);
      if (typeof obj === 'string') return obj || label;
      if (obj?.message) return String(obj.message);
    } catch { /* malformed JSON — fall through */ }
  }

  // ── Plain / unknown text ──
  // Strip Java exception prefix (e.g. "java.lang.Exception: msg" → "msg")
  // then take only the first line so multi-line stack traces are suppressed.
  const clean = stripJavaPrefix(rawText.trim()).split('\n')[0].slice(0, 200);
  return clean || label;
}

function statusTextFor(status: number): string {
  return STATUS_LABELS[status] || STATUS_LABEL_FALLBACK;
}

function parseErrorBodyText(text: string) {
  try { return JSON.parse(text); }
  catch { return text; }
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
    // For login failures, always show a clean generic message instead of any server output
    const isLoginPost = path === '/session' && (opts.method === 'POST' || opts.method === 'post');
    let msg: string;
    if (res.status === 401 && isLoginPost) {
      msg = 'Invalid email or password';
    } else {
      msg = sanitizeBody(text, res.status, ct);
    }
    const body = ct.includes('application/json') ? parseErrorBodyText(text) : text;
    const err = new ApiError(msg, { status: res.status, body, raw: text });

    if (typeof window !== 'undefined' && res.status === 403) {
      window.dispatchEvent(new CustomEvent('fleet-api-error', { detail: err }));
    }

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
