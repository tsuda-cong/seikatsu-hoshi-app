import type { AssignmentHistoryRow } from './candidates'
import type { Member, ProgramType } from '../types/domain'

/** その回に本人がどちらで入っていたか */
export type AssignmentRole = 'member' | 'partner'

export interface HistoryEntry {
  date: string
  section: string | null
  /** 表示用のプログラム名(タイトルが無ければ種別名) */
  programLabel: string
  /** 本人に適用される種別id(ペアで入った回は、ペア側のルール参照元があればそちら) */
  typeId: string | null
  typeName: string | null
  role: AssignmentRole
  /** 担当者だった回はペア、ペアだった回は担当者 */
  counterpartId: string | null
  teachingPointId: string | null
  hasTeachingPoint: boolean
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(a).getTime() - new Date(b).getTime()) / (1000 * 60 * 60 * 24))
}

/** 本人が関わった全ての回を、新しい順に並べて返す */
export function buildMemberTimeline(rows: AssignmentHistoryRow[], memberId: string): HistoryEntry[] {
  const entries: HistoryEntry[] = []

  for (const row of rows) {
    if (!row.program_date) continue
    const isMember = row.member_id === memberId
    const isPartner = row.partner_id === memberId
    if (!isMember && !isPartner) continue

    // ペアで入った回は、ペア側のルール参照元(例: 会衆の聖書研究の朗読者)を本人の種別とみなす。
    // 候補選択側(buildLastAssignedMap)と同じ扱いにして、集計がずれないようにする
    const typeId = isMember ? row.program_type_id : (row.partner_program_type_id ?? row.program_type_id)

    entries.push({
      date: row.program_date,
      section: row.program_section,
      programLabel: row.program_title ?? row.program_type_name ?? '(種別未設定)',
      typeId,
      typeName: row.program_type_name,
      role: isMember ? 'member' : 'partner',
      counterpartId: isMember ? row.partner_id : row.member_id,
      teachingPointId: row.teaching_point_id,
      hasTeachingPoint: row.has_teaching_point,
    })
  }

  entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  return entries
}

export interface TypeSummary {
  /** 候補プールのキー(recency_poolが未設定なら種別id) */
  key: string
  label: string
  count: number
  /** 今日以前でいちばん新しい担当日 */
  lastDate: string | null
  /** 今日より先でいちばん近い担当日 */
  nextDate: string | null
  /** 担当日の平均間隔(日)。2回以上入っている場合のみ */
  averageCycleDays: number | null
}

/** 種別id -> 候補プールのキー。recency_pool未設定の種別は他と混ざらないよう種別id自身をキーにする */
export function buildPoolKeyByTypeId(programTypes: ProgramType[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const pt of programTypes) map.set(pt.id, pt.recency_pool || pt.id)
  return map
}

/** プールのキー -> 表示名(プール名。未設定なら種別名) */
function buildPoolLabels(programTypes: ProgramType[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const pt of programTypes) {
    map.set(pt.recency_pool || pt.id, pt.recency_pool || pt.name)
  }
  return map
}

/**
 * 役割ごとに、候補プール単位で担当回数と平均サイクルをまとめる。
 * まとめ方は候補選択と同じ(実演系は種別が分かれていても一つとして回すため)。
 */
export function buildTypeSummaries(
  entries: HistoryEntry[],
  role: AssignmentRole,
  programTypes: ProgramType[],
  today: string,
): TypeSummary[] {
  const poolKeyByTypeId = buildPoolKeyByTypeId(programTypes)
  const poolLabels = buildPoolLabels(programTypes)

  const datesByPool = new Map<string, string[]>()
  for (const e of entries) {
    if (e.role !== role || !e.typeId) continue
    const key = poolKeyByTypeId.get(e.typeId) ?? e.typeId
    const list = datesByPool.get(key)
    if (list) list.push(e.date)
    else datesByPool.set(key, [e.date])
  }

  const summaries: TypeSummary[] = []
  for (const [key, dates] of datesByPool) {
    dates.sort()
    const past = dates.filter((d) => d <= today)
    const future = dates.filter((d) => d > today)
    summaries.push({
      key,
      label: poolLabels.get(key) ?? '(不明な種別)',
      count: dates.length,
      lastDate: past.length > 0 ? past[past.length - 1] : null,
      nextDate: future.length > 0 ? future[0] : null,
      // 最初と最後の間隔を回数-1で割る(間隔の平均)。1回だけなら求められない
      averageCycleDays:
        dates.length >= 2 ? daysBetween(dates[dates.length - 1], dates[0]) / (dates.length - 1) : null,
    })
  }

  // 回数が多い順。同数なら直近が新しい順
  summaries.sort((a, b) => b.count - a.count || (a.lastDate ?? '').localeCompare(b.lastDate ?? ''))
  return summaries
}

/**
 * 候補プールごとに、そのプールを担当した現役の人の平均サイクル(日)を求める。
 * 一人ひとりの平均サイクルを出したうえで、その平均をとる。1回しか担当していない人は
 * サイクルが出せないので数に入らない。個人の値と同じ土俵で比べるための基準値。
 * 休止中の人と名簿にいない人は、今の回り方の基準にはならないので除く。
 */
