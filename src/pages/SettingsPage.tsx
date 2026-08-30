import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAppData } from '../context/AppDataContext'
import { StaffSection } from '../components/StaffSection'

export function SettingsPage() {
  const { settings, refetchAll } = useAppData()
  const [startTime, setStartTime] = useState(settings.meeting_start_time)
  const [edited, setEdited] = useState(false)

  // 設定は非同期に読み込まれるので、読み込みが終わる前にこの画面が作られると
  // 既定値のままになってしまう(そのまま保存すると実際の値を上書きする)。
  // 読み込めた時点で反映し、自分で書き換えたあとは触らない
  useEffect(() => {
    if (!edited) setStartTime(settings.meeting_start_time)
  }, [settings.meeting_start_time, edited])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const { error } = await supabase
        .from('settings')
        .upsert({ key: 'meeting_start_time', value: startTime })
      if (error) throw error
      setEdited(false)
      await refetchAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <h1>設定</h1>
      <form className="settings-form" onSubmit={handleSubmit}>
        <label>
          集会の開始時刻
          <input type="time" value={startTime} onChange={(e) => {
            setStartTime(e.target.value)
            setEdited(true)
          }} />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" disabled={saving}>
          {saving ? '保存中...' : '保存'}
        </button>
      </form>

      <StaffSection />
    </div>
  )
}
