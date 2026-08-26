import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { AppDataProvider } from './context/AppDataContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { WeeklyProgramPage } from './pages/WeeklyProgramPage'
import { MembersPage } from './pages/MembersPage'
import { MemberHistoryPage } from './pages/MemberHistoryPage'
import { ProgramTypesPage } from './pages/ProgramTypesPage'
import { SongsPage } from './pages/SongsPage'
import { TeachingPointsPage } from './pages/TeachingPointsPage'
import { SettingsPage } from './pages/SettingsPage'
import { ReportsPage } from './pages/ReportsPage'
import { SlipsRangePrintPage } from './pages/print/SlipsRangePrintPage'
import { ChairmanPrintPage } from './pages/print/ChairmanPrintPage'
import { CounselorPrintPage } from './pages/print/CounselorPrintPage'
import { SchedulePrintPage } from './pages/print/SchedulePrintPage'
import { AssignmentsRangePrintPage } from './pages/print/AssignmentsRangePrintPage'

function LoginRoute() {
  const { session, loading } = useAuth()
  if (loading) return <div className="center-message">読み込み中...</div>
  if (session) return <Navigate to="/" replace />
  return <LoginPage />
}

function AdminArea() {
  return (
    <ProtectedRoute>
      <AppDataProvider>
        <Routes>
          <Route path="/print/slips/:from/:to" element={<SlipsRangePrintPage />} />
          <Route path="/print/chairman/:from/:to" element={<ChairmanPrintPage />} />
          <Route path="/print/counselor/:from/:to" element={<CounselorPrintPage />} />
          <Route path="/print/schedule/:from/:to/:month" element={<SchedulePrintPage />} />
          <Route path="/print/assignments/:from/:to" element={<AssignmentsRangePrintPage />} />
          <Route
            path="/*"
            element={
              <Layout>
                <Routes>
                  <Route path="/" element={<WeeklyProgramPage />} />
                  <Route path="/members" element={<MembersPage />} />
                  <Route path="/history" element={<MemberHistoryPage />} />
                  <Route path="/program-types" element={<ProgramTypesPage />} />
                  <Route path="/songs" element={<SongsPage />} />
                  <Route path="/teaching-points" element={<TeachingPointsPage />} />
                  <Route path="/reports" element={<ReportsPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Routes>
              </Layout>
            }
          />
        </Routes>
      </AppDataProvider>
    </ProtectedRoute>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/*" element={<AdminArea />} />
    </Routes>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </HashRouter>
  )
}
