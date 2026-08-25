import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAppData } from '../context/AppDataContext'
import {
  buildLastAssignedMap,
  buildLastTeachingAssignmentMapsByPool,
  buildPairingMap,
  buildPrayerRecencyMap,
  getEligibleCandidates,
  PRAYER_TYPE_NAME,
} from '../lib/candidates'
import { todayString } from '../lib/localDate'
import { AssignmentCell } from '../components/AssignmentCell'
import { AutocompleteSelect } from '../components/AutocompleteSelect'
import type { Assignment, Member, Program, ProgramType, Song, TeachingPoint, Venue } from '../types/domain'

type ProgramWithType = Program & { program_types: ProgramType | null }
type AssignmentWithRelations = Assignment & {
  member: Member | null
  partner: Member | null
  venue: Venue | null
}

interface ProgramDraft {
  section: string
  program_type_id: string
  title: string
  duration_minutes: string
  material: string
  content: string
  song_id: string
  teaching_point_id: string
}

const EMPTY_DRAFT: ProgramDraft = {
  section: '',
  program_type_id: '',
  title: '',
  duration_minutes: '',
  material: '',
  content: '',
  song_id: '',
  teaching_point_id: '',
}

const SECTION_PRESETS = [
  '開会',
  '神の言葉の宝',
  '野外奉仕に励む',
  '伝道を楽しもう',
  'クリスチャンとして生活する',
  '閉会',
]

/** 日付入力欄には曜日が出ないため、隣に添えるための曜日(例: 木) */
function formatWeekday(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ja-JP', { weekday: 'short' })
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })
}

/** 今日以降で一番近い週。すべて過去なら最後の週を返す(初期表示と「今週」ボタンで共用) */
function currentWeekOf(dates: string[]): string | null {
  const today = todayString()
  return dates.find((d) => d >= today) ?? dates[dates.length - 1] ?? null
}

const SELECTED_DATE_KEY = 'weeklyProgram.selectedDate'

