import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { AssignmentHistoryRow } from '../lib/candidates'
import type { Member, ProgramType, Song, TeachingPoint } from '../types/domain'

const DEFAULT_SETTINGS: Record<string, string> = {
  meeting_start_time: '19:00',
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Supabaseのクエリエラーは Error を継承していないため、instanceof では拾えないことがある
function extractErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return (e as { message: string }).message
  }
  return '不明なエラーが発生しました'
}

interface AppDataContextValue {
  members: Member[]
  programTypes: ProgramType[]
  songs: Song[]
  teachingPoints: TeachingPoint[]
  settings: Record<string, string>
  /**
   * 担当履歴の生データ。前回/今後の担当日やペア履歴は、表示している週の日付を基準に
   * 都度計算する必要があるため、集計済みマップではなく生の行を渡す(src/lib/candidates.ts参照)。
   */
  historyRows: AssignmentHistoryRow[]
  loading: boolean
  error: string | null
  refetchHistory: () => Promise<void>
  refetchAll: () => Promise<void>
}

const AppDataContext = createContext<AppDataContextValue | undefined>(undefined)

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [members, setMembers] = useState<Member[]>([])
  const [programTypes, setProgramTypes] = useState<ProgramType[]>([])
  const [songs, setSongs] = useState<Song[]>([])
  const [teachingPoints, setTeachingPoints] = useState<TeachingPoint[]>([])
  const [settings, setSettings] = useState<Record<string, string>>(DEFAULT_SETTINGS)
  const [historyRows, setHistoryRows] = useState<AssignmentHistoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchHistory = useCallback(async () => {
    const { data, error } = await supabase
      .from('assignments')
      .select(
        'member_id, partner_id, programs(date, title, section, program_type_id, teaching_point_id, program_types(name, partner_program_type_id))',
      )

    if (error) throw error

    const rows: AssignmentHistoryRow[] = (data ?? []).map((row) => {
      const program = Array.isArray(row.programs) ? row.programs[0] : row.programs
      const programType = program
        ? Array.isArray(program.program_types)
          ? program.program_types[0]
          : program.program_types
        : null
      return {
        member_id: row.member_id,
        partner_id: row.partner_id,
        program_date: program?.date ?? null,
        program_type_id: program?.program_type_id ?? null,
        partner_program_type_id: programType?.partner_program_type_id ?? null,
        has_teaching_point: !!program?.teaching_point_id,
        teaching_point_id: program?.teaching_point_id ?? null,
        program_type_name: programType?.name ?? null,
        program_title: program?.title ?? null,
        program_section: program?.section ?? null,
      }
    })

    setHistoryRows(rows)
  }, [])

  const loadAll = useCallback(async () => {
    const [membersRes, programTypesRes, songsRes, teachingPointsRes, settingsRes] = await Promise.all([
      supabase.from('members').select('*').order('last_name_kana', { ascending: true }),
      supabase.from('program_types').select('*'),
      supabase.from('songs').select('*').order('number', { ascending: true }),
      supabase.from('teaching_points').select('*').order('order_no', { ascending: true }),
      // settingsテーブルは後から追加されたため、未作成環境でも他のデータ取得を止めない
      supabase.from('settings').select('*'),
    ])

    if (membersRes.error) throw membersRes.error
    if (programTypesRes.error) throw programTypesRes.error
    if (songsRes.error) throw songsRes.error
    if (teachingPointsRes.error) throw teachingPointsRes.error

    // 認証が効く前に走ると、通信は成功したまま全てが0件で返ることがある。
    // 名簿・種別・歌が揃って空になるのは通常ありえないので、取得できなかったものとして
    // 扱い、呼び出し元の再試行に任せる(そのまま受け取ると、候補者が誰も出ない・
    // 種別が読めないといった状態で起動してしまう)
    const coreDataAllEmpty =
      (membersRes.data?.length ?? 0) === 0 &&
      (programTypesRes.data?.length ?? 0) === 0 &&
      (songsRes.data?.length ?? 0) === 0
    if (coreDataAllEmpty) throw new Error('データを取得できませんでした')

    setMembers(membersRes.data ?? [])
    setProgramTypes(programTypesRes.data ?? [])
    setSongs(songsRes.data ?? [])
    setTeachingPoints(teachingPointsRes.data ?? [])
    if (!settingsRes.error) {
      setSettings({
        ...DEFAULT_SETTINGS,
        ...Object.fromEntries((settingsRes.data ?? []).map((s) => [s.key, s.value])),
      })
    }

    await fetchHistory()
  }, [fetchHistory])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await loadAll()
    } catch (e) {
      // ログイン直後など、認証状態がまだ完全に反映されていないタイミングでの一時的な
      // 失敗を救済するため、少し待って1回だけ自動的に再試行してからエラー表示する
      await sleep(800)
      try {
        await loadAll()
      } catch (e2) {
        setError(extractErrorMessage(e2))
      }
    } finally {
      setLoading(false)
    }
  }, [loadAll])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  return (
    <AppDataContext.Provider
      value={{
        members,
        programTypes,
        songs,
        teachingPoints,
        settings,
        historyRows,
        loading,
        error,
        refetchHistory: fetchHistory,
        refetchAll: fetchAll,
      }}
    >
      {children}
    </AppDataContext.Provider>
  )
}

export function useAppData() {
  const ctx = useContext(AppDataContext)
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider')
  return ctx
}
