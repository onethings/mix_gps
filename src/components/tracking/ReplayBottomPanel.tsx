import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '@/lib/i18n';

interface RoutePoint {
  latitude: number;
  longitude: number;
  speed?: number;
  course?: number;
  fixTime?: string;
  deviceTime?: string;
  address?: string;
  altitude?: number;
}

interface ReplayBottomPanelProps {
  route: RoutePoint[];
  deviceName: string;
  selectedDate: string;
  cursor: number;
}

// Plot geometry shared by the static chart and the cursor overlay, in CSS pixels.
const PAD = { top: 16, right: 12, bottom: 20, left: 36 };
// Upper bound on plotted points: a day of 1 Hz positions is far wider than the canvas,
// so buckets of min/max keep the shape and the peaks while the path stays cheap to draw.
const MAX_PLOT_POINTS = 900;

function knotsToKmh(k: unknown) { return Math.round((Number(k) || 0) * 1.852); }

function formatTime(isoStr: string | undefined | null) {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  } catch { return isoStr; }
}

function formatDurationSec(seconds: number) {
  if (seconds <= 0) return '—';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

// Route geometry identity. Address labels stream in from the geocoder and replace the
// route array every time, so keying the expensive series/chart work on the array identity
// redraws the whole chart for a label change.
function geometryKey(route: RoutePoint[]): string {
  if (route.length === 0) return '';
  const first = route[0]!;
  const last = route[route.length - 1]!;
  return [route.length, first.fixTime || first.deviceTime || '', last.fixTime || last.deviceTime || ''].join('|');
}

interface Series {
  speeds: number[];
  altitudes: number[];
  maxVal: number;
  distanceKm: number;
  durationSec: number;
  idleSec: number;
  maxSpeedKmh: number;
  avgSpeedKmh: number;
  hasAltitude: boolean;
  /** Downsampled plot points: index into the original route + value, per series. */
  speedPlot: Array<[number, number]>;
  altPlot: Array<[number, number]>;
  times: string[];
}

function buildSeries(route: RoutePoint[]): Series | null {
  const n = route.length;
  if (n === 0) return null;

  const speeds = new Array<number>(n);
  const altitudes = new Array<number>(n);
  const times = new Array<string>(n);
  let maxSpeed = 0;
  let sumSpeed = 0;
  let zeroSpeedCount = 0;
  let maxAlt = 0;
  let hasAltitude = false;
  let distanceKm = 0;

  for (let i = 0; i < n; i++) {
    const p = route[i]!;
    const s = knotsToKmh(p.speed);
    speeds[i] = s;
    if (s > maxSpeed) maxSpeed = s;
    sumSpeed += s;
    if (s === 0) zeroSpeedCount++;
    const alt = Number(p.altitude) || 0;
    altitudes[i] = alt;
    if (alt > 0) hasAltitude = true;
    if (alt > maxAlt) maxAlt = alt;
    times[i] = p.fixTime || p.deviceTime || '';
    if (i > 0) {
      const prev = route[i - 1]!;
      const R = 6371;
      const dLat = ((Number(p.latitude) - Number(prev.latitude)) * Math.PI) / 180;
      const dLon = ((Number(p.longitude) - Number(prev.longitude)) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((Number(prev.latitude) * Math.PI) / 180) *
          Math.cos((Number(p.latitude) * Math.PI) / 180) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
      distanceKm += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
  }

  const firstTime = times[0];
  const lastTime = times[n - 1];
  const durationSec = firstTime && lastTime
    ? Math.max(0, (new Date(lastTime).getTime() - new Date(firstTime).getTime()) / 1000)
    : 0;

  const bucket = Math.max(1, Math.ceil(n / MAX_PLOT_POINTS));
  const speedPlot: Array<[number, number]> = [];
  const altPlot: Array<[number, number]> = [];
  if (bucket === 1) {
    for (let i = 0; i < n; i++) {
      speedPlot.push([i, speeds[i]!]);
      altPlot.push([i, altitudes[i]!]);
    }
  } else {
    for (let start = 0; start < n; start += bucket) {
      const end = Math.min(n, start + bucket);
      let minS = Infinity, maxS = -Infinity, minI = start, maxI = start;
      let minA = Infinity, maxA = -Infinity, minAI = start, maxAI = start;
      for (let i = start; i < end; i++) {
        const s = speeds[i]!;
        if (s < minS) { minS = s; minI = i; }
        if (s > maxS) { maxS = s; maxI = i; }
        const a = altitudes[i]!;
        if (a < minA) { minA = a; minAI = i; }
        if (a > maxA) { maxA = a; maxAI = i; }
      }
      // Keep the extremes in time order so the line follows the real shape.
      if (minI <= maxI) { speedPlot.push([minI, minS]); speedPlot.push([maxI, maxS]); }
      else { speedPlot.push([maxI, maxS]); speedPlot.push([minI, minS]); }
      if (minAI <= maxAI) { altPlot.push([minAI, minA]); altPlot.push([maxAI, maxA]); }
      else { altPlot.push([maxAI, maxA]); altPlot.push([minAI, minA]); }
    }
  }

  return {
    speeds,
    altitudes,
    maxVal: Math.max(maxSpeed, maxAlt, 10),
    distanceKm,
    durationSec,
    idleSec: n > 0 ? zeroSpeedCount * (durationSec / n) : 0,
    maxSpeedKmh: maxSpeed,
    avgSpeedKmh: Math.round(sumSpeed / n),
    hasAltitude,
    speedPlot,
    altPlot,
    times,
  };
}

function sizeCanvas(canvas: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D | null {
  const dpr = window.devicePixelRatio || 1;
  const bw = Math.round(w * dpr);
  const bh = Math.round(h * dpr);
  if (canvas.width !== bw) canvas.width = bw;
  if (canvas.height !== bh) canvas.height = bh;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return ctx;
}

function drawStaticChart(canvas: HTMLCanvasElement, w: number, h: number, s: Series, t: (k: string, f?: string) => string) {
  const ctx = sizeCanvas(canvas, w, h);
  if (!ctx) return;
  const plotW = w - PAD.left - PAD.right;
  const plotH = h - PAD.top - PAD.bottom;
  if (plotW <= 0 || plotH <= 0) return;
  const n = s.speeds.length;
  const xAt = (i: number) => PAD.left + (i / Math.max(n - 1, 1)) * plotW;
  const yAt = (v: number) => PAD.top + plotH - (v / s.maxVal) * plotH;

  // Grid + Y labels
  ctx.strokeStyle = 'rgba(156,163,175,0.2)';
  ctx.lineWidth = 1;
  const gridLines = 4;
  ctx.font = '9px monospace';
  for (let i = 0; i <= gridLines; i++) {
    const y = PAD.top + (plotH / gridLines) * i;
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(w - PAD.right, y);
    ctx.stroke();
    ctx.fillStyle = 'rgba(156,163,175,0.6)';
    ctx.textAlign = 'right';
    ctx.fillText(String(Math.round(s.maxVal - (s.maxVal / gridLines) * i)), PAD.left - 4, y + 3);
  }

  // Speed line + fill
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  s.speedPlot.forEach(([i, v], k) => {
    const x = xAt(i);
    const y = yAt(v);
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.lineTo(PAD.left + plotW, PAD.top + plotH);
  ctx.lineTo(PAD.left, PAD.top + plotH);
  ctx.closePath();
  ctx.fillStyle = 'rgba(59,130,246,0.08)';
  ctx.fill();

  // Altitude line
  if (s.hasAltitude) {
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    s.altPlot.forEach(([i, v], k) => {
      const x = xAt(i);
      const y = yAt(v);
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // X axis time labels
  ctx.fillStyle = 'rgba(156,163,175,0.6)';
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  const labelCount = Math.min(6, n);
  const step = Math.max(1, Math.floor(n / labelCount));
  for (let i = 0; i < n; i += step) {
    ctx.fillText(formatTime(s.times[i]), xAt(i), h - 4);
  }

  // Legend
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(PAD.left, PAD.top - 12, 8, 8);
  ctx.fillStyle = 'rgba(156,163,175,0.8)';
  ctx.fillText(t('replaySpeedKmh', 'Speed (km/h)'), PAD.left + 12, PAD.top - 4);
  if (s.hasAltitude) {
    ctx.fillStyle = '#10b981';
    ctx.fillRect(PAD.left + 90, PAD.top - 12, 8, 8);
    ctx.fillStyle = 'rgba(156,163,175,0.8)';
    ctx.fillText(t('replayAltitudeM', 'Altitude (m)'), PAD.left + 102, PAD.top - 4);
  }
}

function drawCursor(canvas: HTMLCanvasElement, w: number, h: number, s: Series, cursor: number) {
  const ctx = sizeCanvas(canvas, w, h);
  if (!ctx) return;
  const plotW = w - PAD.left - PAD.right;
  const plotH = h - PAD.top - PAD.bottom;
  if (plotW <= 0 || plotH <= 0) return;
  const n = s.speeds.length;
  if (cursor < 0 || cursor >= n) return;
  const x = PAD.left + (cursor / Math.max(n - 1, 1)) * plotW;

  ctx.strokeStyle = 'rgba(239,68,68,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, PAD.top);
  ctx.lineTo(x, PAD.top + plotH);
  ctx.stroke();

  const v = s.speeds[cursor] ?? 0;
  const y = PAD.top + plotH - (v / s.maxVal) * plotH;
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.fillStyle = '#ef4444';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function ReplayBottomPanel({ route, deviceName, selectedDate, cursor }: ReplayBottomPanelProps) {
  const { t } = useT();
  const wrapRef = useRef<HTMLDivElement>(null);
  const staticRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // Chart box size, observed instead of measured on every draw. Measured on the static
  // canvas so both layers share one geometry (the overlay mirrors the same padding).
  useEffect(() => {
    const canvas = staticRef.current;
    if (!canvas) return;
    const measure = () => {
      const r = canvas.getBoundingClientRect();
      setSize((prev) => (Math.abs(prev.w - r.width) < 1 && Math.abs(prev.h - r.height) < 1 ? prev : { w: r.width, h: r.height }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // Keyed on geometry, not on the route array: address labels replace the array.
  const key = geometryKey(route);
  const series = useMemo(() => buildSeries(route), [key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Static layer: grid, speed/altitude lines, labels. Redrawn only when the data or size changes.
  useEffect(() => {
    const canvas = staticRef.current;
    if (!canvas || !series || !size.w || !size.h) return;
    drawStaticChart(canvas, size.w, size.h, series, t);
  }, [series, size, t]);

  // Cursor layer: one line + one dot per playback tick, on its own canvas so a tick
  // never repaints the series.
  useEffect(() => {
    const canvas = cursorRef.current;
    if (!canvas || !series || !size.w || !size.h) return;
    drawCursor(canvas, size.w, size.h, series, cursor);
  }, [series, size, cursor]);

  if (route.length === 0 || !series) return null;

  const firstAddr = route[0]?.address;
  const lastAddr = route[route.length - 1]?.address;

  return (
    <div className="flex h-full flex-col bg-card">
      {/* Chart header */}
      <div className="flex items-center justify-between border-b border-border bg-muted/20 px-4 py-1.5">
        <span className="text-xs font-semibold text-foreground">{t('replayChartTitle', 'Replay chart')}</span>
        <span className="text-[10px] text-muted-foreground">{deviceName} · {selectedDate}</span>
      </div>

      {/* Chart canvases: static series + cursor overlay */}
      <div ref={wrapRef} className="relative min-h-0 flex-1 px-2 py-1">
        <canvas ref={staticRef} className="block h-full w-full" />
        <canvas ref={cursorRef} className="pointer-events-none absolute inset-0 block h-full w-full px-2 py-1" />
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-muted/15 px-4 py-2 text-[10px] text-muted-foreground">
        <span className="text-xs font-semibold text-foreground">{deviceName}</span>
        <span className="text-muted-foreground/30">|</span>
        <span>
          {t('maxSpeed', 'Max speed')}:{' '}
          <span className="font-semibold text-foreground tabular-nums">{series.maxSpeedKmh} {t('kmh', 'km/h')}</span>
        </span>
        <span>
          {t('avgSpeed', 'Avg speed')}:{' '}
          <span className="font-semibold text-foreground tabular-nums">{series.avgSpeedKmh} {t('kmh', 'km/h')}</span>
        </span>
        <span>
          {t('distance', 'Distance')}:{' '}
          <span className="font-semibold text-foreground tabular-nums">{series.distanceKm.toFixed(1)} {t('unitKm', 'km')}</span>
        </span>
        <span className="text-muted-foreground/30">|</span>
        <span>
          {t('driving', 'Driving')}:{' '}
          <span className="font-semibold text-foreground tabular-nums">{formatDurationSec(Math.max(0, series.durationSec - series.idleSec))}</span>
        </span>
        {series.idleSec > 0 && (
          <span>
            {t('idle', 'Idle')}:{' '}
            <span className="font-semibold text-foreground tabular-nums">{formatDurationSec(series.idleSec)}</span>
          </span>
        )}
        <span>
          {t('total', 'Total')}:{' '}
          <span className="font-semibold text-foreground tabular-nums">{formatDurationSec(series.durationSec)}</span>
        </span>
        <span className="text-muted-foreground/30">|</span>
        <span className="truncate max-w-[200px]" title={firstAddr}>
          {t('from', 'From')}: <span className="text-foreground">{firstAddr || '—'}</span>
        </span>
        <span>→</span>
        <span className="truncate max-w-[200px]" title={lastAddr}>
          {t('to', 'To')}: <span className="text-foreground">{lastAddr || '—'}</span>
        </span>
      </div>
    </div>
  );
}

// The page re-renders on every playback tick; memo keeps that to the cursor-dependent work.
export default memo(ReplayBottomPanel);
