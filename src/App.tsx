import { lazy, Suspense, type ReactNode } from 'react'
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
import { TalksPage } from './pages/TalksPage'
import { ProgramTypesPage } from './pages/ProgramTypesPage'
import { SongsPage } from './pages/SongsPage'
import { TeachingPointsPage } from './pages/TeachingPointsPage'
import { SettingsPage } from './pages/SettingsPage'
import { ReportsPage } from './pages/ReportsPage'
import { SlipsRangePrintPage } from './pages/print/SlipsRangePrintPage'

// PDFで作る帳票は pdf-lib(数百KB)を使うので、開いたときにだけ読み込む。
// スリップだけは管理者がPCで使うもので、今もブラウザの印刷のまま
const SchedulePrintPage = lazy(() =>
  import('./pages/print/SchedulePrintPage').then((m) => ({ default: m.SchedulePrintPage })),
)
const AssignmentsRangePrintPage = lazy(() =>
  import('./pages/print/AssignmentsRangePrintPage').then((m) => ({ default: m.AssignmentsRangePrintPage })),
)
const ChairmanPrintPage = lazy(() =>
  import('./pages/print/ChairmanPrintPage').then((m) => ({ default: m.ChairmanPrintPage })),
)
const CounselorPrintPage = lazy(() =>
  import('./pages/print/CounselorPrintPage').then((m) => ({ default: m.CounselorPrintPage })),
)

function PdfPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div className="center-message">読み込み中...</div>}>{children}</Suspense>
}

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
          <Route
            path="/print/schedule/:from/:to/:month"
            element={
              <PdfPage>
                <SchedulePrintPage />
              </PdfPage>
            }
          />
          <Route
            path="/print/assignments/:from/:to"
            element={
              <PdfPage>
                <AssignmentsRangePrintPage />
              </PdfPage>
            }
          />
          <Route
            path="/print/chairman/:from/:to"
            element={
              <PdfPage>
                <ChairmanPrintPage />
              </PdfPage>
            }
          />
          <Route
            path="/print/counselor/:from/:to"
            element={
              <PdfPage>
                <CounselorPrintPage />
              </PdfPage>
            }
          />
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
                    path="/talks"
                    element={
                      <AdminRoute>
                        <TalksPage />
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
