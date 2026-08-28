import type { Member, ProgramType, Song, TeachingPoint } from '../types/domain'

/**
 * 過去の割当一覧(Excel)を貼り付けて取り込むための変換。
 * 列は「日付 / タイプ / 時間 / 資料 / 内容 / 課題 / 歌 / 生徒 / 相手 / セクション」の順。
 *
 * 「タイプ」列には、種別名(聖書朗読)・番号付きの種別名(3．聖書朗読)・その回だけのタイトル
 * (「謙遜であることはなぜ大切か」)が混在している。番号を外して現在の種別名と突き合わせ、
 * 当たらなければ旧名称の読み替え、それでも当たらなければ区分から振り分ける。
 * 元の値は必ずタイトルとして残すので、候補一覧の「前回」には当時の名称がそのまま出る。
 */

export interface ImportProgramRow {
  rawType: string
  title: string
  section: string
  programTypeId: string | null
  resolvedTypeName: string | null
  durationMinutes: number | null
  material: string | null
  content: string | null
  songId: string | null
  teachingPointId: string | null
  memberId: string | null
  partnerId: string | null
}

export interface ImportWeek {
  date: string
  programs: ImportProgramRow[]
}

export interface TypeMappingEntry {
  rawType: string
  normalized: string
  resolvedTypeName: string | null
  /** どの規則で決まったか(確認画面で見せる) */
  via:
    | '種別名と一致'
    | '相手の有無で振り分け'
    | '旧名称から読み替え'
    | '区分から振り分け'
    | '種別を付けない'
    | '解決できず'
  count: number
}

export interface ParseResult {
  weeks: ImportWeek[]
  warnings: string[]
  typeMapping: TypeMappingEntry[]
  unknownNames: string[]
  stats: { rows: number; weeks: number; withMember: number; withPartner: number; skippedRows: number }
}

export interface ParseOptions {
  members: Member[]
  programTypes: ProgramType[]
  songs: Song[]
  teachingPoints: TeachingPoint[]
  /** この年より前だけ取り込む(既存データと重ならないようにするため)。省略時は全部 */
  beforeYear?: number
}

/** 区分が空の行は開会(歌と祈り・開会の言葉)なので、そう補う */
const DEFAULT_SECTION = '開会'

/**
 * 週の中での区分の並び順。Excelでは「歌」だけが別の場所にまとめられていて、
 * シートの行順のままでは週の最後に来てしまうため、ここで並べ直す。
 */
const SECTION_ORDER = ['開会', '神の言葉の宝', '野外奉仕に励む', '伝道を楽しもう', 'クリスチャンとして生活する']

/** 「クリスチャンとして生活する」は歌で始まる。区分の中では歌を先頭に置く */
function sortWeekPrograms(programs: ImportProgramRow[]): ImportProgramRow[] {
  return programs
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const sectionA = SECTION_ORDER.indexOf(a.p.section)
      const sectionB = SECTION_ORDER.indexOf(b.p.section)
      // 一覧に無い区分は末尾に回す
      const rankA = sectionA === -1 ? SECTION_ORDER.length : sectionA
      const rankB = sectionB === -1 ? SECTION_ORDER.length : sectionB
      if (rankA !== rankB) return rankA - rankB

      const songA = NO_TYPE_NAMES.has(normalizeTypeName(a.p.rawType))
      const songB = NO_TYPE_NAMES.has(normalizeTypeName(b.p.rawType))
      if (songA !== songB) return songA ? -1 : 1

      return a.i - b.i
    })
    .map(({ p }) => p)
}

/**
 * 大会の週は1行だけ入っていて割り当てが無い。プログラムとしては取り込まない。
 * 週ごと飛ばすので、この語を含む行が現れた週は丸ごと対象外になる。
 */
const CONVENTION_MARKERS = ['巡回大会', '地区大会']

/**
 * 種別を付けないもの。現在のデータでも「歌」だけのプログラムに種別は入っていない
 * (誰かが担当するものではないため)。
 */
const NO_TYPE_NAMES = new Set(['歌'])

/**
 * 現在の種別名に無い旧名称の読み替え先。左から順に試し、実在する種別に当たったものを使う。
 * 種別の名称は実際に変わってきている(最初の話し合い→会話を始める、再訪問→再び話し合う、
 * 聖書研究→教えて育てる など)。候補プールが同じなら、名称が変わっても巡回は引き継がれる
 * (seikatsu-app-design-decisions の候補プールの項を参照)。
 */
const LEGACY_TYPE_ALIASES: Record<string, string[]> = {
  歌と祈り: ['祈り'],
  祈り: ['祈り'],
  最初の話し合い: ['会話を始める'],
  最初の訪問: ['会話を始める'],
  再訪問: ['再び話し合う'],
  聖書研究: ['教えて育てる'],
  会衆の聖書研究: ['会衆の聖書研究(司会)'],
  // 動画を見て討議する回。実演ではない
  最初の話し合いの動画: ['討議'],
  再訪問の動画: ['討議'],
  聖書研究の動画: ['討議'],
  記念式への招待の動画: ['討議'],
}