export function buildPoolAverageCycles(
  rows: AssignmentHistoryRow[],
  role: AssignmentRole,
  programTypes: ProgramType[],
  members: Member[],
): Map<string, number | null> {
  const poolKeyByTypeId = buildPoolKeyByTypeId(programTypes)
  const activeIds = new Set(members.filter((m) => m.status === '現役').map((m) => m.id))

  // プールキー -> 人id -> 担当日一覧
  const datesByPoolByMember = new Map<string, Map<string, string[]>>()

  for (const row of rows) {
    if (!row.program_date) continue
    const memberId = role === 'member' ? row.member_id : row.partner_id
    if (!memberId || !activeIds.has(memberId)) continue
    const typeId =
      role === 'member' ? row.program_type_id : (row.partner_program_type_id ?? row.program_type_id)
    if (!typeId) continue

    const key = poolKeyByTypeId.get(typeId) ?? typeId
    let byMember = datesByPoolByMember.get(key)
    if (!byMember) {
      byMember = new Map()
      datesByPoolByMember.set(key, byMember)
    }
    const list = byMember.get(memberId)
    if (list) list.push(row.program_date)
    else byMember.set(memberId, [row.program_date])
  }

  const result = new Map<string, number | null>()
  for (const [key, byMember] of datesByPoolByMember) {
    const cycles: number[] = []
    for (const dates of byMember.values()) {
      if (dates.length < 2) continue
      dates.sort()
      cycles.push(daysBetween(dates[dates.length - 1], dates[0]) / (dates.length - 1))
    }
    result.set(key, cycles.length > 0 ? cycles.reduce((a, b) => a + b, 0) / cycles.length : null)
  }
  return result
}

/** 本人が担当者候補の条件を満たす種別かどうか(getEligibleCandidatesの絞り込みと同じ条件) */
function isEligibleFor(member: Member, programType: ProgramType): boolean {
  if (member.status !== '現役') return false
  const requiredPositions = programType.required_position ?? []
  if (requiredPositions.length > 0 && !requiredPositions.includes(member.position)) return false
  if (programType.required_gender && member.gender !== programType.required_gender) return false
  if (
    programType.required_qualification &&
    !(member.qualifications ?? []).includes(programType.required_qualification)
  ) {
    return false
  }
  if ((member.excluded_program_type_ids ?? []).includes(programType.id)) return false
  return true
}

/**
 * 担当者候補には挙がるのに、一度も回ってきていない種別(プール単位)。
 * 割り当ての偏りを見つけるためのもの。
 */
export function buildNeverAssignedPools(
  member: Member,
  entries: HistoryEntry[],
  programTypes: ProgramType[],
): string[] {
  const poolKeyByTypeId = buildPoolKeyByTypeId(programTypes)
  const poolLabels = buildPoolLabels(programTypes)

  const assignedPools = new Set<string>()
  for (const e of entries) {
    if (e.role !== 'member' || !e.typeId) continue
    assignedPools.add(poolKeyByTypeId.get(e.typeId) ?? e.typeId)
  }

  const eligiblePools = new Set<string>()
  for (const pt of programTypes) {
    if (isEligibleFor(member, pt)) eligiblePools.add(pt.recency_pool || pt.id)
  }

  const labels: string[] = []
  for (const key of eligiblePools) {
    if (!assignedPools.has(key)) labels.push(poolLabels.get(key) ?? '(不明な種別)')
  }
  return labels.sort((a, b) => a.localeCompare(b, 'ja'))
}

export interface PairSummary {
  counterpartId: string
  count: number
  lastDate: string
}

/**
 * 課題付き(実演形式)プログラムでの組み合わせ実績。
 * アプリの候補表示と一致するよう、担当者視点とペア視点は分けて数える
 * (buildPairingMapと同じ片方向の考え方)。
 */
export function buildPairSummaries(entries: HistoryEntry[], role: AssignmentRole): PairSummary[] {
  const byCounterpart = new Map<string, { count: number; lastDate: string }>()

  for (const e of entries) {
    if (e.role !== role || !e.hasTeachingPoint || !e.counterpartId) continue
    const existing = byCounterpart.get(e.counterpartId)
    if (existing) {
      existing.count += 1
      if (e.date > existing.lastDate) existing.lastDate = e.date
    } else {
      byCounterpart.set(e.counterpartId, { count: 1, lastDate: e.date })
    }
  }

  return [...byCounterpart.entries()]
    .map(([counterpartId, v]) => ({ counterpartId, ...v }))
    .sort((a, b) => b.count - a.count || b.lastDate.localeCompare(a.lastDate))
}

/** 「2026/8/27(木)」 */
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  })
}

/** 「12週間前」「3週間後」「今週」 */
export function formatRelativeWeeks(dateStr: string, today: string): string {
  const diffDays = daysBetween(dateStr, today)
  const weeks = Math.round(Math.abs(diffDays) / 7)
  if (weeks === 0) return '今週'
  return `${weeks}週間${diffDays > 0 ? '後' : '前'}`
}

/** 平均間隔(日)を「約11.5週」の形にする */
export function formatCycle(averageCycleDays: number | null): string {
  if (averageCycleDays === null) return '―'
  const weeks = averageCycleDays / 7
  return `約${weeks.toFixed(1)}週`
}

/**
 * 全体平均との差。マイナスなら全体より短い間隔で回ってきている(=よく当たっている)。
 * 差がごくわずかなときは、意味のある差ではないので出さない。
 */
export function formatCycleDelta(
  averageCycleDays: number | null,
  poolAverageDays: number | null | undefined,
): { text: string; shorter: boolean } | null {
  if (averageCycleDays === null || poolAverageDays === null || poolAverageDays === undefined) return null
  const deltaWeeks = (averageCycleDays - poolAverageDays) / 7
  if (Math.abs(deltaWeeks) < 0.1) return null
  const shorter = deltaWeeks < 0
  return { text: `全体より${Math.abs(deltaWeeks).toFixed(1)}週${shorter ? '短い' : '長い'}`, shorter }
}
