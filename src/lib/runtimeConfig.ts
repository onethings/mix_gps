/**
 * ─────────────────────────────────────────────────────────────
 * Runtime Traccar server resolution
 * ─────────────────────────────────────────────────────────────
 * Lets ONE production build (`npm run build`) serve multiple
 * Cloudflare Pages deployments, each connected to a different
 * Traccar server, WITHOUT rebuilding or re-uploading per site.
 *
 * Resolution order (highest priority first):
 *   1. localStorage override  (`mixok-traccar-server`)  ← testing only
 *   2. Hostname → server table (per-deployment mapping)
 *   3. Build-time env fallback (`VITE_TRACCAR_URL`)
 *   4. Same-origin `/api` (default)
 *
 * To add a new deployment later, just add one row to
 * `HOSTNAME_SERVERS` and rebuild — no per-site config needed.
 * ─────────────────────────────────────────────────────────────
 */

export interface RuntimeServer {
  /** Traccar API origin, e.g. 'https://demo.shwegps.com' (direct) or 'https://demo3.polarisfleet.com' (proxy). */
  url: string;
  /** Optional explicit WebSocket URL. Defaults to `url` with http→ws + `/api/socket`. */
  wsUrl?: string;
}

/**
 * Deployment hostname → Traccar server.
 * - demo3.traccar.org  is reached via the `demo3.polarisfleet.com` proxy.
 * - demo.shwegps.com   is reached directly (server CORS is `*`).
 */
const HOSTNAME_SERVERS: Record<string, RuntimeServer> = {
  // ── demo3.traccar.org（經 proxy）──
  'live.polarisfleet.com': { url: 'https://demo3.polarisfleet.com' },
  'fleetlymm.pages.dev': { url: 'https://demo3.polarisfleet.com' },

  // ── demo.shwegps.com（直連，無 proxy）──
  'mm.polarisfleet.com': { url: 'https://demo.shwegps.com' },
  'us.polarisfleet.com': { url: 'https://demo.shwegps.com' },
};

export const RUNTIME_OVERRIDE_KEY = 'mixok-traccar-server';

function currentHost(): string {
  if (typeof window === 'undefined') return '';
  return window.location.hostname.toLowerCase().trim();
}

function normalize(server: RuntimeServer): RuntimeServer {
  return {
    url: server.url.trim().replace(/\/+$/, ''),
    wsUrl: server.wsUrl ? server.wsUrl.trim().replace(/\/+$/, '') : undefined,
  };
}

/** Highest-priority server from the runtime override (localStorage). */
export function getRuntimeOverride(): RuntimeServer | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(RUNTIME_OVERRIDE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RuntimeServer;
    if (parsed && typeof parsed.url === 'string' && parsed.url.trim()) {
      return normalize(parsed);
    }
  } catch { /* malformed override — ignore */ }
  return null;
}

/** Set / clear the runtime server override (useful for testing, e.g. in console). */
export function setRuntimeOverride(server: RuntimeServer | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!server) {
      window.localStorage.removeItem(RUNTIME_OVERRIDE_KEY);
    } else {
      window.localStorage.setItem(RUNTIME_OVERRIDE_KEY, JSON.stringify(normalize(server)));
    }
  } catch { /* storage unavailable */ }
}

/** Resolve the current runtime server (override → hostname → env fallback). */
export function getRuntimeServer(): RuntimeServer | null {
  const override = getRuntimeOverride();
  if (override) return override;

  const found = HOSTNAME_SERVERS[currentHost()];
  if (found) return normalize(found);

  const raw = import.meta.env.VITE_TRACCAR_URL;
  if (raw && String(raw).trim()) {
    return { url: String(raw).trim().replace(/\/+$/, '') };
  }

  return null;
}

/** API origin used to build `${origin}/api` request URLs ('' ⇒ same-origin `/api`). */
export function resolveApiOrigin(): string {
  return getRuntimeServer()?.url ?? '';
}

/** WebSocket URL for live position streaming ('' ⇒ same-origin `/api/socket`). */
export function resolveWsUrl(): string {
  const server = getRuntimeServer();
  if (server?.wsUrl) return server.wsUrl;
  if (server?.url) return `${server.url.replace(/^http/, 'ws')}/api/socket`;
  return '';
}
