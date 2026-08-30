import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { AppDataProvider } from './context/AppDataContext'
import { AdminRoute, ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { SetPasswordPage } from './pages/SetPasswordPage'
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
          {/* スリップは閲覧者には出さない */}
          <Route
            path="/print/slips/:from/:to"
            element={
              <AdminRoute>
                <SlipsRangePrintPage />
              </AdminRoute>
            }
          />
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
                  <Route path="/history" element={<MemberHistoryPage />} />
                  <Route path="/reports" element={<ReportsPage />} />
                  {/* ここから下は管理者専用 */}
                  <Route
                    path="/members"
                    element={
                      <AdminRoute>
                        <MembersPage />
                      </AdminRoute>
                    }
                  />
                  <Route
                    path="/program-types"
                    element={
                      <AdminRoute>
                        <ProgramTypesPage />
                      </AdminRoute>
                    }
                  />
                  <Route
                    path="/songs"
                    element={
                      <AdminRoute>
                        <SongsPage />
                      </AdminRoute>
                    }
                  />
                  <Route
                    path="/teaching-points"
                    element={
                      <AdminRoute>
                        <TeachingPointsPage />
                      </AdminRoute>
                    }
                  />
                  <Route
                    path="/settings"
                    element={
                      <AdminRoute>
                        <SettingsPage />
                      </AdminRoute>
                    }
                  />
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

// 招待/パスワード再設定リンクは #access_token=...&type=invite のようにハッシュ部分に
// トークンを載せて返ってくる。HashRouterはハッシュ全体をルートパスとして解釈してしまうため、
// 通常のルーティングに乗せる前にここで検知し、専用のパスワード設定画面を表示する
function isInviteOrRecoveryLink() {
  return /type=(invite|recovery)/.test(window.location.hash)
}

export default function App() {
  if (isInviteOrRecoveryLink()) {
    return (
      <AuthProvider>
        <SetPasswordPage />
      </AuthProvider>
    )
  }

  return (
    <HashRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </HashRouter>
  )
}
