import type { Member, ProgramType } from '../types/domain'

export interface AssignmentHistoryRow {
  member_id: string | null
  partner_id: string | null
  program_date: string | null
  program_type_id: string | null
  /** ペアが主担当と異なる資格ルール(例: 会衆の聖書研究の朗読者)で入る場合の種別id */
  partner_program_type_id: string | null
  /** その回のプログラムに課題(教励課題)が設定されていたか */
  has_teaching_point: boolean
  /** その回の課題(教励課題)のid(担当履歴の表示用) */
  teaching_point_id: string | null
  /** そのプログラムの種別名(表示用) */
  program_type_name: string | null
  /** そのプログラムのタイトル(表示用。討議など種別名だけでは中身が分からないプログラム向け) */
  program_title: string | null
  /** そのプログラムの区分(開会・クリスチャンとして生活する等。祈りの開会/閉会の区別に使う) */
  program_section: string | null
}

/** 日付文字列(YYYY-MM-DD)同士の差分日数(a - b)。正なら a の方が未来。 */
function daysBetween(a: string, b: string): number {
  return Math.round((new Date(a).getTime() - new Date(b).getTime()) / (1000 * 60 * 60 * 24))
}

/** memberId -> (programTypeId -> 基準日に最も近い担当日) */
export type LastAssignedMap = Map<string, Map<string, string>>

/**
 * 役割(担当者/ペア)ごとに、基準日(referenceDate、通常は今表示している週の日付)に
 * 最も近い担当日を集計する。過去だけでなく未来の担当日も対象になる(表示側で前後を判定する)。
 * 担当者としての履歴とペアとしての履歴を混在させないよう、role で明示的に片方だけを集計する。
 */
export function buildLastAssignedMap(
  rows: AssignmentHistoryRow[],
  role: 'member' | 'partner',
  referenceDate: string,
): LastAssignedMap {
  const map: LastAssignedMap = new Map()

  function record(memberId: string | null, typeId: string | null, date: string) {
    if (!memberId || !typeId) return
    let typeMap = map.get(memberId)
    if (!typeMap) {
      typeMap = new Map()
      map.set(memberId, typeMap)
    }
    const existing = typeMap.get(typeId)
    if (!existing || Math.abs(daysBetween(date, referenceDate)) < Math.abs(daysBetween(existing, referenceDate))) {
      typeMap.set(typeId, date)
    }
  }

  for (const row of rows) {
    if (!row.program_date) continue
    if (role === 'member') {
      record(row.member_id, row.program_type_id, row.program_date)
    } else {
      record(row.partner_id, row.partner_program_type_id ?? row.program_type_id, row.program_date)
    }
  }

  return map
}

export interface LastTeachingAssignment {
  date: string
  /** 候補一覧に表示するラベル。プログラムタイトルがあればそちらを優先し、無ければ種別名を使う */
  typeName: string
}

/** memberId -> 「候補プール」内で基準日に最も近い担当日とラベル(プログラムタイトル優先) */
export type LastTeachingAssignmentMap = Map<string, LastTeachingAssignment>

/** プールキー(recency_pool、無ければ種別id自身) -> LastTeachingAssignmentMap */
export type LastTeachingAssignmentMapsByPool = Map<string, LastTeachingAssignmentMap>

/** 種別「祈り」の名称 */
export const PRAYER_TYPE_NAME = '祈り'

/**
 * 祈りは同じ種別のまま開会と閉会の両方で使うため、区分から呼び分けの名前を作る。
 * 「閉会」区分は現在使っていないが、過去データにはあるので閉会扱いのままにする。
 */
export function prayerLabelForSection(section: string | null): string {
  if (section === '開会') return '開会の祈り'
  if (section === '閉会' || section === 'クリスチャンとして生活する') return '閉会の祈り'
  return PRAYER_TYPE_NAME
}

/**
 * 祈りの候補一覧用に、直近担当日と「開会の祈り/閉会の祈り」のラベルを集計する。
 * 開会と閉会をまとめて1つの巡回として扱う(どちらかを最近担当していれば後回しになる)が、
 * 表示ではどちらだったのかが分かるようにする。
 */
export function buildPrayerRecencyMap(
  rows: AssignmentHistoryRow[],
  referenceDate: string,
): LastTeachingAssignmentMap {
  const map: LastTeachingAssignmentMap = new Map()

  for (const row of rows) {
    if (!row.program_date || row.program_type_name !== PRAYER_TYPE_NAME) continue
    const memberId = row.member_id
    if (!memberId) continue

    const existing = map.get(memberId)
    if (
      !existing ||
      Math.abs(daysBetween(row.program_date, referenceDate)) < Math.abs(daysBetween(existing.date, referenceDate))
    ) {
      map.set(memberId, { date: row.program_date, typeName: prayerLabelForSection(row.program_section) })
    }
  }

  return map
}

