import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { AnnouncementsPage } from './pages/AnnouncementsPage';
import { SosPage } from './pages/SosPage';
import { MembersPage } from './pages/MembersPage';
import { GuardShiftsPage } from './pages/GuardShiftsPage';
import { EntryLogsPage } from './pages/EntryLogsPage';
import { TransportProvidersPage } from './pages/TransportProvidersPage';
import { MaintenanceTicketsPage } from './pages/MaintenanceTicketsPage';

// Route map per spec 1.3 (Admin Dashboard screens) + MVP_BACKLOG.md Epic 5.
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<DashboardPage />} />
          <Route path="/announcements" element={<AnnouncementsPage />} />
          <Route path="/sos" element={<SosPage />} />
          <Route path="/members" element={<MembersPage />} />
          <Route path="/guard-shifts" element={<GuardShiftsPage />} />
          <Route path="/entry-logs" element={<EntryLogsPage />} />
          <Route path="/transport-providers" element={<TransportProvidersPage />} />
          <Route path="/maintenance-tickets" element={<MaintenanceTicketsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
