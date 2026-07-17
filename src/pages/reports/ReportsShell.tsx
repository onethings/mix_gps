import { Outlet } from 'react-router-dom';
import ReportTypeTabs from '@/components/reports/ReportTypeTabs';
import { ReportFilterProvider } from '@/context/ReportFilterContext';

export default function ReportsShell() {
  return (
    <div className="min-w-0 space-y-1 md:space-y-2 pb-safe-lg md:pb-0">
      <ReportTypeTabs />
      <ReportFilterProvider>
        <Outlet />
      </ReportFilterProvider>
    </div>
  );
}