/**
 * 直近担当日を、種別ごとではなく「候補プール」単位で集計する。
 * 例えば「会話を始める」「再び話し合う」等をまとめて「実演」プールとして回したい場合、
 * program_types.recency_pool に同じ値("実演")を設定しておくと、それらの種別間で
 * 直近担当日が共有される(=どの実演をやっても同じプールの「最近やった」扱いになる)。
 * 教励課題の有無は問わない(討議のように課題を伴わない種別同士のプールも成立する)。
 * recency_pool が空の種別は、その種別id自身をプールキーとして扱う(=他種別とは混ざらない)。
 * buildLastAssignedMap と同様、担当者としての履歴とペアとしての履歴を混在させない。
 */
export function buildLastTeachingAssignmentMapsByPool(
  rows: AssignmentHistoryRow[],
  role: 'member' | 'partner',
  referenceDate: string,
  poolKeyByTypeId: Map<string, string>,
): LastTeachingAssignmentMapsByPool {
  const result: LastTeachingAssignmentMapsByPool = new Map()

  for (const row of rows) {
    if (!row.program_date || !row.program_type_name) continue
    const memberId = role === 'member' ? row.member_id : row.partner_id
    if (!memberId) continue
    const typeId = role === 'member' ? row.program_type_id : (row.partner_program_type_id ?? row.program_type_id)
    if (!typeId) continue
    const poolKey = poolKeyByTypeId.get(typeId) ?? typeId

    let poolMap = result.get(poolKey)
    if (!poolMap) {
      poolMap = new Map()
      result.set(poolKey, poolMap)
    }

    const existing = poolMap.get(memberId)
    if (
      !existing ||
      Math.abs(daysBetween(row.program_date, referenceDate)) < Math.abs(daysBetween(existing.date, referenceDate))
    ) {
      poolMap.set(memberId, { date: row.program_date, typeName: row.program_title || row.program_type_name })
    }
  }

  return result
}

/**
 * memberId(担当者として)-> その時のペア相手idの時系列リスト(古い順)。
 * 「Aが担当者・Bがペア」と「Bが担当者・Aがペア」は別の組み合わせとして扱うため、
 * 担当者側の視点のみを記録する(逆方向には記録しない)。
 */
export type PairingMap = Map<string, string[]>

/**
 * 教励課題付き(実演系)プログラムでのペア実績のみを対象にする。会衆の聖書研究の
 * 担当者/朗読者のような、実演ではないペアはここに含めない。
 * referenceDate より後(まだ先の話)のペア実績は、今組んでいる週の判断材料にはならないため含めない。
 */
export function buildPairingMap(rows: AssignmentHistoryRow[], referenceDate: string): PairingMap {
  const sorted = rows
    .filter(
      (r): r is AssignmentHistoryRow & { program_date: string; member_id: string; partner_id: string } =>
        Boolean(r.has_teaching_point && r.program_date && r.member_id && r.partner_id && r.program_date <= referenceDate),
    )
    .sort((a, b) => (a.program_date < b.program_date ? -1 : a.program_date > b.program_date ? 1 : 0))

  const map: PairingMap = new Map()

  function append(a: string, b: string) {
    const list = map.get(a)
    if (list) list.push(b)
    else map.set(a, [b])
  }

  for (const row of sorted) {
    append(row.member_id, row.partner_id)
  }

  return map
}

/**
 * 指定した担当者について、現在の候補者プール内で「今の周」で既にペアを組んだ相手のidを返す。
 * 候補者全員と組み終えたら1周とみなしリセットする(名簿変更でプールが変わればやり直しになる)。
 */
export function getCurrentRoundPairedIds(history: string[] | undefined, eligibleIds: Set<string>): Set<string> {
  let covered = new Set<string>()
  if (!history || eligibleIds.size === 0) return covered

  for (const partnerId of history) {
    if (!eligibleIds.has(partnerId)) continue
    covered.add(partnerId)
    if (covered.size >= eligibleIds.size) {
      covered = new Set()
    }
  }

  return covered
}

export interface Candidate {
  member: Member
  lastAssignedDate: string | null
  /** broadRecencyMapを使った場合、その最終担当のプログラム種別名 */
  lastAssignedType?: string | null
  /** 同じ日に他のプログラムへ割り当て済み(選択は可能、注意喚起のみ) */
  isDuplicateToday: boolean
  /** 指定した主担当者と過去にペアを組んだことがある(除外はせず表示のみで区別) */
  previouslyPaired: boolean
}

