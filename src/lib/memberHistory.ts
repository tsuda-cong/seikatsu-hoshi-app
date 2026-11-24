import { CHAIRMAN_LABEL, CHAIRMAN_TYPE_NAMES, type AssignmentHistoryRow } from './candidates'
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
  /** 学生の割り当てだったか(ペアの数え方に使う) */
  isStudentPart: boolean
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(a).getTime() - new Date(b).getTime()) / (1000 * 60 * 60 * 24))
}

/** 本人が関わった全ての回を、新しい順に並べて返す */
export function buildMemberTimeline(rows: AssignmentHistoryRow[], memberId: string): HistoryEntry[] {
  const entries: HistoryEntry[] = []
  // 同じ週の開会の言葉と閉会の言葉は、司会者として1件にまとめる
  const seenChairmanDates = new Set<string>()

  for (const row of rows) {
    if (!row.program_date) continue
    const isMember = row.member_id === memberId
    const isPartner = row.partner_id === memberId
    if (!isMember && !isPartner) continue

    // ペアで入った回は、ペア側のルール参照元(例: 会衆の聖書研究の朗読者)を本人の種別とみなす。
    // 候補選択側(buildLastAssignedMap)と同じ扱いにして、集計がずれないようにする
    const typeId = isMember ? row.program_type_id : (row.partner_program_type_id ?? row.program_type_id)

    if (isMember && row.program_type_name && CHAIRMAN_TYPE_NAMES.includes(row.program_type_name)) {
      if (seenChairmanDates.has(row.program_date)) continue
      seenChairmanDates.add(row.program_date)
      entries.push({
        date: row.program_date,
        // 会の最初と最後にまたがる役目なので、特定の区分には属さない
        section: null,
        programLabel: CHAIRMAN_LABEL,
        typeId,
        typeName: CHAIRMAN_LABEL,
        role: 'member',
        counterpartId: null,
        teachingPointId: null,
        isStudentPart: false,
      })
      continue
    }

    entries.push({
      date: row.program_date,
      section: row.program_section,
      programLabel: row.program_title ?? row.program_type_name ?? '(種別未設定)',
      typeId,
      typeName: row.program_type_name,
      role: isMember ? 'member' : 'partner',
      counterpartId: isMember ? row.partner_id : row.member_id,
      teachingPointId: row.teaching_point_id,
      isStudentPart: row.is_student_part,
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

/**
 * 種別id -> 候補プールのキー。recency_pool未設定の種別は他と混ざらないよう種別id自身をキーにする。
 * 開会の言葉と閉会の言葉だけは、同じ人が司会者として両方を担当するので一つのプールにまとめる。
 */
export function buildPoolKeyByTypeId(programTypes: ProgramType[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const pt of programTypes) {
    map.set(pt.id, CHAIRMAN_TYPE_NAMES.includes(pt.name) ? CHAIRMAN_LABEL : pt.recency_pool || pt.id)
  }
  return map
}

/** プールのキー -> 表示名(プール名。未設定なら種別名) */
function buildPoolLabels(programTypes: ProgramType[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const pt of programTypes) {
    if (CHAIRMAN_TYPE_NAMES.includes(pt.name)) {
      map.set(CHAIRMAN_LABEL, CHAIRMAN_LABEL)
      continue
    }
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

/** 目安を出すときに見る期間(年)。これより古い担当だけの人は、今の回り方の基準にならない */
export const BASELINE_YEARS = 2

export interface PoolBaseline {
  /** 目安となるサイクル(日)。母数の中央値 */
  days: number
  /** 母数の人数。数字をどれだけの人から出したかが分かるように表示する */
  memberCount: number
}

/** 数の並びの真ん中の値。偶数個なら中央2つの平均 */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/**
 * 候補プールごとに、「今その種別がどのくらいの間隔で回っているか」の目安を求める。
 * 個人の平均サイクルと同じ土俵で比べるための基準値。
 *
 * **直近BASELINE_YEARS年の担当だけ**を使い、その期間に2回以上担当した現役の人それぞれの
 * サイクルを出して、その**中央値**(人数の真ん中にくる人の値)をとる。
 *
 * 以前は全期間・全員の平均をとっていたが、長老や援助奉仕者のように
 * 「候補には入るが他のプログラムとの兼ね合いで数年に1回しか当たらない人」の
 * サイクル(例: 聖書朗読で182週)が基準値を大きく押し上げ、
 * ふだん回っている人が全員「全体より短い」と出ていた(実測: 聖書朗読の基準が39.3週。
 * 実際に回っている13人は12〜21週)。期間で絞ると滅多に当たらない人は2回に満たず自然に外れ、
 * 中央値にすることで残った少数の極端な値にも引きずられない。
 */
export function buildPoolBaselines(
  rows: AssignmentHistoryRow[],
  role: AssignmentRole,
  programTypes: ProgramType[],
  members: Member[],
  today: string,
): Map<string, PoolBaseline | null> {
  const poolKeyByTypeId = buildPoolKeyByTypeId(programTypes)
  const activeIds = new Set(members.filter((m) => m.status === '現役').map((m) => m.id))

  // 直近何年かを「YYYY-MM-DD」で表す(この日より前の担当は数えない)
  const since = new Date(today)
  since.setFullYear(since.getFullYear() - BASELINE_YEARS)
  const sinceDate = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(since.getDate()).padStart(2, '0')}`

  // プールキー -> 人id -> 担当日一覧
  const datesByPoolByMember = new Map<string, Map<string, string[]>>()

  for (const row of rows) {
    if (!row.program_date || row.program_date < sinceDate) continue
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

  const result = new Map<string, PoolBaseline | null>()
  for (const [key, byMember] of datesByPoolByMember) {
    const cycles: number[] = []
    for (const raw of byMember.values()) {
      // 司会者は開会の言葉と閉会の言葉で同じ週に2件入るので、週として1回に数える
      const dates = key === CHAIRMAN_LABEL ? [...new Set(raw)] : raw
      if (dates.length < 2) continue
      dates.sort()
      cycles.push(daysBetween(dates[dates.length - 1], dates[0]) / (dates.length - 1))
    }
    result.set(key, cycles.length > 0 ? { days: median(cycles), memberCount: cycles.length } : null)
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

  // 他の種別からペア側として参照されている種別(会衆の聖書研究の朗読者など)は、
  // 担当者としてではなくペアの欄でしか割り当たらない。実績もペア側で見ないと、
  // 実際に担当していても「まだ回っていない」と出てしまう
  const partnerOnlyTypeIds = new Set(
    programTypes.map((pt) => pt.partner_program_type_id).filter((id): id is string => !!id),
  )

  const assignedAsMember = new Set<string>()
  const assignedAsPartner = new Set<string>()
  for (const e of entries) {
    if (!e.typeId) continue
    const key = poolKeyByTypeId.get(e.typeId) ?? e.typeId
    if (e.role === 'member') assignedAsMember.add(key)
    else assignedAsPartner.add(key)
  }

  const labels: string[] = []
  const seenPools = new Set<string>()
  for (const pt of programTypes) {
    if (!isEligibleFor(member, pt)) continue
    // 担当実績側と同じキーで揃える(司会者のまとめも含む)。別々に組み立てると、
    // 司会者をやっている人に「開会の言葉が未担当」と出てしまう
    const key = poolKeyByTypeId.get(pt.id) ?? pt.id
    if (seenPools.has(key)) continue
    seenPools.add(key)

    const assigned = partnerOnlyTypeIds.has(pt.id) ? assignedAsPartner : assignedAsMember
    if (!assigned.has(key)) labels.push(poolLabels.get(key) ?? '(不明な種別)')
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
    if (e.role !== role || !e.isStudentPart || !e.counterpartId) continue
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
 * 全体の目安との差。マイナスなら目安より短い間隔で回ってきている(=よく当たっている)。
 * 差がごくわずかなときは、意味のある差ではないので出さない。
 */
export function formatCycleDelta(
  averageCycleDays: number | null,
  baseline: PoolBaseline | null | undefined,
): { text: string; shorter: boolean } | null {
  if (averageCycleDays === null || !baseline) return null
  const deltaWeeks = (averageCycleDays - baseline.days) / 7
  if (Math.abs(deltaWeeks) < 0.1) return null
  const shorter = deltaWeeks < 0
  return { text: `目安より${Math.abs(deltaWeeks).toFixed(1)}週${shorter ? '短い' : '長い'}`, shorter }
}
