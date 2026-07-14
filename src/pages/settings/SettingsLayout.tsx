import { Outlet } from 'react-router-dom';

export default function SettingsLayout() {
  return (
    <div className="h-full overflow-y-auto pb-8">
      <Outlet />
    </div>
  );
}
