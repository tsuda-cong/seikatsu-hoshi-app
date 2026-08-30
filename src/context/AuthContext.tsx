import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import type { StaffRole } from '../types/domain'

interface AuthContextValue {
  session: Session | null
  loading: boolean
  /** staffテーブルの役割。ログインできても登録されていなければ null */
  staffRole: StaffRole | null
  /**
   * 役割の取得中かどうか。ログイン直後は onAuthStateChange 側で非同期に取りに行くため、
   * 「セッションはあるが役割はまだ null」という瞬間がある。これを見ずに判定すると
   * 「権限がありません」の画面が一瞬出てしまう
   */
  roleLoading: boolean
  isAdmin: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [staffRole, setStaffRole] = useState<StaffRole | null>(null)
  const [roleLoading, setRoleLoading] = useState(false)
  const [loading, setLoading] = useState(true)

  // 役割を取得済みの人のid。同じ人で二度取りに行かないための目印
  const loadedUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadStaffRole(userId: string) {
      // onAuthStateChangeは、ログインだけでなくトークンの自動更新(TOKEN_REFRESHED)でも呼ばれる。
      // 同じ人なら取り直さない。ここでroleLoadingを立てると、ProtectedRouteの中身が
      // 一瞬「読み込み中」に差し替わり、AppDataProviderごと作り直されて
      // 読み込み済みのデータが捨てられてしまう(帳票印刷のメモが空になる不具合の原因だった)
      if (loadedUserIdRef.current === userId) return
      // 取得の開始時点で印を付けておく。getSessionとonAuthStateChangeが
      // ほぼ同時に走ったときに二重で問い合わせないため
      loadedUserIdRef.current = userId
      setRoleLoading(true)
      const { data, error } = await supabase.from('staff').select('role').eq('user_id', userId).single()
      if (cancelled) return
      // 取れなかったときは印を戻し、次の機会に取り直せるようにする
      if (error) loadedUserIdRef.current = null
      setStaffRole((data?.role as StaffRole | undefined) ?? null)
      setRoleLoading(false)
    }

    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return
      setSession(data.session)
      if (data.session) await loadStaffRole(data.session.user.id)
      if (!cancelled) setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (cancelled) return
      setSession(newSession)
      if (newSession) {
        loadStaffRole(newSession.user.id)
      } else {
        loadedUserIdRef.current = null
        setStaffRole(null)
        setRoleLoading(false)
      }
    })

    return () => {
      cancelled = true
      listener.subscription.unsubscribe()
    }
  }, [])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        staffRole,
        roleLoading,
        isAdmin: staffRole === 'admin',
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
