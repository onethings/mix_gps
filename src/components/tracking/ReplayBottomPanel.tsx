import { useMemo, useRef, useEffect } from 'react';
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

export default function ReplayBottomPanel({ route, deviceName, selectedDate, cursor }: ReplayBottomPanelProps) {
  const { t } = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Compute stats
  const stats = useMemo(() => {
    if (route.length === 0) return null;
    const speeds = route.map((p) => Number(p.speed) || 0);
    const maxSpeed = knotsToKmh(Math.max(...speeds));
    const avgSpeed = knotsToKmh(speeds.reduce((a, b) => a + b, 0) / speeds.length);
    const firstTime = route[0]?.fixTime || route[0]?.deviceTime;
    const lastTime = route[route.length - 1]?.fixTime || route[route.length - 1]?.deviceTime;
    const durationSec = firstTime && lastTime
      ? (new Date(lastTime).getTime() - new Date(firstTime).getTime()) / 1000
      : 0;
    const idleTime = speeds.filter((s) => s === 0).length * (durationSec / speeds.length);
    const drivingTime = durationSec - idleTime;
    const firstAddr = route[0]?.address;
    const lastAddr = route[route.length - 1]?.address;
    const totalDist = route.length > 1
      ? route.reduce((sum, p, i) => {
          if (i === 0) return 0;
          const prev = route[i - 1]!;
          const R = 6371;
          const dLat = ((Number(p.latitude) - Number(prev.latitude)) * Math.PI) / 180;
          const dLon = ((Number(p.longitude) - Number(prev.longitude)) * Math.PI) / 180;
          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos((Number(prev.latitude) * Math.PI) / 180) *
              Math.cos((Number(p.latitude) * Math.PI) / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          return sum + R * c;
        }, 0)
      : 0;

    return { maxSpeed, avgSpeed, durationSec, drivingTime, idleTime, totalDist, firstAddr, lastAddr };
  }, [route]);

  // Draw speed chart on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || route.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    // Clear
    ctx.clearRect(0, 0, w, h);

    const padding = { top: 16, right: 12, bottom: 20, left: 36 };
    const plotW = w - padding.left - padding.right;
    const plotH = h - padding.top - padding.bottom;

    const speeds = route.map((p) => knotsToKmh(p.speed));
    const altitudes = route.map((p) => Number(p.altitude) || 0);
    const maxVal = Math.max(Math.max(...speeds), Math.max(...altitudes), 10);

    // Grid lines
    ctx.strokeStyle = 'rgba(156,163,175,0.2)';
    ctx.lineWidth = 1;
    const gridLines = 4;
    for (let i = 0; i <= gridLines; i++) {
      const y = padding.top + (plotH / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();
      // Y label
      ctx.fillStyle = 'rgba(156,163,175,0.6)';
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(String(Math.round(maxVal - (maxVal / gridLines) * i)), padding.left - 4, y + 3);
    }

    // Speed line (blue)
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    speeds.forEach((s, i) => {
      const x = padding.left + (i / Math.max(speeds.length - 1, 1)) * plotW;
      const y = padding.top + plotH - (s / maxVal) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Fill under speed line
    ctx.lineTo(padding.left + plotW, padding.top + plotH);
    ctx.lineTo(padding.left, padding.top + plotH);
    ctx.closePath();
    ctx.fillStyle = 'rgba(59,130,246,0.08)';
    ctx.fill();

    // Altitude line (green, dashed)
    if (altitudes.some((a) => a > 0)) {
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      altitudes.forEach((a, i) => {
        const x = padding.left + (i / Math.max(altitudes.length - 1, 1)) * plotW;
        const y = padding.top + plotH - (a / maxVal) * plotH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Cursor line
    if (cursor >= 0 && cursor < route.length) {
      const cx = padding.left + (cursor / Math.max(route.length - 1, 1)) * plotW;
      ctx.strokeStyle = 'rgba(239,68,68,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, padding.top);
      ctx.lineTo(cx, padding.top + plotH);
      ctx.stroke();
    }

    // X-axis labels (time)
    ctx.fillStyle = 'rgba(156,163,175,0.6)';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    const labelCount = Math.min(6, route.length);
    const step = Math.max(1, Math.floor(route.length / labelCount));
    for (let i = 0; i < route.length; i += step) {
      const x = padding.left + (i / Math.max(route.length - 1, 1)) * plotW;
      const time = formatTime(route[i]?.fixTime || route[i]?.deviceTime);
      ctx.fillText(time, x, h - 4);
    }

    // Legend
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(padding.left, padding.top - 12, 8, 8);
    ctx.fillStyle = 'rgba(156,163,175,0.8)';
    ctx.fillText(t('replaySpeedKmh'), padding.left + 12, padding.top - 4);
    if (altitudes.some((a) => a > 0)) {
      ctx.fillStyle = '#10b981';
      ctx.fillRect(padding.left + 90, padding.top - 12, 8, 8);
      ctx.fillStyle = 'rgba(156,163,175,0.8)';
      ctx.fillText(t('replayAltitudeM'), padding.left + 102, padding.top - 4);
    }
  }, [route, cursor, t]);

  if (route.length === 0) return null;

  return (
    <div className="flex h-full flex-col bg-card">
      {/* Chart header */}
      <div className="flex items-center justify-between border-b border-border bg-muted/20 px-4 py-1.5">
        <span className="text-xs font-semibold text-foreground">{t('replayChartTitle')}</span>
        <span className="text-[10px] text-muted-foreground">{deviceName} · {selectedDate}</span>
      </div>

      {/* Chart canvas */}
      <div className="flex-1 min-h-0 px-2 py-1">
        <canvas ref={canvasRef} className="h-full w-full" style={{ display: 'block' }} />
      </div>

      {/* Stats row */}
      {stats && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-muted/15 px-4 py-2 text-[10px] text-muted-foreground">
          <span className="text-xs font-semibold text-foreground">{deviceName}</span>
          <span className="text-muted-foreground/30">|</span>
          <span>
            {t('maxSpeed')}:{' '}
            <span className="font-semibold text-foreground tabular-nums">{stats.maxSpeed} {t('kmh')}</span>
          </span>
          <span>
            {t('avgSpeed')}:{' '}
            <span className="font-semibold text-foreground tabular-nums">{stats.avgSpeed} {t('kmh')}</span>
          </span>
          <span>
            {t('distance')}:{' '}
            <span className="font-semibold text-foreground tabular-nums">{stats.totalDist.toFixed(1)} {t('unitKm')}</span>
          </span>
          <span className="text-muted-foreground/30">|</span>
          <span>
            {t('driving')}:{' '}
            <span className="font-semibold text-foreground tabular-nums">{formatDurationSec(stats.drivingTime)}</span>
          </span>
          {stats.idleTime > 0 && (
            <span>
              {t('idle')}:{' '}
              <span className="font-semibold text-foreground tabular-nums">{formatDurationSec(stats.idleTime)}</span>
            </span>
          )}
          <span>
            {t('total')}:{' '}
            <span className="font-semibold text-foreground tabular-nums">{formatDurationSec(stats.durationSec)}</span>
          </span>
          <span className="text-muted-foreground/30">|</span>
          <span className="truncate max-w-[200px]" title={stats.firstAddr}>
            {t('from')}: <span className="text-foreground">{stats.firstAddr || '—'}</span>
          </span>
          <span>→</span>
          <span className="truncate max-w-[200px]" title={stats.lastAddr}>
            {t('to')}: <span className="text-foreground">{stats.lastAddr || '—'}</span>
          </span>
        </div>
      )}
    </div>
  );
}
