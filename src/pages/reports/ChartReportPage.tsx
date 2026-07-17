import { useCallback, useMemo, useRef, useState } from 'react';
import PageHeader from '@/components/common/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import EmptyState from '@/components/common/EmptyState';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import ReportFilter from '@/components/reports/ReportFilterV2';
import type { ReportFilterValue } from '@/components/reports/ReportFilterV2';
import { formatDate } from '@/lib/utils';

export default function ChartReportPage() {
  const { t } = useT();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTriggered, setShowTriggered] = useState(false);
  const fetchKeyRef = useRef(0);

  const handleShow = useCallback((value: ReportFilterValue) => {
    const key = ++fetchKeyRef.current;
    setShowTriggered(true);
    setLoading(true);
    setError(null);
    // Use single device for chart
    const deviceId = value.deviceIds.slice(0, 1);
    if (!deviceId.length) { setLoading(false); return; }
    (async () => {
      try {
        const data = await api.reports.route({ from: value.from, to: value.to, deviceId }) as any[];
        if (key !== fetchKeyRef.current) return;
        setRows((data || []).sort((a: any, b: any) => ((a.fixTime) || '').localeCompare((b.fixTime) || '')));
      } catch (e) {
        if (key === fetchKeyRef.current) setError((e as Error).message || 'Failed');
      } finally {
        if (key === fetchKeyRef.current) setLoading(false);
      }
    })();
  }, []);

  // Chart dimensions
  const chartWidth = 800;
  const chartHeight = 300;
  const padding = { top: 20, right: 20, bottom: 40, left: 60 };

  const { pathD, yLabels, xLabels, maxSpeed } = useMemo(() => {
    if (!rows.length) return { pathD: '', yLabels: [] as string[], xLabels: [] as string[], maxSpeed: 0 };
    const maxS = Math.max(...rows.map((r) => r.speed || 0), 1) * 1.852;
    const minT = rows[0]?.fixTime || '';
    const maxT = rows[rows.length - 1]?.fixTime || '';
    const minTs = new Date(minT).getTime();
    const maxTs = new Date(maxT).getTime();
    const rangeT = Math.max(maxTs - minTs, 1);

    const w = chartWidth - padding.left - padding.right;
    const h = chartHeight - padding.top - padding.bottom;

    const points = rows.map((r, i) => {
      const x = padding.left + (i / Math.max(rows.length - 1, 1)) * w;
      const speed = (r.speed || 0) * 1.852;
      const y = padding.top + h - (speed / maxS) * h;
      return { x, y, speed, time: r.fixTime || '' };
    });

    const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

    // Y axis labels
    const yL = [];
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const val = (maxS / steps) * i;
      const yPos = padding.top + h - (val / maxS) * h;
      yL.push({ value: Math.round(val), y: yPos });
    }

    // X axis labels (show every ~10th)
    const step = Math.max(1, Math.floor(points.length / 10));
    const xL = points.filter((_, i) => i % step === 0).map((p) => ({ label: formatDate(p.time), x: p.x }));

    return { pathD: path, yLabels: yL, xLabels: xL, maxSpeed: Math.round(maxS) };
  }, [rows]);

  return (
    <div className="space-y-3 md:space-y-5">
      <PageHeader title={t('chart')} description={t('reportChartDesc')} className="max-md:hidden" />
      <ReportFilter loading={loading} onShow={handleShow} />

      <Card>
        <CardHeader>
            <CardTitle>{t('speedChart')}</CardTitle>
            <CardDescription>
              {!showTriggered ? t('setFiltersAndShow') : loading ? t('loading') : error ? error : `${rows.length} ${t('positions')}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!showTriggered ? <EmptyState title={t('setFiltersAndShow')} />
          : loading ? <div className="py-16 text-center text-sm text-muted-foreground">{t('loading')}</div>
          : error ? <div className="py-16 text-center text-sm text-destructive">{error}</div>
          : rows.length === 0 ? <EmptyState title={t('noDataInRange')} />
          : (
            <div className="overflow-x-auto">
              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full max-h-[400px]">
                {/* Grid lines */}
                {yLabels.map((yl, i) => (
                  <g key={i}>
                    <line x1={padding.left} y1={yl.y} x2={chartWidth - padding.right} y2={yl.y} stroke="hsl(var(--border))" strokeWidth="1" />
                    <text x={padding.left - 8} y={yl.y + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">{yl.value}</text>
                  </g>
                ))}
                {/* X labels */}
                {xLabels.map((xl, i) => (
                  <text key={i} x={xl.x} y={chartHeight - 8} textAnchor="middle" className="fill-muted-foreground text-[9px]">{xl.label}</text>
                ))}
                {/* Speed line */}
                <path d={pathD} fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinejoin="round" />
                {/* Y axis label */}
                <text x={12} y={chartHeight / 2} textAnchor="middle" transform={`rotate(-90, 12, ${chartHeight / 2})`} className="fill-muted-foreground text-[10px]">Speed (km/h)</text>
                {/* X axis label */}
                <text x={chartWidth / 2} y={chartHeight - 2} textAnchor="middle" className="fill-muted-foreground text-[10px]">Time</text>
              </svg>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