interface GetCandidatesParams {
  members: Member[]
  programType: ProgramType
  lastAssignedMap: LastAssignedMap
  /** 候補の並び替え・前回日付表示の基準日(通常は今表示している週の日付) */
  referenceDate: string
  /** 同じ日に既に他のプログラムへ割り当て済みのメンバー。除外はせず、注意喚起の表示にのみ使う */
  duplicateMemberIds?: Set<string>
  /** ペア選定時、主担当と同性に絞る場合に指定 */
  requiredGender?: Member['gender']
  /** 指定時、直近の担当履歴をこのプログラム種別に限定せず、課題付きプログラム全体から探す(ペア選定用) */
  broadRecencyMap?: LastTeachingAssignmentMap
  /** ペアの優先順位付け用: 現在の主担当者id。候補者全員と一巡するまでの間に既にペアだった候補は優先度を下げる(除外はしない) */
  pairingMap?: PairingMap
  currentMemberId?: string | null
}

/**
 * program_type の条件(立場・性別・特別承認)を満たし、かつ status=現役 のメンバーを候補として返す。
 * 基準日(referenceDate)から最も離れた日に担当した人(=未実施を含め最も久しぶりの人)を優先し、
 * 同日の重複がある候補は末尾に回す。
 */
export function getEligibleCandidates({
  members,
  programType,
  lastAssignedMap,
  referenceDate,
  duplicateMemberIds,
  requiredGender,
  broadRecencyMap,
  pairingMap,
  currentMemberId,
}: GetCandidatesParams): Candidate[] {
  const requiredPositions = programType.required_position ?? []
  const requiredQualification = programType.required_qualification

  const eligibleMembers = members
    .filter((m) => m.status === '現役')
    .filter((m) => requiredPositions.length === 0 || requiredPositions.includes(m.position))
    .filter((m) => !programType.required_gender || m.gender === programType.required_gender)
    .filter((m) => !requiredGender || m.gender === requiredGender)
    .filter(
      (m) =>
        !requiredQualification || (m.qualifications ?? []).includes(requiredQualification),
    )
    .filter((m) => !(m.excluded_program_type_ids ?? []).includes(programType.id))

  const eligibleIds = new Set(eligibleMembers.map((m) => m.id))
  const currentRoundPaired = currentMemberId
    ? getCurrentRoundPairedIds(pairingMap?.get(currentMemberId), eligibleIds)
    : new Set<string>()

  const candidates = eligibleMembers.map((member) => {
    const broad = broadRecencyMap?.get(member.id)
    return {
      member,
      lastAssignedDate: broad ? broad.date : (lastAssignedMap.get(member.id)?.get(programType.id) ?? null),
      lastAssignedType: broad ? broad.typeName : null,
      isDuplicateToday: duplicateMemberIds?.has(member.id) ?? false,
      previouslyPaired: currentRoundPaired.has(member.id),
    }
  })

  // 基準日からの距離(絶対値)が遠いほど優先(=未実施は最優先、直近ほど後回し)。過去/未来は区別しない。
  // 同日重複(isDuplicateToday)は警告表示のみで、並び順には影響させない。
  // 巡回監督は選択自体は可能だが、他のどの条件よりも優先して常に一覧の末尾に留める。
  candidates.sort((a, b) => {
    const overseerA = a.member.position === '巡回監督'
    const overseerB = b.member.position === '巡回監督'
    if (overseerA !== overseerB) return overseerA ? 1 : -1
    if (a.previouslyPaired !== b.previouslyPaired) return a.previouslyPaired ? 1 : -1
    if (a.lastAssignedDate === b.lastAssignedDate) {
      return memberSortKey(a.member).localeCompare(memberSortKey(b.member), 'ja')
    }
    if (!a.lastAssignedDate) return -1
    if (!b.lastAssignedDate) return 1
    const distanceA = Math.abs(daysBetween(a.lastAssignedDate, referenceDate))
    const distanceB = Math.abs(daysBetween(b.lastAssignedDate, referenceDate))
    return distanceB - distanceA
  })

  return candidates
}

function memberSortKey(member: Member): string {
  return `${member.last_name_kana ?? member.last_name}${member.first_name_kana ?? member.first_name}`
}

export function memberDisplayName(member: Member): string {
  return `${member.last_name} ${member.first_name}${member.honorific}`
}

/**
 * referenceDate(通常は今表示している週の日付)を基準に、過去なら「前回」、
 * 未来(先の週まで既に入力済みの担当)なら「今後」とラベルを分けて表示する。
 * 種別名は色分けして描画できるよう、日付部分と分けて返す。
 */
export function formatLastAssigned(
  dateStr: string | null,
  typeName: string | null | undefined,
  referenceDate: string,
): { period: string; typeName: string | null } {
  if (!dateStr) return { period: '初担当', typeName: null }
  const diffDays = daysBetween(dateStr, referenceDate)
  const diffWeeks = Math.round(Math.abs(diffDays) / 7)
  const formatted = new Date(dateStr).toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' })
  const isFuture = diffDays > 0
  const label = isFuture ? '今後' : '前回'
  const period = diffWeeks === 0 ? formatted : `${formatted}(${diffWeeks}週間${isFuture ? '後' : '前'})`
  return { period: `${label}: ${period}`, typeName: typeName ?? null }
}
