// Drives the real replay page in headless Chrome against the mock Traccar:
// screenshots it, inspects the transport bar (the range slider), and measures playback
// frame pacing. Usage:
//   node scripts/replay-inspect.mjs --viewport 1280x900 --shot /tmp/replay.png [--play] [--seconds 8]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9336;
const APP = process.env.APP_URL || 'http://localhost:3101';
const DEVICE_ID = '2826';
const DATE = '2026-08-10';

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : dflt;
};
const has = (name) => argv.includes(`--${name}`);

const [vw, vh] = (arg('viewport', '1280x900')).split('x').map(Number);
const shotPath = arg('shot', '');
const playing = has('play');
const seconds = Number(arg('seconds', '8'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForJson(url) {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch { /* not up */ }
    await sleep(200);
  }
  throw new Error(`chrome endpoint never answered: ${url}`);
}

async function main() {
  const profile = mkdtempSync(join(tmpdir(), 'replay-inspect-'));
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profile}`,
    '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
    '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    `--window-size=${vw},${vh}`, 'about:blank',
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

    let nextId = 0;
    const pending = new Map();
    const errors = [];
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (pending.delete(id)) reject(new Error(`${method} timed out`)); }, 40000);
    });
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id) {
        const waiter = pending.get(msg.id);
        if (!waiter) return;
        pending.delete(msg.id);
        if (msg.error) waiter.reject(new Error(msg.error.message));
        else waiter.resolve(msg.result);
        return;
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        errors.push((msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text || '').slice(0, 300));
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        errors.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
      }
    };

    const evaluate = async (expression) => {
      const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (res.exceptionDetails) throw new Error('eval threw: ' + (res.exceptionDetails.exception?.description || res.exceptionDetails.text));
      return res.result.value;
    };

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: vw, height: vh, deviceScaleFactor: 2, mobile: vw < 768,
    });
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `try { localStorage.setItem('Kevin GPS .theme', ${JSON.stringify(arg('theme', 'light'))}); } catch (e) {}
      try { localStorage.setItem('replay-state-${DEVICE_ID}', ${JSON.stringify(JSON.stringify({
        deviceId: DEVICE_ID, selectedDate: DATE, calYear: 2026, calMonth: 7, cursor: 0, speed: 1,
      }))}); } catch (e) {}`,
    });
    await send('Page.navigate', { url: `${APP}/replay?deviceId=${DEVICE_ID}` });

    let ready = false;
    const seen = new Set();
    for (let i = 0; i < 200; i++) {
      const probe = await evaluate(`(() => {
        const m = window.__replayMap;
        if (!m) return { alive: false, route: false, id: null };
        if (!m.__probeId) m.__probeId = Math.random().toString(36).slice(2, 7);
        let route = false;
        try { route = !!m.getSource('route'); } catch (e) { return { alive: false, route: false, id: m.__probeId }; }
        return { alive: true, route, id: m.__probeId };
      })()`);
      if (probe.id) seen.add(probe.id);
      ready = probe.alive && probe.route;
      if (ready) break;
      await sleep(200);
    }
    if (!ready) {
      const diag = await evaluate(`JSON.stringify({
        href: location.href,
        text: document.body.innerText.slice(0, 200),
        hasMap: !!window.__replayMap,
        mapAlive: !!(window.__replayMap && window.__replayMap.style),
        instances: ${'${JSON.stringify([...seen])}'},
      })`);
      throw new Error('route never drew: ' + diag);
    }
    if (seen.size > 1) console.error(`NOTE: ${seen.size} map instances were created (remount detected)`);

    await sleep(800);

    const bar = await evaluate(`(() => {
      const slider = document.querySelector('input[type="range"]');
      const out = { slider: null, barRow: null, buttons: [] };
      if (slider) {
        const r = slider.getBoundingClientRect();
        const cs = getComputedStyle(slider);
        const track = getComputedStyle(slider, '::-webkit-slider-runnable-track');
        out.slider = {
          rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
          offsetParent: !!slider.offsetParent,
          display: cs.display, appearance: cs.appearance, height: cs.height, width: cs.width,
          opacity: cs.opacity, visibility: cs.visibility, background: cs.backgroundColor,
          accentColor: cs.accentColor, min: slider.min, max: slider.max, value: slider.value,
          trackHeight: track.height, trackBg: track.backgroundColor,
        };
      }
      const barEl = slider ? slider.parentElement : null;
      if (barEl) {
        const br = barEl.getBoundingClientRect();
        out.barRow = { y: Math.round(br.y), h: Math.round(br.height), cls: barEl.className.slice(0, 120) };
      }
      return out;
    })()`);

    const seek = Number(arg('seek', '-1'));
    if (bar.slider && seek >= 0) {
      const r = bar.slider.rect;
      const x = r.x + Math.round(r.w * (seek / 100));
      const y = r.y + r.h / 2;
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      await sleep(400);
      const st = await evaluate(`(() => { const s = document.querySelector('input[type="range"]'); return s ? { value: s.value } : null; })()`);
      bar.afterSeek = { clickedX: x, ...st };
    }

    // Painted-pixel probe: capture the slider strip and report its dominant colours, so a
    // white-on-white track (invisible bar) shows up as a fact rather than a guess.
    let sliderPixels = null;
    if (bar.slider) {
      const r = bar.slider.rect;
      const clipShot = await send('Page.captureScreenshot', {
        format: 'png',
        clip: { x: r.x, y: Math.max(0, r.y - 2), width: r.w, height: Math.max(4, r.h + 4), scale: 1 },
      });
      sliderPixels = await evaluate(`(async () => {
        const blob = await (await fetch('data:image/png;base64,${clipShot.data}')).blob();
        const img = await createImageBitmap(blob);
        const c = new OffscreenCanvas(img.width, img.height);
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const out = [];
        for (const y of [0, Math.floor(img.height / 2), img.height - 1]) {
          const row = ctx.getImageData(0, y, img.width, 1).data;
          const hist = new Map();
          for (let x = 0; x < img.width; x += 2) {
            const i = x * 4;
            const k = row[i] + ',' + row[i + 1] + ',' + row[i + 2];
            hist.set(k, (hist.get(k) || 0) + 1);
          }
          out.push({ y, top: [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4) });
        }
        return out;
      })()`);
    }

    if (has('profile')) {
      await send('Profiler.enable');
      await send('Profiler.setSamplingInterval', { interval: 200 });
    }

    // Chart probe: confirm both canvas layers actually paint (series + cursor overlay).
    const chart = await evaluate(`(() => {
      const canvases = [...document.querySelectorAll('canvas')].filter((c) => c.className.includes('h-full'));
      return canvases.map((c) => {
        const ctx = c.getContext('2d');
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        const hist = new Map();
        let painted = 0;
        for (let i = 0; i < d.length; i += 4 * 7) {
          if (d[i + 3] === 0) continue;
          painted++;
          const k = [d[i], d[i + 1], d[i + 2]].join(',');
          hist.set(k, (hist.get(k) || 0) + 1);
        }
        return {
          size: [c.width, c.height],
          paintedSamples: painted,
          top: [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4),
          hasRedCursor: [...hist.keys()].some((k) => k.startsWith('239,68,') || k === '239,68,68'),
          hasBlueLine: [...hist.keys()].some((k) => k.startsWith('59,130,2')),
        };
      });
    })()`);

    if (playing) {
      const speed = Number(arg('speed', '0'));
      if (speed > 0) {
        await evaluate(`(() => {
          const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '${speed}×');
          if (btn) btn.click();
          return !!btn;
        })()`);
        await sleep(200);
      }
      await evaluate(`(() => {
        const btn = document.querySelector('svg.lucide-play')?.closest('button');
        if (btn) btn.click();
        return !!btn;
      })()`);
      // Measure playback frame pacing + long tasks for N seconds.
      await evaluate(`(() => {
        window.__frames = [];
        window.__long = [];
        let last = performance.now();
        const tick = (t) => { window.__frames.push(t - last); last = t; if (window.__frames.length < 100000) requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
        window.__t0 = performance.now();
        window.__longObs = new PerformanceObserver((l) => {
          for (const e of l.getEntries()) window.__long.push({ ms: Math.round(e.duration), at: Math.round(e.startTime - window.__t0) });
        });
        try { window.__longObs.observe({ entryTypes: ['longtask'] }); } catch (e) {}
        return true;
      })()`);
      await send('Performance.enable');
      const m1 = await send('Performance.getMetrics');
      const get = (m, n) => (m.metrics.find((x) => x.name === n) || {}).value || 0;
      globalThis.__m0 = {
        script: get(m1, 'ScriptDuration'), layout: get(m1, 'LayoutDuration'),
        style: get(m1, 'RecalcStyleDuration'), task: get(m1, 'TaskDuration'),
      };
      if (has('rate')) {
        const readValue = () => evaluate(`Number(document.querySelector('input[type="range"]').value)`);
        const v0 = await readValue();
        const t0 = Date.now();
        await sleep(4000);
        const v1 = await readValue();
        globalThis.__rate = { pointsPerSec: +(((v1 - v0) / ((Date.now() - t0) / 1000)).toFixed(2)) };
        await sleep(Math.max(0, seconds * 1000 - 4000));
      } else {
        await sleep(seconds * 1000);
      }
    }

    let metrics = null;
    if (playing) {
      const m2 = await send('Performance.getMetrics');
      const get = (m, n) => (m.metrics.find((x) => x.name === n) || {}).value || 0;
      metrics = {
        scriptMs: Math.round((get(m2, 'ScriptDuration') - (globalThis.__m0?.script || 0)) * 1000),
        layoutMs: Math.round((get(m2, 'LayoutDuration') - (globalThis.__m0?.layout || 0)) * 1000),
        styleMs: Math.round((get(m2, 'RecalcStyleDuration') - (globalThis.__m0?.style || 0)) * 1000),
        taskMs: Math.round((get(m2, 'TaskDuration') - (globalThis.__m0?.task || 0)) * 1000),
        nodes: get(m2, 'Nodes'),
      };
    }

    let profile = null;
    if (has('profile')) {
      await send('Profiler.start');
      await sleep(5000);
      const { profile: prof } = await send('Profiler.stop');
      const byId = new Map(prof.nodes.map((n) => [n.id, n]));
      const self = new Map();
      const total = new Map();
      for (const n of prof.nodes) {
        const cf = n.callFrame;
        const key = (cf.functionName || '(anonymous)') + ' @ ' + (cf.url || '').replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '') + ':' + (cf.lineNumber + 1);
        total.set(key, 0);
      }
      const counts = new Map();
      for (const id of prof.samples || []) counts.set(id, (counts.get(id) || 0) + 1);
      const dt = prof.timeDeltas ? prof.timeDeltas.reduce((a, b) => a + b, 0) / 1000 : 0;
      const pct = new Map();
      for (const [id, c] of counts) {
        const n = byId.get(id);
        if (!n) continue;
        const cf = n.callFrame;
        const key = (cf.functionName || '(anonymous)') + ' @ ' + (cf.url || '').replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '') + ':' + (cf.lineNumber + 1);
        pct.set(key, (pct.get(key) || 0) + c);
      }
      const totalSamples = (prof.samples || []).length || 1;
      profile = [...pct.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 18)
        .map(([k, c]) => ({ fn: k, pct: +((c / totalSamples) * 100).toFixed(1) }));
      void self; void total; void dt;
    }

    if (shotPath) {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
    }

    const perf = playing ? await evaluate(`(() => {
      const f = window.__frames.slice(5);
      const sorted = [...f].sort((a, b) => a - b);
      const q = (p) => sorted.length ? +sorted[Math.floor((sorted.length - 1) * p)].toFixed(1) : null;
      return {
        frames: f.length,
        fps: +(1000 / (f.reduce((a, b) => a + b, 0) / (f.length || 1))).toFixed(1),
        p50: q(0.5), p95: q(0.95), max: sorted.length ? +sorted[sorted.length - 1].toFixed(1) : null,
        over50ms: f.filter((x) => x > 50).length,
        over100ms: f.filter((x) => x > 100).length,
        longTasks: window.__long.slice(0, 12),
        longTaskCount: window.__long.length,
      };
    })()`) : null;

    const cursor = await evaluate(`(() => {
      const el = [...document.querySelectorAll('span')].find((s) => /^\\d+\\/\\d+$/.test(s.textContent || ''));
      return el ? el.textContent : null;
    })()`);

    console.log(JSON.stringify({ viewport: `${vw}x${vh}`, theme: arg('theme', 'light'), cursor, rate: globalThis.__rate, bar, sliderPixels, chart, perf, metrics, profile, errors: errors.slice(0, 5) }, null, 2));
  } finally {
    chrome.kill('SIGKILL');
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('INSPECT FAILED:', err.message);
  process.exit(1);
});
