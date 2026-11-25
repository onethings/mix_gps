// Variant of replay-zoom-repro.mjs: the route report is slow (MOCK_ROUTE_DELAY_MS), so the
// page shows the route restored from localStorage first and the user zooms in before the
// real fetch lands. Records every camera-moving call with a stack so the culprit is named.
// Prereqs: mock Traccar on :8099 (slow route) + vite dev on :3099 -> mock.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9334;
const APP = process.env.APP_URL || 'http://localhost:3099';
const DEVICE_ID = 2826;
const DATE = '2026-08-10';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForJson(url) {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error(`chrome endpoint never answered: ${url}`);
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (!msg.id) {
        if (msg.method === 'Runtime.consoleAPICalled') {
          (globalThis.__console ||= []).push(msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' '));
        }
        if (msg.method === 'Runtime.exceptionThrown') {
          (globalThis.__console ||= []).push('EXCEPTION ' + (msg.params.exceptionDetails.exception?.description || '') );
        }
        if (msg.method === 'Network.responseReceived') {
          const r = msg.params.response;
          if (r.url.includes('/api/')) (globalThis.__net ||= []).push(`${r.status} ${r.url.replace(/^.*\/api/, '/api')}`);
        }
        return;
      }
      const waiter = this.pending.get(msg.id);
      if (!waiter) return;
      this.pending.delete(msg.id);
      if (msg.error) waiter.reject(new Error(msg.error.message));
      else waiter.resolve(msg.result);
    };
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => { if (this.pending.delete(id)) reject(new Error(`${method} timed out`)); }, 30000);
    });
  }
}

// A stale route the user "came back to" (saved replay state), shorter than what the fetch returns.
const savedRoute = Array.from({ length: 120 }, (_, i) => {
  const t = i / 119;
  return {
    latitude: Number((16.78 + t * 0.42).toFixed(6)),
    longitude: Number((96.05 + t * 0.38).toFixed(6)),
    speed: 24, course: 45, altitude: 12, fixTime: `${DATE}T00:00:00Z`,
  };
});

async function main() {
  const profile = mkdtempSync(join(tmpdir(), 'replay-repro2-'));
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profile}`,
    '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
    '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--window-size=1280,900', 'about:blank',
  ], { stdio: 'ignore' });

  try {
    await waitForJson(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    const target = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?url=about:blank`, { method: 'PUT' })).json();
    const ws = new WebSocket(target.webSocketDebuggerUrl.replace('localhost', '127.0.0.1'));
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('ws open timeout')), 10000);
      ws.onopen = () => { clearTimeout(timer); resolve(); };
      ws.onerror = () => { clearTimeout(timer); reject(new Error('ws error')); };
    });
    const cdp = new Cdp(ws);

    const evaluate = async (expression) => {
      const res = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || 'eval failed');
      return res.result.value;
    };

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `try { localStorage.setItem('replay-state-${DEVICE_ID}', ${JSON.stringify(JSON.stringify({
        deviceId: String(DEVICE_ID), selectedDate: DATE, calYear: 2026, calMonth: 7,
        cursor: 0, speed: 1, route: savedRoute,
      }))}); } catch (e) {}`,
    });
    await cdp.send('Page.navigate', { url: `${APP}/replay?deviceId=${DEVICE_ID}` });

    let ready = false;
    for (let i = 0; i < 200; i++) {
      ready = await evaluate(`!!(window.__replayMap && window.__replayMap.getContainer)`);
      if (ready) break;
      await sleep(150);
    }
    if (!ready) throw new Error('map never appeared');

    // Instrument every camera call that could move the zoom.
    await evaluate(`(() => {
      const m = window.__replayMap;
      window.__calls = [];
      for (const name of ['fitBounds', 'easeTo', 'jumpTo', 'flyTo', 'setStyle', 'setPadding', 'resize']) {
        const orig = m[name].bind(m);
        m[name] = (...args) => {
          const before = m.getZoom();
          const stack = new Error().stack.split('\\n').slice(1, 4).join(' | ');
          const out = orig(...args);
          window.__calls.push({ name, before: +before.toFixed(3), after: +m.getZoom().toFixed(3), stack });
          return out;
        };
      }
      return true;
    })()`);

    // User zooms in while the slow route report is still in flight.
    await sleep(1500);
    await evaluate(`(() => { window.__replayMap.jumpTo({ center: [96.05, 16.78], zoom: 16 }); return true; })()`);
    const afterZoom = await evaluate(`+window.__replayMap.getZoom().toFixed(3)`);

    const samples = [];
    for (let i = 0; i < 20; i++) {
      await sleep(1000);
      const snap = await evaluate(`(() => {
        const m = window.__replayMap;
        if (!m) return { zoom: null, alive: false, id: null };
        if (!m.__dbgId) m.__dbgId = Math.random().toString(36).slice(2, 7);
        return { zoom: +m.getZoom().toFixed(3), alive: !!m.style, id: m.__dbgId };
      })()`);
      samples.push(snap);
    }

    const calls = await evaluate(`window.__calls`);
    const offending = calls.filter((c) => Math.abs(c.after - c.before) > 0.01);
    const routeSource = await evaluate(`(() => { try { return !!window.__replayMap.getSource('route'); } catch { return 'map-gone'; } })()`);
    console.log(JSON.stringify({
      routeSource,
      net: globalThis.__net,
      console: (globalThis.__console || []).slice(0, 20),
      afterZoom,
      samples,
      resetHappened: samples.some((z) => Math.abs(z - afterZoom) > 0.01),
      zoomChangingCalls: offending,
      allCalls: calls.map((c) => `${c.name}:${c.before}->${c.after}`),
    }, null, 2));
  } finally {
    chrome.kill('SIGKILL');
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('REPRO2 FAILED:', err.message);
  process.exit(1);
});
