// Reproduces the replay zoom reset on the real ReplayPage.
// Prerequisites (started separately): the mock Traccar on :8099 and a vite dev server on :3099
// with VITE_TRACCAR_URL=http://127.0.0.1:8099. The camera is read through the dev-only
// window.__replayMap handle that ReplayPage exposes under import.meta.env.DEV.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9500 + Math.floor(Math.random() * 400);
const APP = process.env.APP_URL || 'http://localhost:3099';
const DEVICE_ID = 2826;
const DATE = '2026-08-10';

const note = (m) => process.stderr.write(`[repro] ${m}\n`);
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
        if (msg.method === 'Runtime.consoleAPICalled') note(`[page:${msg.params.type}] ${(msg.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ').slice(0, 300)}`);
        if (msg.method === 'Runtime.exceptionThrown') note(`[page:exception] ${(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text || '').slice(0, 400)}`);
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

async function main() {
  const profile = mkdtempSync(join(tmpdir(), 'replay-repro-'));
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profile}`,
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--enable-unsafe-swiftshader',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,900',
    'about:blank',
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
      const res = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }).catch((e) => {
        throw new Error(`eval failed for <<${expression.slice(0, 120)}>>: ${e.message}`);
      });
      if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || 'eval failed');
      return res.result.value;
    };

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `try { localStorage.setItem('replay-state-${DEVICE_ID}', ${JSON.stringify(JSON.stringify({
        deviceId: String(DEVICE_ID), selectedDate: DATE, calYear: 2026, calMonth: 7, cursor: 0, speed: 1,
      }))}); } catch (e) {}`,
    });
    note(`navigating ${APP}`);
    await cdp.send('Page.navigate', { url: `${APP}/replay?deviceId=${DEVICE_ID}` });

    let ready = false;
    for (let i = 0; i < 300; i++) {
      ready = await evaluate(`(() => { try { const m = window.__replayMap; return !!(m && m.getSource('route')); } catch { return false; } })()`);
      if (ready) break;
      await sleep(200);
    }
    note(`route ready=${ready}`);
    if (!ready) {
      const diag = await evaluate(`JSON.stringify({ href: location.href, body: document.body.innerText.slice(0, 300) })`);
      throw new Error(`route source never appeared: ${diag}`);
    }

    await evaluate(`(() => {
      const m = window.__replayMap;
      window.__zoomLog = [];
      window.__routeRedraws = 0;
      m.on('zoomend', () => window.__zoomLog.push(Number(m.getZoom().toFixed(3))));
      m.on('sourcedata', (e) => { if (e.sourceId === 'route') window.__routeRedraws += 1; });
      window.__routeStart = [96.05, 16.78];
      return true;
    })()`);

    const pointCount = await evaluate(`window.__replayMap.querySourceFeatures('route').length`);
    const fitZoom = await evaluate(`Number(window.__replayMap.getZoom().toFixed(3))`);
    const routeStart = await evaluate(`window.__routeStart`);

    // The user zooms in on the start of the route, where the marker already sits.
    await evaluate(`(() => { window.__replayMap.jumpTo({ center: ${JSON.stringify(routeStart)}, zoom: 16 }); return true; })()`);
    const afterZoom = await evaluate(`Number(window.__replayMap.getZoom().toFixed(3))`);

    note(`zoomed to ${afterZoom} (fit was ${fitZoom})`);
    const samples = [];
    for (let i = 0; i < 14; i++) {
      await sleep(1000);
      samples.push(await evaluate(`Number(window.__replayMap.getZoom().toFixed(3))`));
    }

    const zoomEvents = await evaluate(`window.__zoomLog`);
    const routeRedraws = await evaluate(`window.__routeRedraws`);
    const geocodeRequests = await evaluate(`performance.getEntriesByType('resource').filter((e) => e.name.includes('/geocode/reverse')).length`);
    console.log(JSON.stringify({
      pointCount, routeRedraws, geocodeRequests, fitZoom, afterZoom, samples,
      resetHappened: samples.some((z) => Math.abs(z - afterZoom) > 0.01),
      zoomEvents,
    }, null, 2));
    process.exit(0);
  } finally {
    chrome.kill('SIGKILL');
  }
}

main().catch((err) => {
  console.error('REPRO FAILED:', err.message);
  process.exit(1);
});
