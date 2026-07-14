import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { PeriodKey } from '@/components/reports/ReportFilterV2';

interface ReportFilterState {
  selectedDeviceIds: number[];
  period: PeriodKey;
}

interface ReportFilterContextValue {
  filters: ReportFilterState;
  setSelectedDeviceIds: (ids: number[] | ((prev: number[]) => number[])) => void;
  setPeriod: (period: PeriodKey) => void;
}

const ReportFilterContext = createContext<ReportFilterContextValue | null>(null);

export function ReportFilterProvider({ children }: { children: ReactNode }) {
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<number[]>([]);
  const [period, setPeriod] = useState<PeriodKey>('today');

  const value = useMemo(() => ({
    filters: { selectedDeviceIds, period },
    setSelectedDeviceIds,
    setPeriod,
  }), [selectedDeviceIds, period]);

  return (
    <ReportFilterContext.Provider value={value}>
      {children}
    </ReportFilterContext.Provider>
  );
}

export function useReportFilter() {
  const ctx = useContext(ReportFilterContext);
  if (!ctx) throw new Error('useReportFilter must be used within ReportFilterProvider');
  return ctx;
}
