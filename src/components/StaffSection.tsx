import { useEffect, useState } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { STAFF_ROLES, type Staff, type StaffRole } from '../types/domain'

const ROLE_LABELS: Record<StaffRole, string> = {
  admin: '管理者(閲覧・編集)',
  viewer: '閲覧者(閲覧のみ)',
}

// supabase-jsのFunctionsHttpErrorはerror.messageに「Edge Function returned a non-2xx status code」
// という汎用文言しか持たないため、関数が返したJSON本文から実際のエラー内容を取り出す
async function extractFunctionError(e: unknown): Promise<string> {
  if (e instanceof FunctionsHttpError) {
    const body: { error?: string } | null = await e.context.json().catch(() => null)
    return body?.error ?? e.message
  }
  return e instanceof Error ? e.message : '処理に失敗しました'
}

/** ログインできる人の一覧と、メール招待。管理者だけが開ける設定ページの中で使う */
export function StaffSection() {
  const { session } = useAuth()
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<StaffRole>('viewer')

  async function refetch() {
    const { data, error } = await supabase.from('staff').select('*').order('display_name').returns<Staff[]>()
    if (error) throw error
    setStaff(data ?? [])
  }

  useEffect(() => {
    refetch()
      .catch((e) => setError(e instanceof Error ? e.message : '読み込みに失敗しました'))
      .finally(() => setLoading(false))
  }, [])

  async function handleInvite() {
    if (!email.trim() || !displayName.trim()) {
      setError('メールアドレスと表示名を入力してください')
      return
    }
    setInviting(true)
    setError(null)
    try {
      const { error } = await supabase.functions.invoke('invite-staff', {
        body: { action: 'invite', email: email.trim(), display_name: displayName.trim(), role },
      })
      if (error) throw error
      await refetch()
      setEmail('')
      setDisplayName('')
      setRole('viewer')
      setFormOpen(false)
    } catch (e) {
      setError(await extractFunctionError(e))
    } finally {
      setInviting(false)
    }
  }

  async function handleRoleChange(s: Staff, newRole: StaffRole) {
    setError(null)
    try {
      const { error } = await supabase.from('staff').update({ role: newRole }).eq('user_id', s.user_id)
      if (error) throw error
      await refetch()
    } catch (e) {
      setError(e instanceof Error ? e.message : '更新に失敗しました')
    }
  }

  async function handleDelete(s: Staff) {
    if (
      !window.confirm(
        `「${s.display_name}」を削除しますか?(ログインアカウント自体も完全に削除されます。戻す場合は改めて招待が必要です)`,
      )
    )
      return
    setError(null)
    try {
      const { error } = await supabase.functions.invoke('invite-staff', {
        body: { action: 'delete', user_id: s.user_id },
      })
      if (error) throw error
      await refetch()
    } catch (e) {
      setError(await extractFunctionError(e))
    }
  }

  return (
    <section className="staff-section">
      <div className="page-header">
        <h2>アカウント管理</h2>
        <button type="button" onClick={() => setFormOpen((v) => !v)}>
          {formOpen ? '取消' : '+ 招待'}
        </button>
      </div>
      <p className="reports-hint">
        「閲覧者」は週間プログラム・担当履歴・帳票印刷を見るだけで、割り当てやプログラムの変更はできません。
        招待するとメールで招待リンクが届き、本人がパスワードを設定します。
        パスワードを忘れた場合は招待し直す必要はありません。Supabaseの Authentication → Users
        から該当ユーザーを選び、パスワード再設定メールを送ると、招待時と同じ画面で設定し直せます。
      </p>
      {error && <p className="error-text">{error}</p>}
      {formOpen && (
        <div className="staff-invite-form">
          <label>
            メールアドレス
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            表示名
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
          <label>
            役割
            <select value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
              {STAFF_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={handleInvite} disabled={inviting}>
            {inviting ? '送信中...' : '招待を送信'}
          </button>
        </div>
      )}
      {loading ? (
        <p className="reports-hint">読み込み中...</p>
      ) : (
        <div className="crud-table-scroll">
          <table className="crud-table">
            <thead>
              <tr>
                <th>表示名</th>
                <th>メールアドレス</th>
                <th>役割</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.user_id}>
                  <td>{s.display_name}</td>
                  <td>{s.email ?? ''}</td>
                  <td>
                    <select value={s.role} onChange={(e) => handleRoleChange(s, e.target.value as StaffRole)}>
                      {STAFF_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="row-actions">
                    {/* 自分自身を消すと誰も管理できなくなるので塞いでおく */}
                    <button type="button" onClick={() => handleDelete(s)} disabled={s.user_id === session?.user.id}>
                      削除
                    </button>
                  </td>
                </tr>
              ))}
              {staff.length === 0 && (
                <tr>
                  <td colSpan={4}>まだ誰も登録されていません。</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
