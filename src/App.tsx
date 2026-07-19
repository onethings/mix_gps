import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import * as Sentry from '@sentry/react';
import AppShell from './components/layout/AppShell';
import LoadingScreen from './components/common/LoadingScreen';
import { useSession } from './context/SessionContext';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import SessionExpiredListener from './components/common/SessionExpiredListener';
import FlashToast from './components/common/FlashToast';
import NavigationBootstrap from './components/common/NavigationBootstrap';
import CachingController from './components/common/CachingController';
import UpdateController from './components/common/UpdateController';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const LiveTrackingPage = lazy(() => import('./pages/LiveTrackingPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const AlertsPage = lazy(() => import('./pages/AlertsPage'));
const VehicleProfilePage = lazy(() => import('./pages/VehicleProfilePage'));
const ReplayPage = lazy(() => import('./pages/ReplayPage'));
const ReportsShell = lazy(() => import('./pages/reports/ReportsShell'));
const ReportsIndexPage = lazy(() => import('./pages/reports/ReportsIndexPage'));
const ReportPage = lazy(() => import('./pages/reports/ReportPage'));
const CombinedReportPage = lazy(() => import('./pages/reports/CombinedReportPage'));
const EventsReportPage = lazy(() => import('./pages/reports/EventsReportPage'));
const GeofencesReportPage = lazy(() => import('./pages/reports/GeofencesReportPage'));
const StopsReportPage = lazy(() => import('./pages/reports/StopsReportPage'));
const SummaryReportPage = lazy(() => import('./pages/reports/SummaryReportPage'));
const ChartReportPage = lazy(() => import('./pages/reports/ChartReportPage'));
const RouteReportPage = lazy(() => import('./pages/reports/RouteReportPage'));
const LogsReportPage = lazy(() => import('./pages/reports/LogsReportPage'));
const ScheduledReportPage = lazy(() => import('./pages/reports/ScheduledReportPage'));
const StatisticsReportPage = lazy(() => import('./pages/reports/StatisticsReportPage'));
const AuditReportPage = lazy(() => import('./pages/reports/AuditReportPage'));
const DevicesPage = lazy(() => import('./pages/DevicesPage'));
const GeofencesPage = lazy(() => import('./pages/GeofencesPage'));
const OrdersPage = lazy(() => import('./pages/OrdersPage'));
const EventsPage = lazy(() => import('./pages/EventsPage'));

const SettingsLayout = lazy(() => import('./pages/settings/SettingsLayout'));
const SettingsOverviewPage = lazy(() => import('./pages/settings/SettingsOverviewPage'));
const ServerSettingsPage = lazy(() => import('./pages/settings/ServerSettingsPage'));
const UsersSettingsPage = lazy(() => import('./pages/settings/UsersSettingsPage'));
const UserEditorPage = lazy(() => import('./pages/settings/UserEditorPage'));
const DevicesSettingsPage = lazy(() => import('./pages/settings/DevicesSettingsPage'));
const DeviceEditorPage = lazy(() => import('./pages/settings/DeviceEditorPage'));
const GroupsSettingsPage = lazy(() => import('./pages/settings/GroupsSettingsPage'));
const NotificationsSettingsPage = lazy(() => import('./pages/settings/NotificationsSettingsPage'));
const NotificationEditorPage = lazy(() => import('./pages/settings/NotificationEditorPage'));
const PreferencesSettingsPage = lazy(() => import('./pages/settings/PreferencesSettingsPage'));
const CommandsSettingsPage = lazy(() => import('./pages/settings/CommandsSettingsPage'));
const CommandEditorPage = lazy(() => import('./pages/settings/CommandEditorPage'));
const CalendarsSettingsPage = lazy(() => import('./pages/settings/CalendarsSettingsPage'));
const DriversSettingsPage = lazy(() => import('./pages/settings/DriversSettingsPage'));
const MaintenanceSettingsPage = lazy(() => import('./pages/settings/MaintenanceSettingsPage'));
const ComputedAttributesSettingsPage = lazy(() => import('./pages/settings/ComputedAttributesSettingsPage'));
const AttributeEditorPage = lazy(() => import('./pages/settings/AttributeEditorPage'));
const DriverEditorPage = lazy(() => import('./pages/settings/DriverEditorPage'));
const GroupEditorPage = lazy(() => import('./pages/settings/GroupEditorPage'));
const MaintenanceEditorPage = lazy(() => import('./pages/settings/MaintenanceEditorPage'));
const AccumulatorsPage = lazy(() => import('./pages/settings/AccumulatorsPage'));
const PermissionsSettingsPage = lazy(() => import('./pages/settings/PermissionsSettingsPage'));
const AnnouncementSettingsPage = lazy(() => import('./pages/settings/AnnouncementSettingsPage'));
const ConnectionsHubPage = lazy(() => import('./pages/settings/ConnectionsHubPage'));
const DeviceConnectionsPage = lazy(() => import('./pages/settings/DeviceConnectionsPage'));
const GroupConnectionsPage = lazy(() => import('./pages/settings/GroupConnectionsPage'));
const UserConnectionsPage = lazy(() => import('./pages/settings/UserConnectionsPage'));
const SettingsJsonEntityPage = lazy(() => import('./pages/settings/SettingsJsonEntityPage'));

const TripsPage = lazy(() => import('./pages/TripsPage'));
const FuelPage = lazy(() => import('./pages/FuelPage'));
const DriversPage = lazy(() => import('./pages/DriversPage'));
const MaintenancePage = lazy(() => import('./pages/MaintenancePage'));
const LogisticsPage = lazy(() => import('./pages/LogisticsPage'));
const RoutePlanningPage = lazy(() => import('./pages/RoutePlanningPage'));
const SharedViewPage = lazy(() => import('./pages/SharedViewPage'));
const StreamPage = lazy(() => import('./pages/StreamPage'));
const PositionPage = lazy(() => import('./pages/PositionPage'));
const NetworkPage = lazy(() => import('./pages/NetworkPage'));
const EventPageDetail = lazy(() => import('./pages/EventPage'));
const EmulatorPage = lazy(() => import('./pages/EmulatorPage'));
const CommandSendPage = lazy(() => import('./pages/CommandSendPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user } = useSession();
  const location = useLocation();
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
}

/** 手機端登入後預設跳轉到地圖頁，桌機端維持 dashboard */
function DefaultRedirect() {
  const isMobile = window.innerWidth < 768;
  return <Navigate to={isMobile ? '/tracking' : '/dashboard'} replace />;
}

function AppRoutes() {
  const { user, ready } = useSession();

  if (!ready) {
    return <LoadingScreen />;
  }

  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/shared" element={<SharedViewPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route
          path="/login"
          element={user ? <DefaultRedirect /> : <LoginPage />}
        />
        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route index element={<DefaultRedirect />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/tracking" element={<LiveTrackingPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/trips" element={<Navigate to="/reports/trips" replace />} />
          <Route path="/fuel" element={<FuelPage />} />
          <Route path="/vehicles" element={<Navigate to="/devices" replace />} />
          <Route path="/devices" element={<DevicesPage />} />
          <Route path="/devices/:id" element={<VehicleProfilePage />} />
          <Route path="/drivers" element={<DriversPage />} />
          <Route path="/maintenance" element={<MaintenancePage />} />
          <Route path="/logistics" element={<LogisticsPage />} />
          <Route path="/route-planning" element={<RoutePlanningPage />} />
          <Route path="/replay" element={<ReplayPage />} />
          <Route path="/stream" element={<StreamPage />} />
          <Route path="/emulator" element={<EmulatorPage />} />
          <Route path="/commands/send/:id" element={<CommandSendPage />} />

          <Route element={<ReportsShell />}>
            <Route path="reports">
              <Route index element={<ReportsIndexPage />} />
              <Route path="combined" element={<CombinedReportPage />} />
              <Route path="events" element={<EventsReportPage />} />
              <Route path="geofences" element={<GeofencesReportPage />} />
              <Route path="trips" element={<TripsPage />} />
              <Route path="stops" element={<StopsReportPage />} />
              <Route path="summary" element={<SummaryReportPage />} />
              <Route path="chart" element={<ChartReportPage />} />
              <Route path="route" element={<RouteReportPage />} />
              <Route path="logs" element={<LogsReportPage />} />
              <Route path="scheduled" element={<ScheduledReportPage />} />
              <Route path="statistics" element={<StatisticsReportPage />} />
              <Route path="audit" element={<AuditReportPage />} />
              <Route path=":type" element={<ReportPage />} />
            </Route>
          </Route>
          <Route path="/geofences" element={<GeofencesPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/position/:id" element={<PositionPage />} />
          <Route path="/network/:positionId" element={<NetworkPage />} />
          <Route path="/event/:id" element={<EventPageDetail />} />

          <Route path="/settings" element={<SettingsLayout />}>
            <Route index element={<SettingsOverviewPage />} />
            <Route path="server" element={<ServerSettingsPage />} />
            <Route path="users" element={<UsersSettingsPage />} />
            <Route path="user/new" element={<UserEditorPage />} />
            <Route path="user/:id" element={<UserEditorPage />} />
            <Route path="devices" element={<DevicesSettingsPage />} />
            <Route path="device/new" element={<DeviceEditorPage />} />
            <Route path="device/:id" element={<DeviceEditorPage />} />
            <Route path="groups" element={<GroupsSettingsPage />} />
            <Route path="groups" element={<GroupsSettingsPage />} />
            <Route path="group/new" element={<GroupEditorPage />} />
            <Route path="group/:id" element={<GroupEditorPage />} />
            <Route path="notifications" element={<NotificationsSettingsPage />} />
            <Route path="notification/new" element={<NotificationEditorPage />} />
            <Route path="notification/:id" element={<NotificationEditorPage />} />
            <Route path="preferences" element={<PreferencesSettingsPage />} />
            <Route path="commands" element={<CommandsSettingsPage />} />
            <Route path="command/new" element={<CommandEditorPage />} />
            <Route path="command/:id" element={<CommandEditorPage />} />
            <Route path="calendars" element={<CalendarsSettingsPage />} />
            <Route path="drivers" element={<DriversSettingsPage />} />
            <Route path="driver/new" element={<DriverEditorPage />} />
            <Route path="driver/:id" element={<DriverEditorPage />} />
            <Route path="maintenance" element={<MaintenanceSettingsPage />} />
            <Route path="maintenances" element={<MaintenanceSettingsPage />} />
            <Route path="maintenance/new" element={<MaintenanceEditorPage />} />
            <Route path="maintenance/:id" element={<MaintenanceEditorPage />} />
            <Route path="accumulators/:deviceId" element={<AccumulatorsPage />} />
            <Route path="attributes" element={<ComputedAttributesSettingsPage />} />
            <Route path="attribute/new" element={<AttributeEditorPage />} />
            <Route path="attribute/:id" element={<AttributeEditorPage />} />
            <Route path="permissions" element={<PermissionsSettingsPage />} />
            <Route path="announcement" element={<AnnouncementSettingsPage />} />
            <Route path="connections" element={<ConnectionsHubPage />} />
            <Route path="entity/device/:id/connections" element={<DeviceConnectionsPage />} />
            <Route path="entity/group/:id/connections" element={<GroupConnectionsPage />} />
            <Route path="entity/user/:id/connections" element={<UserConnectionsPage />} />
            <Route path="entity/:kind/:id" element={<SettingsJsonEntityPage />} />
          </Route>

          <Route path="*" element={<DefaultRedirect />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <>
      <NavigationBootstrap />
      <SessionExpiredListener />
      <CachingController />
      <UpdateController />
      <FlashToast />
      <ErrorBoundary>
        <AppRoutes />
      </ErrorBoundary>
    </>
  );
}
