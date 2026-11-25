// Captures render errors from a page: console messages, uncaught exceptions with stacks,
// and the error-boundary text. Usage: node scripts/page-error-capture.mjs <url>
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9335;
const URL = process.argv[2] || 'http://localhost:3099/tracking';
const WAIT_MS = Number(process.argv[3] || 12000);

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

const events = [];

async function main() {
  const profile = mkdtempSync(join(tmpdir(), 'page-err-'));
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

    let id = 0;
    const pending = new Map();
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const msgId = ++id;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
      setTimeout(() => { if (pending.delete(msgId)) reject(new Error(`${method} timed out`)); }, 30000);
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
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ');
        if (msg.params.type === 'error' || msg.params.type === 'warning' || /Invalid hook|resolveDispatcher/i.test(text)) {
          events.push({ kind: `console.${msg.params.type}`, text, stack: msg.params.stackTrace?.callFrames?.slice(0, 8).map((f) => `${f.functionName || '(anon)'} @ ${f.url.replace(/^http:\/\/[^/]+/, '')}:${f.lineNumber + 1}`) });
        }
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        events.push({
          kind: 'exception',
          text: d.exception?.description || d.text,
          stack: d.stackTrace?.callFrames?.slice(0, 12).map((f) => `${f.functionName || '(anon)'} @ ${f.url.replace(/^http:\/\/[^/]+/, '')}:${f.lineNumber + 1}`),
        });
      }
    };

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');
    await send('Page.navigate', { url: URL });
    await sleep(WAIT_MS);

    const state = await send('Runtime.evaluate', {
      expression: `JSON.stringify({
        href: location.href,
        text: document.body.innerText.slice(0, 300),
        deps: performance.getEntriesByType('resource')
          .map(function (e) { return e.name.split('/.vite/deps/')[1]; })
          .filter(Boolean)
          .sort(),
      })`,
      returnByValue: true,
    });
    if (state.exceptionDetails) throw new Error('probe threw: ' + (state.exceptionDetails.exception?.description || state.exceptionDetails.text));
    console.log(JSON.stringify({ url: URL, page: JSON.parse(state.result.value), events }, null, 2));
  } finally {
    chrome.kill('SIGKILL');
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('CAPTURE FAILED:', err.message);
  process.exit(1);
});
