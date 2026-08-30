import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading, roleLoading, staffRole, signOut } = useAuth()

  if (loading || roleLoading) return <div className="center-message">読み込み中...</div>
  if (!session) return <Navigate to="/login" replace />

  // ログインはできたが staff テーブルに登録されていない人。この分岐が無いと、
  // RLSで何も読めないまま画面に入り「データを取得できませんでした」という
  // 紛らわしいエラーになる
  if (!staffRole) {
    return (
      <div className="center-message">
        <p>このアカウントには利用権限がありません。管理者にご連絡ください。</p>
        <button type="button" onClick={signOut}>
          ログアウト
        </button>
      </div>
    )
  }

  return <>{children}</>
}

/** 管理者だけが入れる画面。閲覧者が直接URLを打っても週間プログラムへ戻す */
export function AdminRoute({ children }: { children: ReactNode }) {
  const { loading, roleLoading, isAdmin } = useAuth()

  if (loading || roleLoading) return <div className="center-message">読み込み中...</div>
  if (!isAdmin) return <Navigate to="/" replace />

  return <>{children}</>
}