/**
 * 現在は実演と話に分かれている種別。当時は一つの名前だったので、
 * 相手が入っていれば実演、いなければ話として振り分ける。
 */
const SPLIT_BY_PARTNER: Record<string, { withPartner: string; withoutPartner: string }> = {
  信じていることを説明する: {
    withPartner: '信じていることを説明する(実演)',
    withoutPartner: '信じていることを説明する(話)',
  },
}

/**
 * 種別名にも旧名称にも当たらなかったときの、区分ごとの振り分け先。
 * 野外奉仕は、相手がいれば実演、いなければ動画などの討議とみなす。
 */
const SECTION_FALLBACKS: Record<string, { withPartner: string[]; withoutPartner: string[] }> = {
  神の言葉の宝: { withPartner: ['テーマの考察'], withoutPartner: ['テーマの考察'] },
  クリスチャンとして生活する: { withPartner: ['討議'], withoutPartner: ['討議'] },
  野外奉仕に励む: { withPartner: ['会話を始める'], withoutPartner: ['討議'] },
  開会: { withPartner: ['討議'], withoutPartner: ['討議'] },
}

/** 「2．宝石を探し出す」→「宝石を探し出す」。先頭の番号と区切りを外す */
export function normalizeTypeName(raw: string): string {
  return raw
    .replace(/^\s*\d+\s*[．.、,:：]?\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 全角半角の空白をすべて取り除く。名前の突き合わせ用 */
function stripSpaces(s: string): string {
  return s.replace(/[\s　]/g, '')
}

/** 「（渡邊 智恵子 姉妹）」→「渡邊 智恵子 姉妹」 */
function stripParens(s: string): string {
  return s.replace(/^[（(]\s*/, '').replace(/\s*[）)]$/, '').trim()
}

/**
 * Excelから貼り付けた日付を YYYY-MM-DD にする。
 * 表示形式のまま(2023/1/5)貼られる場合と、シリアル値(44931)で貼られる場合の両方に対応する。
 */
export function parseImportDate(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null

  if (/^\d+(\.\d+)?$/.test(s)) {
    const serial = Math.floor(Number(s))
    // シリアル値としては小さすぎる値は、年として解釈すべきものなので弾く
    if (serial < 20000 || serial > 80000) return null
    // Excelの起点は1899-12-30(1900年うるう年バグを含んだ数え方)
    const ms = Date.UTC(1899, 11, 30) + serial * 86400000
    const d = new Date(ms)
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  }

  const m = s.match(/^(\d{4})[/\-年](\d{1,2})[/\-月](\d{1,2})/)
  if (!m) return null
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
}

/** 「5分」→ 5 */
function parseDuration(raw: string): number | null {
  const m = raw.trim().match(/(\d+)/)
  return m ? Number(m[1]) : null
}

export function parseAssignmentTsv(tsv: string, options: ParseOptions): ParseResult {
  const { members, programTypes, songs, teachingPoints, beforeYear } = options

  const typeByName = new Map(programTypes.map((pt) => [pt.name.trim(), pt]))
  const memberByKey = new Map(
    members.map((m) => [stripSpaces(`${m.last_name}${m.first_name}${m.honorific}`), m]),
  )
  const songByNumber = new Map(songs.map((s) => [s.number, s]))
  const teachingPointByCode = new Map(teachingPoints.map((t) => [stripSpaces(t.code), t]))

  const warnings: string[] = []
  const unknownNameSet = new Set<string>()
  const mappingByRaw = new Map<string, TypeMappingEntry>()
  const weekMap = new Map<string, ImportProgramRow[]>()
  const conventionWeeks = new Set<string>()
  let skippedRows = 0
  let withMember = 0
  let withPartner = 0

  function resolveType(
    rawType: string,
    section: string,
    hasPartner: boolean,
  ): { pt: ProgramType | null; via: TypeMappingEntry['via'] } {
    const normalized = normalizeTypeName(rawType)

    if (NO_TYPE_NAMES.has(normalized)) return { pt: null, via: '種別を付けない' }

    const direct = typeByName.get(normalized)
    if (direct) return { pt: direct, via: '種別名と一致' }

    const split = SPLIT_BY_PARTNER[normalized]
    if (split) {
      const hit = typeByName.get(hasPartner ? split.withPartner : split.withoutPartner)
      if (hit) return { pt: hit, via: '相手の有無で振り分け' }
    }

    for (const candidate of LEGACY_TYPE_ALIASES[normalized] ?? []) {
      const hit = typeByName.get(candidate)
      if (hit) return { pt: hit, via: '旧名称から読み替え' }
    }

    const fallback = SECTION_FALLBACKS[section]
    if (fallback) {
      for (const candidate of hasPartner ? fallback.withPartner : fallback.withoutPartner) {
        const hit = typeByName.get(candidate)
        if (hit) return { pt: hit, via: '区分から振り分け' }
      }
    }

    return { pt: null, via: '解決できず' }
  }

  function resolveMember(raw: string): { id: string | null; unknown: string | null } {
    const name = stripParens(raw).trim()
    if (!name) return { id: null, unknown: null }
    const hit = memberByKey.get(stripSpaces(name))
    return hit ? { id: hit.id, unknown: null } : { id: null, unknown: name }
  }

  const lines = tsv.split(/\r?\n/)
  for (const line of lines) {
    if (!line.trim()) continue
    const cells = line.split('\t')
    const [rawDate = '', rawType = '', rawDuration = '', material = '', content = '', rawPoint = '', rawSong = '', rawMember = '', rawPartner = '', rawSection = ''] = cells

    // 見出し行
    if (rawDate.trim() === '日付') continue

    const date = parseImportDate(rawDate)
    if (!date) {
      skippedRows += 1
      warnings.push(`日付を読み取れない行を飛ばしました: ${line.slice(0, 60)}`)
      continue
    }

    if (beforeYear !== undefined && Number(date.slice(0, 4)) >= beforeYear) {
      skippedRows += 1
      continue
    }

    const section = rawSection.trim() || DEFAULT_SECTION
    const typeText = rawType.trim()

    if (CONVENTION_MARKERS.some((marker) => typeText.includes(marker))) {
      conventionWeeks.add(date)
      skippedRows += 1
      continue
    }

    if (!typeText) {
      skippedRows += 1
      continue
    }

    const member = resolveMember(rawMember)
    const partner = resolveMember(rawPartner)
    const hasPartnerText = !!stripParens(rawPartner).trim()
    const { pt, via } = resolveType(typeText, section, hasPartnerText)
    const normalized = normalizeTypeName(typeText)
    const existing = mappingByRaw.get(typeText)
    if (existing) existing.count += 1
    else {
      mappingByRaw.set(typeText, {
        rawType: typeText,
        normalized,
        resolvedTypeName: pt?.name ?? null,
        via,
        count: 1,
      })
    }

    if (member.unknown) unknownNameSet.add(member.unknown)
    if (partner.unknown) unknownNameSet.add(partner.unknown)
    if (member.id) withMember += 1
    if (partner.id) withPartner += 1

    const songNumber = rawSong.trim() ? Number(rawSong.trim()) : null
    const song = songNumber !== null && !Number.isNaN(songNumber) ? songByNumber.get(songNumber) : undefined
    if (rawSong.trim() && !song) warnings.push(`${date}: 歌「${rawSong.trim()}」が見つかりません`)

    const pointCode = rawPoint.trim()
    const point = pointCode ? teachingPointByCode.get(stripSpaces(pointCode)) : undefined
    if (pointCode && !point) warnings.push(`${date}: 課題「${pointCode}」が見つかりません`)

    const rows = weekMap.get(date) ?? []
    rows.push({
      rawType: typeText,
      title: typeText,
      section,
      programTypeId: pt?.id ?? null,
      resolvedTypeName: pt?.name ?? null,
      durationMinutes: parseDuration(rawDuration),
      material: material.trim() || null,
      content: content.trim() || null,
      songId: song?.id ?? null,
      teachingPointId: point?.id ?? null,
      memberId: member.id,
      partnerId: partner.id,
    })
    weekMap.set(date, rows)
  }

  // 大会の週は割り当てが無いので、その週ごと取り込まない
  for (const date of conventionWeeks) {
    if (weekMap.has(date)) {
      skippedRows += weekMap.get(date)!.length
      weekMap.delete(date)
    }
    warnings.push(`${date}: 大会の週のため取り込みません`)
  }

  const weeks: ImportWeek[] = [...weekMap.entries()]
    .map(([date, programs]) => ({ date, programs: sortWeekPrograms(programs) }))
    .sort((a, b) => a.date.localeCompare(b.date))

  if (unknownNameSet.size > 0) {
    warnings.push(
      `名簿に無い名前が${unknownNameSet.size}人分ありました(担当者は空で取り込みます): ${[...unknownNameSet].join('、')}`,
    )
  }

  const typeMapping = [...mappingByRaw.values()].sort(
    (a, b) => b.count - a.count || a.normalized.localeCompare(b.normalized, 'ja'),
  )

  return {
    weeks,
    warnings,
    typeMapping,
    unknownNames: [...unknownNameSet],
    stats: {
      rows: weeks.reduce((sum, w) => sum + w.programs.length, 0),
      weeks: weeks.length,
      withMember,
      withPartner,
      skippedRows,
    },
  }
}
