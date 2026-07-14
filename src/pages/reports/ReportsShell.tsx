import { Outlet } from 'react-router-dom';
import ReportTypeTabs from '@/components/reports/ReportTypeTabs';
import { ReportFilterProvider } from '@/context/ReportFilterContext';

export default function ReportsShell() {
  return (
    <div className="min-w-0 space-y-2">
      <ReportTypeTabs />
      <ReportFilterProvider>
        <Outlet />
      </ReportFilterProvider>
    </div>
  );
}
