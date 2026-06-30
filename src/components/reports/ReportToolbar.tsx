import { useEffect, useMemo, useState, useCallback } from 'react';
import { Calendar } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLiveData } from '@/context/LiveDataContext';
import { api } from '@/lib/api';
import type { TraccarGroup } from '@/types';

function toLocalInput(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 16);
}

function defaultFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toLocalInput(d.toISOString());
}
function defaultTo(): string {
  return toLocalInput(new Date().toISOString());
}

interface ReportToolbarProps {
  loading?: boolean;
}

export default function ReportToolbar({ loading }: ReportToolbarProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { devices } = useLiveData();
  const [groups, setGroups] = useState<TraccarGroup[]>([]);

  const urlDeviceIds = useMemo(
    () => searchParams.getAll('deviceId').map(Number).filter((n) => Number.isFinite(n)),
    [searchParams],
  );

  const [from, setFrom] = useState(() => {
    const f = searchParams.get('from');
    return f ? toLocalInput(f) : defaultFrom();
  });
  const [to, setTo] = useState(() => {
    const t = searchParams.get('to');
    return t ? toLocalInput(t) : defaultTo();
  });
  const [selectedDevices, setSelectedDevices] = useState<Set<number>>(new Set());
  const [selectedGroups, setSelectedGroups] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.groups.list() as TraccarGroup[];
        if (!cancelled) setGroups(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setGroups([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const f = searchParams.get('from');
    const t = searchParams.get('to');
    if (f) setFrom(toLocalInput(f));
    if (t) setTo(toLocalInput(t));
  }, [searchParams]);

  useEffect(() => {
    if (urlDeviceIds.length) {
      setSelectedDevices(new Set(urlDeviceIds));
    } else if (devices.length && selectedDevices.size === 0) {
      setSelectedDevices(new Set(devices.map((d) => d.id)));
    }
  }, [devices, urlDeviceIds]);

  const toggleDevice = (id: number) => {
    setSelectedDevices((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const run = useCallback(() => {
    const fromIso = new Date(from).toISOString();
    const toIso = new Date(to).toISOString();
    const deviceIds = Array.from(selectedDevices);
    const next = new URLSearchParams();
    deviceIds.forEach((id) => next.append('deviceId', String(id)));
    next.set('from', fromIso);
    next.set('to', toIso);
    setSearchParams(next, { replace: true });
  }, [from, to, selectedDevices, setSearchParams]);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">From</span>
          <Input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">To</span>
          <Input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <Button type="button" onClick={run} disabled={loading}>
          <Calendar className="mr-2 h-4 w-4" /> Run
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {devices.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => toggleDevice(d.id)}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              selectedDevices.has(d.id)
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            {d.name}
          </button>
        ))}
      </div>
    </div>
  );
}