export function WeeklyProgramPage() {
  const {
    members,
    venues,
    programTypes,
    songs,
    teachingPoints,
    historyRows,
    loading: appDataLoading,
    error: appDataError,
    refetchHistory,
    refetchAll,
  } = useAppData()

  const [availableDates, setAvailableDates] = useState<string[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [programs, setPrograms] = useState<ProgramWithType[]>([])
  const [assignments, setAssignments] = useState<AssignmentWithRelations[]>([])
  const [loadingWeek, setLoadingWeek] = useState(false)
  const [savingProgramId, setSavingProgramId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [savingChairman, setSavingChairman] = useState(false)
  const [manageMode, setManageMode] = useState(false)
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null)
  const [draft, setDraft] = useState<ProgramDraft>(EMPTY_DRAFT)
  const [newRow, setNewRow] = useState<ProgramDraft>(EMPTY_DRAFT)
  const [pasteText, setPasteText] = useState('')
  const [pasteImporting, setPasteImporting] = useState(false)
  const [pasteResult, setPasteResult] = useState<{ added: number; warnings: string[] } | null>(null)

  const loadAvailableDates = useCallback(async () => {
    // 起動直後は認証がまだ効かず、通信は成功したまま0件で返ることがある。
    // そのまま受け取ると週の一覧が空になり、今日の日付が選ばれてナビゲーションも
    // 全て押せなくなるため、空だったときは少し待って一度だけ取り直す。
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 800))

      const { data, error } = await supabase.from('programs').select('date').order('date', { ascending: true })
      if (error) {
        if (attempt > 0) {
          setError(error.message)
          return [] as string[]
        }
        continue
      }

      const dates = Array.from(new Set((data ?? []).map((r) => r.date))).sort()
      if (dates.length === 0 && attempt === 0) continue

      setAvailableDates(dates)
      return dates
    }
    return [] as string[]
  }, [])

  useEffect(() => {
    loadAvailableDates().then((dates) => {
      const saved = sessionStorage.getItem(SELECTED_DATE_KEY)
      if (saved) {
        setSelectedDate(saved)
        return
      }
      setSelectedDate(currentWeekOf(dates) ?? todayString())
    })
  }, [loadAvailableDates])

  useEffect(() => {
    if (selectedDate) sessionStorage.setItem(SELECTED_DATE_KEY, selectedDate)
  }, [selectedDate])

  // loadWeek から最新の日付一覧を参照するためのもの。依存に入れると読み込みが
  // 走り直してしまうため、refで持つ
  const availableDatesRef = useRef<string[]>([])
  useEffect(() => {
    availableDatesRef.current = availableDates
  }, [availableDates])

  const loadWeek = useCallback(async (date: string) => {
    setLoadingWeek(true)
    setError(null)
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 800))

        const { data: programData, error: programError } = await supabase
          .from('programs')
          .select('*, program_types(*)')
          .eq('date', date)
          .order('order_no', { ascending: true })
          .returns<ProgramWithType[]>()

        if (programError) throw programError

        const weekPrograms = programData ?? []
        // 日付一覧に載っている週なのに0件で返るのは、認証が効く前に走ったとき。
        // (まだ何も登録していない週なら一覧にも載らないので、取り違えることはない)
        if (weekPrograms.length === 0 && attempt === 0 && availableDatesRef.current.includes(date)) continue

        setPrograms(weekPrograms)

        const programIds = weekPrograms.map((p) => p.id)
        if (programIds.length === 0) {
          setAssignments([])
          return
        }

        const { data: assignmentData, error: assignmentError } = await supabase
          .from('assignments')
          .select('*, member:members!member_id(*), partner:members!partner_id(*), venue:venues(*)')
          .in('program_id', programIds)
          .returns<AssignmentWithRelations[]>()

        if (assignmentError) throw assignmentError
        setAssignments(assignmentData ?? [])
        return
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '不明なエラーが発生しました')
    } finally {
      setLoadingWeek(false)
    }
  }, [])

  useEffect(() => {
    if (selectedDate) loadWeek(selectedDate)
  }, [selectedDate, loadWeek])

  // 候補者の前回/今後日付・ペア履歴は、表示中の週の日付を基準に都度計算する
  // (先の週まで入力済みの場合に、未来の日付を「前回」と誤表示しないため)
  const referenceDate = selectedDate ?? todayString()

  const lastAssignedAsMemberMap = useMemo(
    () => buildLastAssignedMap(historyRows, 'member', referenceDate),
    [historyRows, referenceDate],
  )
  const lastAssignedAsPartnerMap = useMemo(
    () => buildLastAssignedMap(historyRows, 'partner', referenceDate),
    [historyRows, referenceDate],
  )

  // 種別id -> 候補プールキー(recency_pool未設定なら種別id自身をキーにする=他種別と混ざらない)
  const poolKeyByTypeId = useMemo(() => {
    const map = new Map<string, string>()
    for (const pt of programTypes) map.set(pt.id, pt.recency_pool || pt.id)
    return map
  }, [programTypes])

  const lastTeachingAssignmentAsMemberMapsByPool = useMemo(
    () => buildLastTeachingAssignmentMapsByPool(historyRows, 'member', referenceDate, poolKeyByTypeId),
    [historyRows, referenceDate, poolKeyByTypeId],
  )
  const lastTeachingAssignmentAsPartnerMapsByPool = useMemo(
    () => buildLastTeachingAssignmentMapsByPool(historyRows, 'partner', referenceDate, poolKeyByTypeId),
    [historyRows, referenceDate, poolKeyByTypeId],
  )
  const pairingMap = useMemo(() => buildPairingMap(historyRows, referenceDate), [historyRows, referenceDate])

  // 祈りは開会・閉会で同じ種別を使うため、候補一覧ではどちらだったのかが分かるようにする
  const prayerRecencyMap = useMemo(
    () => buildPrayerRecencyMap(historyRows, referenceDate),
    [historyRows, referenceDate],
  )

  const nearbyDates = useMemo(() => {
    if (!selectedDate) return { prev1: null, next1: null, prev2: null, next2: null }
    const idx = availableDates.indexOf(selectedDate)
    if (idx === -1) return { prev1: null, next1: null, prev2: null, next2: null }
    return {
      prev1: availableDates[idx - 1] ?? null,
      next1: availableDates[idx + 1] ?? null,
      prev2: availableDates[idx - 2] ?? null,
      next2: availableDates[idx + 2] ?? null,
    }
  }, [availableDates, selectedDate])

  const [prev1Map, setPrev1Map] = useState<Map<string, string[]>>(new Map())
  const [next1Map, setNext1Map] = useState<Map<string, string[]>>(new Map())
  const [prev2Map, setPrev2Map] = useState<Map<string, string[]>>(new Map())
  const [next2Map, setNext2Map] = useState<Map<string, string[]>>(new Map())

  useEffect(() => {
    const { prev1, next1, prev2, next2 } = nearbyDates
    const allDates = [prev1, next1, prev2, next2].filter((d): d is string => !!d)

    if (allDates.length === 0) {
      setPrev1Map(new Map())
      setNext1Map(new Map())
      setPrev2Map(new Map())
      setNext2Map(new Map())
      return
    }

    let cancelled = false
    async function loadNearby() {
      const { data: progRows, error: progError } = await supabase
        .from('programs')
        .select('id, date, title, program_types(name)')
        .in('date', allDates)
        .returns<{ id: string; date: string; title: string | null; program_types: ProgramType | ProgramType[] | null }[]>()
      if (progError || !progRows || cancelled) return

      const programIds = progRows.map((p) => p.id)
      if (programIds.length === 0) {
        if (!cancelled) {
          setPrev1Map(new Map())
          setNext1Map(new Map())
          setPrev2Map(new Map())
          setNext2Map(new Map())
        }
        return
      }

      const { data: asgRows, error: asgError } = await supabase
        .from('assignments')
        .select('member_id, partner_id, program_id')
        .in('program_id', programIds)
      if (asgError || !asgRows || cancelled) return

      const infoByProgramId = new Map(
        progRows.map((p) => {
          const pt = Array.isArray(p.program_types) ? p.program_types[0] : p.program_types
          return [p.id, { date: p.date, label: p.title ?? pt?.name ?? 'プログラム' }]
        }),
      )
      const maps = {
        prev1: new Map<string, string[]>(),
        next1: new Map<string, string[]>(),
        prev2: new Map<string, string[]>(),
        next2: new Map<string, string[]>(),
      }
      for (const row of asgRows) {
        const info = infoByProgramId.get(row.program_id)
        if (!info) continue
        const target =
          info.date === prev1 ? maps.prev1 : info.date === next1 ? maps.next1 : info.date === prev2 ? maps.prev2 : info.date === next2 ? maps.next2 : null
        if (!target) continue
        // 同じプログラムでも、担当者として出たのかペアとして出たのかを見分けられるようにする
        for (const [memberId, role] of [
          [row.member_id, 'member'],
          [row.partner_id, 'partner'],
        ] as const) {
          if (!memberId) continue
          const labels = target.get(memberId) ?? []
          labels.push(role === 'partner' ? `${info.label}(ペア)` : info.label)
          target.set(memberId, labels)
        }
      }
      if (!cancelled) {
        setPrev1Map(maps.prev1)
        setNext1Map(maps.next1)
        setPrev2Map(maps.prev2)
        setNext2Map(maps.next2)
      }
    }
    loadNearby()
    return () => {
      cancelled = true
    }
  }, [nearbyDates.prev1, nearbyDates.next1, nearbyDates.prev2, nearbyDates.next2])

  function getProximityLabel(memberId: string | undefined | null): string | undefined {
    if (!memberId) return undefined
    const parts: string[] = []
    if (prev1Map.has(memberId)) parts.push('-1')
    if (next1Map.has(memberId)) parts.push('1')
    if (parts.length > 0) return parts.join(',')
    if (prev2Map.has(memberId)) parts.push('-2')
    if (next2Map.has(memberId)) parts.push('2')
    return parts.length > 0 ? parts.join(',') : undefined
  }

  function getProximityTooltip(memberId: string | undefined | null): string | undefined {
    if (!memberId) return undefined
    const oneWeekParts: string[] = []
    if (nearbyDates.prev1 && prev1Map.has(memberId)) {
      oneWeekParts.push(`${formatShortDate(nearbyDates.prev1)}: ${prev1Map.get(memberId)!.join('、')}`)
    }
    if (nearbyDates.next1 && next1Map.has(memberId)) {
      oneWeekParts.push(`${formatShortDate(nearbyDates.next1)}: ${next1Map.get(memberId)!.join('、')}`)
    }
    if (oneWeekParts.length > 0) return oneWeekParts.join('\n')

    const twoWeekParts: string[] = []
    if (nearbyDates.prev2 && prev2Map.has(memberId)) {
      twoWeekParts.push(`${formatShortDate(nearbyDates.prev2)}: ${prev2Map.get(memberId)!.join('、')}`)
    }
    if (nearbyDates.next2 && next2Map.has(memberId)) {
      twoWeekParts.push(`${formatShortDate(nearbyDates.next2)}: ${next2Map.get(memberId)!.join('、')}`)
    }
    return twoWeekParts.length > 0 ? twoWeekParts.join('\n') : undefined
  }

  const oneWeekAwayIds = useMemo(() => new Set([...prev1Map.keys(), ...next1Map.keys()]), [prev1Map, next1Map])
  const twoWeeksAwayIds = useMemo(() => new Set([...prev2Map.keys(), ...next2Map.keys()]), [prev2Map, next2Map])

  function goPrev() {
    if (!selectedDate) return
    const candidates = availableDates.filter((d) => d < selectedDate)
    if (candidates.length > 0) setSelectedDate(candidates[candidates.length - 1])
  }

  function goNext() {
    if (!selectedDate) return
    const next = availableDates.find((d) => d > selectedDate)
    if (next) setSelectedDate(next)
  }

  function goFirst() {
    const first = availableDates[0]
    if (first) setSelectedDate(first)
  }

  function goLast() {
    const last = availableDates[availableDates.length - 1]
    if (last) setSelectedDate(last)
  }

  function goCurrentWeek() {
    const current = currentWeekOf(availableDates)
    if (current) setSelectedDate(current)
  }

  const hasPrev = availableDates.some((d) => selectedDate && d < selectedDate)
  const hasNext = availableDates.some((d) => selectedDate && d > selectedDate)

  // 今表示しているのが「今週」(今日以降で一番近い週)かどうか。日付の色分けに使う
  const isCurrentWeek = !!selectedDate && selectedDate === currentWeekOf(availableDates)

  // 標準ではカレンダーのアイコンを押したときしか開かないが、日付は直接入力せず
  // カレンダーから選ぶ使い方なので、欄のどこを押しても開くようにする
  function openDatePicker(e: MouseEvent<HTMLInputElement>) {
    const el = e.currentTarget
    if (typeof el.showPicker !== 'function') return
    try {
      el.showPicker()
    } catch {
      // 開けないブラウザでは標準どおりアイコンから開いてもらう
    }
  }

  const programTypesById = useMemo(() => new Map(programTypes.map((pt) => [pt.id, pt])), [programTypes])

  const programTypeOptions = useMemo(
    () => programTypes.map((pt) => ({ id: pt.id, label: pt.name })),
    [programTypes],
  )
  const songOptions = useMemo(
    () => songs.map((s) => ({ id: s.id, label: `${s.number}番 ${s.title}` })),
    [songs],
  )
  const teachingPointOptions = useMemo(
    () => teachingPoints.map((t) => ({ id: t.id, label: `${t.code} ${t.title}` })),
    [teachingPoints],
  )

  const duplicateSetFor = useMemo(() => {
    return (programId: string, slot: 'member_id' | 'partner_id') => {
      const set = new Set<string>()
      for (const a of assignments) {
        for (const field of ['member_id', 'partner_id'] as const) {
          const val = a[field]
          if (!val) continue
          if (a.program_id === programId && field === slot) continue
          set.add(val)
        }
      }
      return set
    }
  }, [assignments])

  async function upsertAssignment(
    programId: string,
    patch: Partial<Pick<Assignment, 'member_id' | 'partner_id' | 'venue_id'>>,
  ) {
    setSavingProgramId(programId)
    setError(null)
    try {
      const existing = assignments.find((a) => a.program_id === programId)
      if (existing) {
        const { error } = await supabase.from('assignments').update(patch).eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('assignments').insert({ program_id: programId, ...patch })
        if (error) throw error
      }
      if (selectedDate) await loadWeek(selectedDate)
      await refetchHistory()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存に失敗しました')
    } finally {
      setSavingProgramId(null)
    }
  }

  function draftToPatch(d: ProgramDraft) {
    return {
      section: d.section.trim() || null,
      program_type_id: d.program_type_id || null,
      title: d.title.trim() || null,
      duration_minutes: d.duration_minutes ? Number(d.duration_minutes) : null,
      material: d.material.trim() || null,
      content: d.content.trim() || null,
      song_id: d.song_id || null,
      teaching_point_id: d.teaching_point_id || null,
    }
  }

  function startEdit(program: ProgramWithType) {
    setEditingProgramId(program.id)
    setDraft({
      section: program.section ?? '',
      program_type_id: program.program_type_id ?? '',
      title: program.title ?? '',
      duration_minutes: program.duration_minutes?.toString() ?? '',
      material: program.material ?? '',
      content: program.content ?? '',
      song_id: program.song_id ?? '',
      teaching_point_id: program.teaching_point_id ?? '',
    })
  }

  function cancelEdit() {
    setEditingProgramId(null)
    setDraft(EMPTY_DRAFT)
  }

  async function saveEdit() {
    if (!editingProgramId) return
    setError(null)
    try {
      const { error } = await supabase.from('programs').update(draftToPatch(draft)).eq('id', editingProgramId)
      if (error) throw error
      cancelEdit()
      if (selectedDate) await loadWeek(selectedDate)
      await refetchHistory()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存に失敗しました')
    }
  }

  async function handleAddProgram(e: FormEvent) {
    e.preventDefault()
    if (!selectedDate) return
    setError(null)
    try {
      const maxOrder = programs.reduce((max, p) => Math.max(max, p.order_no ?? 0), 0)
      const { data: created, error } = await supabase
        .from('programs')
        .insert({
          date: selectedDate,
          order_no: maxOrder + 1,
          ...draftToPatch(newRow),
        })
        .select()
        .single()
      if (error) throw error

      const defaultVenue = venues.find((v) => v.name === '本会場') ?? venues[0]
      if (created && defaultVenue) {
        const { error: assignmentError } = await supabase
          .from('assignments')
          .insert({ program_id: created.id, venue_id: defaultVenue.id })
        if (assignmentError) throw assignmentError
      }

      setNewRow(EMPTY_DRAFT)
      await loadWeek(selectedDate)
      await loadAvailableDates()
    } catch (e) {
      setError(e instanceof Error ? e.message : '追加に失敗しました')
    }
  }

  async function handlePasteImport() {
    if (!selectedDate) return
    const lines = pasteText.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim() !== '')
    if (lines.length === 0) return

    setPasteImporting(true)
    setError(null)
    setPasteResult(null)

    try {
      const warnings: string[] = []
      const maxOrder = programs.reduce((max, p) => Math.max(max, p.order_no ?? 0), 0)

      const rows = lines.map((line, i) => {
        const cols = line.split('\t')
        const [section = '', typeName = '', title = '', material = '', content = '', duration = '', songNumber = '', tpCode = ''] =
          cols

        let programTypeId: string | null = null
        if (typeName.trim()) {
          const match = programTypes.find((pt) => pt.name === typeName.trim())
          if (match) programTypeId = match.id
          else warnings.push(`${i + 1}行目: 種別「${typeName.trim()}」が見つかりません`)
        }

        let songId: string | null = null
        if (songNumber.trim()) {
          const match = songs.find((s) => String(s.number) === songNumber.trim())
          if (match) songId = match.id
          else warnings.push(`${i + 1}行目: 歌番号「${songNumber.trim()}」が見つかりません`)
        }

        let teachingPointId: string | null = null
        if (tpCode.trim()) {
          const match = teachingPoints.find((t) => t.code === tpCode.trim())
          if (match) teachingPointId = match.id
          else warnings.push(`${i + 1}行目: 課題番号「${tpCode.trim()}」が見つかりません`)
        }

        return {
          date: selectedDate,
          order_no: maxOrder + i + 1,
          section: section.trim() || null,
          program_type_id: programTypeId,
          title: title.trim() || null,
          material: material.trim() || null,
          content: content.trim() || null,
          duration_minutes: duration.trim() ? Number(duration.trim()) : null,
          song_id: songId,
          teaching_point_id: teachingPointId,
        }
      })

      const { data: created, error } = await supabase.from('programs').insert(rows).select()
      if (error) throw error

      const defaultVenue = venues.find((v) => v.name === '本会場') ?? venues[0]
      if (created && created.length > 0 && defaultVenue) {
        const { error: assignmentError } = await supabase
          .from('assignments')
          .insert(created.map((p) => ({ program_id: p.id, venue_id: defaultVenue.id })))
        if (assignmentError) throw assignmentError
      }

      setPasteText('')
      setPasteResult({ added: created?.length ?? 0, warnings })
      await loadWeek(selectedDate)
      await loadAvailableDates()
    } catch (e) {
      setError(e instanceof Error ? e.message : '取り込みに失敗しました')
    } finally {
      setPasteImporting(false)
    }
  }

  async function handleDeleteProgram(program: ProgramWithType) {
    if (!window.confirm(`「${program.title ?? program.program_types?.name ?? 'このプログラム'}」を削除しますか?`)) {
      return
    }
    setError(null)
    try {
      const { error: deleteAssignmentError } = await supabase
        .from('assignments')
        .delete()
        .eq('program_id', program.id)
      if (deleteAssignmentError) throw deleteAssignmentError

      const { error: deleteProgramError } = await supabase.from('programs').delete().eq('id', program.id)
      if (deleteProgramError) throw deleteProgramError

      if (selectedDate) await loadWeek(selectedDate)
      await loadAvailableDates()
      await refetchHistory()
    } catch (e) {
      setError(e instanceof Error ? e.message : '削除に失敗しました')
    }
  }

  async function moveProgram(program: ProgramWithType, direction: -1 | 1) {
    const sorted = [...programs].sort((a, b) => (a.order_no ?? 0) - (b.order_no ?? 0))
    const index = sorted.findIndex((p) => p.id === program.id)
    const neighborIndex = index + direction
    if (neighborIndex < 0 || neighborIndex >= sorted.length) return
    const neighbor = sorted[neighborIndex]

    setError(null)
    try {
      const [{ error: e1 }, { error: e2 }] = await Promise.all([
        supabase.from('programs').update({ order_no: neighbor.order_no }).eq('id', program.id),
        supabase.from('programs').update({ order_no: program.order_no }).eq('id', neighbor.id),
      ])
      if (e1) throw e1
      if (e2) throw e2
      if (selectedDate) await loadWeek(selectedDate)
    } catch (e) {
      setError(e instanceof Error ? e.message : '並べ替えに失敗しました')
    }
  }

  if (appDataLoading) return <div className="center-message">データを読み込み中...</div>
  if (appDataError) {
    return (
      <div className="center-message error-text">
        <p>{appDataError}</p>
        <button type="button" style={{ marginTop: 12 }} onClick={() => refetchAll()}>
          再読み込み
        </button>
      </div>
    )
  }

  const sortedPrograms = [...programs].sort((a, b) => (a.order_no ?? 0) - (b.order_no ?? 0))

  const openingType = programTypes.find((pt) => pt.name === '開会の言葉')
  const closingType = programTypes.find((pt) => pt.name === '閉会の言葉')
  const openingProgram = openingType ? programs.find((p) => p.program_type_id === openingType.id) : undefined
  const closingProgram = closingType ? programs.find((p) => p.program_type_id === closingType.id) : undefined
  const chairman = openingProgram
    ? assignments.find((a) => a.program_id === openingProgram.id)?.member
    : undefined
  const chairmanCandidates = openingType
    ? getEligibleCandidates({
        members,
        programType: openingType,
        lastAssignedMap: lastAssignedAsMemberMap,
        referenceDate,
        duplicateMemberIds: openingProgram ? duplicateSetFor(openingProgram.id, 'member_id') : new Set(),
      })
    : []

  async function handleAssignChairman(memberId: string | null) {
    setSavingChairman(true)
    if (openingProgram) await upsertAssignment(openingProgram.id, { member_id: memberId })
    if (closingProgram) await upsertAssignment(closingProgram.id, { member_id: memberId })
    setSavingChairman(false)
  }

  function findSong(id: string | null): Song | undefined {
    return id ? songs.find((s) => s.id === id) : undefined
  }

  function findTeachingPoint(id: string | null): TeachingPoint | undefined {
    return id ? teachingPoints.find((t) => t.id === id) : undefined
  }

  function renderProgramDetails(program: ProgramWithType) {
    const song = findSong(program.song_id)
    const teachingPoint = findTeachingPoint(program.teaching_point_id)
    return (
      <>
        {program.material && <div className="program-detail">資料: {program.material}</div>}
        {program.content && <div className="program-detail">{program.content}</div>}
        {song && (
          <div className="program-detail">
            {song.number}番 {song.title}
          </div>
        )}
        {teachingPoint && <div className="program-detail">教励課題: {teachingPoint.title}</div>}
      </>
    )
  }

  return (
    <div className="page">
      <h1>週ごとのプログラム</h1>

      <div className="date-nav">
        <button type="button" onClick={goFirst} disabled={!hasPrev}>
          《 最初
        </button>
        <button type="button" onClick={goPrev} disabled={!hasPrev}>
          ← 前週
        </button>
        <input
          type="date"
          className={isCurrentWeek ? 'date-nav-current' : ''}
          value={selectedDate ?? ''}
          onChange={(e) => setSelectedDate(e.target.value)}
          onClick={openDatePicker}
        />
        {/* 日付入力欄には曜日を差し込めないため、すぐ右に添える */}
        {selectedDate && (
          <span className={`date-nav-weekday ${isCurrentWeek ? 'date-nav-current' : ''}`}>
            ({formatWeekday(selectedDate)})
          </span>
        )}
        <button type="button" onClick={goCurrentWeek} disabled={isCurrentWeek}>
          今週
        </button>
        <button type="button" onClick={goNext} disabled={!hasNext}>
          次週 →
        </button>
        <button type="button" onClick={goLast} disabled={!hasNext}>
          最後 》
        </button>

        {!manageMode && (openingProgram || closingProgram) && (
          <div className="chairman-field">
            <span className="chairman-label">司会者:</span>
            <AssignmentCell
              currentMember={chairman}
              candidates={chairmanCandidates}
              referenceDate={referenceDate}
              saving={savingChairman}
              placeholder="未選択"
              onAssign={handleAssignChairman}
            />
          </div>
        )}

        <button type="button" className="manage-toggle" onClick={() => setManageMode((m) => !m)}>
          {manageMode ? '割当画面に戻る' : 'プログラムを編集'}
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      {manageMode && selectedDate && (
        <details className="paste-import">
          <summary>表形式で貼り付けて一括追加</summary>
          <p className="paste-import-hint">
            Excel等で「区分・種別名・タイトル・資料・内容・時間(分)・歌番号・課題番号」の順に列を作り、範囲コピーしてここに貼り付けてください(各列はタブ区切り、1行1プログラム)。種別名・歌番号・課題番号は既存の登録内容と完全一致で照合します。
          </p>
          <textarea
            className="paste-import-textarea"
            rows={6}
            placeholder={'開会\t開会の言葉\t\t\t\t1\t\t\n神の言葉の宝\t聖書朗読\t\tエレミヤ23:25-36\t\t4\t\t教励 第11課'}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
          />
          <button type="button" onClick={handlePasteImport} disabled={pasteImporting || !pasteText.trim()}>
            {pasteImporting ? '取り込み中...' : '取り込む'}
          </button>
          {pasteResult && (
            <div className="paste-import-result">
              <p>{pasteResult.added}件追加しました。</p>
              {pasteResult.warnings.length > 0 && (
                <ul>
                  {pasteResult.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </details>
      )}

      {loadingWeek ? (
        <div className="center-message">読み込み中...</div>
      ) : (
        <table className="program-table">
          <thead>
            <tr>
              <th>区分</th>
              <th>プログラム</th>
              <th>時間</th>
              {manageMode ? (
                <th>操作</th>
              ) : (
                <>
                  <th>担当者</th>
                  <th>ペア</th>
                  <th>会場</th>
                  <th>スリップ</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {sortedPrograms.map((program, index) => {
              const programType = program.program_types
              const assignment = assignments.find((a) => a.program_id === program.id)
              const saving = savingProgramId === program.id
              const isEditing = editingProgramId === program.id

              if (manageMode) {
                if (isEditing) {
                  return (
                    <tr key={program.id}>
                      <td>
                        <input
                          list="section-options"
                          value={draft.section}
                          onChange={(e) => setDraft((d) => ({ ...d, section: e.target.value }))}
                        />
                      </td>
                      <td>
                        <AutocompleteSelect
                          options={programTypeOptions}
                          value={draft.program_type_id}
                          placeholder="種別(任意)"
                          onChange={(id) => setDraft((d) => ({ ...d, program_type_id: id }))}
                        />
                        <input
                          placeholder="タイトル(任意)"
                          value={draft.title}
                          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                        />
                        <input
                          placeholder="資料(任意)"
                          value={draft.material}
                          onChange={(e) => setDraft((d) => ({ ...d, material: e.target.value }))}
                        />
                        <input
                          placeholder="内容(任意)"
                          value={draft.content}
                          onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))}
                        />
                        <AutocompleteSelect
                          options={songOptions}
                          value={draft.song_id}
                          placeholder="歌(任意)"
                          onChange={(id) => setDraft((d) => ({ ...d, song_id: id }))}
                        />
                        <AutocompleteSelect
                          options={teachingPointOptions}
                          value={draft.teaching_point_id}
                          placeholder="教励課題(任意)"
                          onChange={(id) => setDraft((d) => ({ ...d, teaching_point_id: id }))}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          value={draft.duration_minutes}
                          onChange={(e) => setDraft((d) => ({ ...d, duration_minutes: e.target.value }))}
                        />
                      </td>
                      <td className="row-actions">
                        <button type="button" onClick={saveEdit}>
                          保存
                        </button>
                        <button type="button" onClick={cancelEdit}>
                          取消
                        </button>
                      </td>
                    </tr>
                  )
                }

                return (
                  <tr key={program.id}>
                    <td>{program.section ?? ''}</td>
                    <td>
                      <div className="program-title">{program.title ?? programType?.name}</div>
                      {programType && <div className="program-type-name">{programType.name}</div>}
                      {renderProgramDetails(program)}
                    </td>
                    <td>{program.duration_minutes ? `${program.duration_minutes}分` : ''}</td>
                    <td className="row-actions">
                      <button type="button" onClick={() => moveProgram(program, -1)} disabled={index === 0}>
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveProgram(program, 1)}
                        disabled={index === sortedPrograms.length - 1}
                      >
                        ↓
                      </button>
                      <button type="button" onClick={() => startEdit(program)}>
                        編集
                      </button>
                      <button type="button" onClick={() => handleDeleteProgram(program)}>
                        削除
                      </button>
                    </td>
                  </tr>
                )
              }

              const memberDuplicateSet = programType ? duplicateSetFor(program.id, 'member_id') : new Set<string>()
              const partnerDuplicateSet = programType?.needs_partner
                ? duplicateSetFor(program.id, 'partner_id')
                : new Set<string>()

              const memberPoolKey = programType ? (poolKeyByTypeId.get(programType.id) ?? programType.id) : null

              const memberCandidates = programType
                ? getEligibleCandidates({
                    members,
                    programType,
                    lastAssignedMap: lastAssignedAsMemberMap,
                    referenceDate,
                    duplicateMemberIds: memberDuplicateSet,
                    // 候補プール(recency_pool)が設定された種別は、この種別に限らずプール全体での
                    // 「担当者としての」直近担当日を見る(特定の実演だけに偏らないようにするため。
                    // ペアとしての履歴は混在させない)。教励課題の有無は問わない。
                    // 祈りは開会・閉会をまとめて回しつつ、前回がどちらだったかを表示する
                    broadRecencyMap:
                      programType.name === PRAYER_TYPE_NAME
                        ? prayerRecencyMap
                        : programType.recency_pool && memberPoolKey
                          ? lastTeachingAssignmentAsMemberMapsByPool.get(memberPoolKey)
                          : undefined,
                  })
                : []

              const partnerProgramType = programType?.partner_program_type_id
                ? (programTypesById.get(programType.partner_program_type_id) ?? programType)
                : programType

              const partnerPoolKey = partnerProgramType
                ? (poolKeyByTypeId.get(partnerProgramType.id) ?? partnerProgramType.id)
                : null

              const partnerCandidates =
                programType?.needs_partner && partnerProgramType
                  ? getEligibleCandidates({
                      members,
                      programType: partnerProgramType,
                      // ペアとしての直近担当日のみを見る(担当者としての履歴は混在させない)
                      lastAssignedMap: lastAssignedAsPartnerMap,
                      referenceDate,
                      duplicateMemberIds: partnerDuplicateSet,
                      requiredGender: programType.partner_same_gender ? assignment?.member?.gender : undefined,
                      // 候補プール(recency_pool)が設定された種別は、この種別に限らずプール全体での
                      // 「ペアとしての」直近担当日を見る(会話を始める/再び話し合う等の種別をまたいで
                      // 直近順に並べるため。担当者としての履歴は混在させない)。教励課題の有無は問わない。
                      broadRecencyMap:
                        partnerProgramType.recency_pool && partnerPoolKey
                          ? lastTeachingAssignmentAsPartnerMapsByPool.get(partnerPoolKey)
                          : undefined,
                      // 課題付きプログラムのペアは、主担当と一巡するまでの間に既にペアだった人を優先度下げ(除外はしない)
                      pairingMap: program.teaching_point_id ? pairingMap : undefined,
                      currentMemberId: program.teaching_point_id ? assignment?.member?.id : undefined,
                    })
                  : []

              return (
                <tr key={program.id}>
                  <td>{program.section ?? ''}</td>
                  <td>
                    <div className="program-title">{program.title ?? programType?.name}</div>
                    {programType && <div className="program-type-name">{programType.name}</div>}
                    {renderProgramDetails(program)}
                  </td>
                  <td>{program.duration_minutes ? `${program.duration_minutes}分` : ''}</td>
                  <td>
                    {programType ? (
                      <AssignmentCell
                        currentMember={assignment?.member}
                        candidates={memberCandidates}
                        referenceDate={referenceDate}
                        saving={saving}
                        isDuplicateToday={!!assignment?.member && memberDuplicateSet.has(assignment.member.id)}
                        nearOneWeek={!!assignment?.member && oneWeekAwayIds.has(assignment.member.id)}
                        nearTwoWeeks={!!assignment?.member && twoWeeksAwayIds.has(assignment.member.id)}
                        proximityLabel={getProximityLabel(assignment?.member?.id)}
                        proximityTooltip={getProximityTooltip(assignment?.member?.id)}
                        onAssign={(memberId) => upsertAssignment(program.id, { member_id: memberId })}
                      />
                    ) : (
                      <span className="assignment-disabled">未設定のプログラム種別</span>
                    )}
                  </td>
                  <td>
                    {programType?.needs_partner ? (
                      <AssignmentCell
                        currentMember={assignment?.partner}
                        candidates={partnerCandidates}
                        referenceDate={referenceDate}
                        saving={saving}
                        isDuplicateToday={!!assignment?.partner && partnerDuplicateSet.has(assignment.partner.id)}
                        nearOneWeek={!!assignment?.partner && oneWeekAwayIds.has(assignment.partner.id)}
                        nearTwoWeeks={!!assignment?.partner && twoWeeksAwayIds.has(assignment.partner.id)}
                        proximityLabel={getProximityLabel(assignment?.partner?.id)}
                        proximityTooltip={getProximityTooltip(assignment?.partner?.id)}
                        onAssign={(memberId) => upsertAssignment(program.id, { partner_id: memberId })}
                      />
                    ) : (
                      <span className="assignment-disabled">-</span>
                    )}
                  </td>
                  <td>
                    <select
                      value={assignment?.venue_id ?? ''}
                      disabled={saving}
                      onChange={(e) => upsertAssignment(program.id, { venue_id: e.target.value || null })}
                    >
                      <option value="">未設定</option>
                      {venues.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {assignment?.id && (
                      <Link to={`/print/slip/${assignment.id}`} target="_blank" rel="noopener noreferrer">
                        印刷
                      </Link>
                    )}
                  </td>
                </tr>
              )
            })}

            {manageMode && selectedDate && (
              <tr>
                <td>
                  <input
                    list="section-options"
                    placeholder="区分"
                    value={newRow.section}
                    onChange={(e) => setNewRow((d) => ({ ...d, section: e.target.value }))}
                  />
                </td>
                <td>
                  <AutocompleteSelect
                    options={programTypeOptions}
                    value={newRow.program_type_id}
                    placeholder="種別(任意)"
                    onChange={(id) => setNewRow((d) => ({ ...d, program_type_id: id }))}
                  />
                  <input
                    placeholder="タイトル(任意)"
                    value={newRow.title}
                    onChange={(e) => setNewRow((d) => ({ ...d, title: e.target.value }))}
                  />
                  <input
                    placeholder="資料(任意)"
                    value={newRow.material}
                    onChange={(e) => setNewRow((d) => ({ ...d, material: e.target.value }))}
                  />
                  <input
                    placeholder="内容(任意)"
                    value={newRow.content}
                    onChange={(e) => setNewRow((d) => ({ ...d, content: e.target.value }))}
                  />
                  <AutocompleteSelect
                    options={songOptions}
                    value={newRow.song_id}
                    placeholder="歌(任意)"
                    onChange={(id) => setNewRow((d) => ({ ...d, song_id: id }))}
                  />
                  <AutocompleteSelect
                    options={teachingPointOptions}
                    value={newRow.teaching_point_id}
                    placeholder="教励課題(任意)"
                    onChange={(id) => setNewRow((d) => ({ ...d, teaching_point_id: id }))}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    placeholder="分"
                    value={newRow.duration_minutes}
                    onChange={(e) => setNewRow((d) => ({ ...d, duration_minutes: e.target.value }))}
                  />
                </td>
                <td className="row-actions">
                  <button type="button" onClick={handleAddProgram}>
                    + 追加
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {!manageMode && !loadingWeek && sortedPrograms.length === 0 && (
        <p className="center-message">
          この日のプログラムは登録されていません。「プログラムを編集」から追加できます。
        </p>
      )}

      <datalist id="section-options">
        {SECTION_PRESETS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  )
}
