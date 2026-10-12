export function parseTimeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

/** 19:35 -> "7:35" (12時間表記、AM/PMなし。集会は常に夜のため) */
export function formatClockTime(totalMinutes: number): string {
  const h24 = Math.floor(totalMinutes / 60) % 24
  const m = ((totalMinutes % 60) + 60) % 60
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(m).padStart(2, '0')}`
}

export interface TimedItem {
  duration_minutes: number | null
  teaching_point_id: string | null
  program_types?: { adds_comment_minute?: boolean | null } | null
}

/**
 * 開始時刻からの累積終了予定時刻(分)を項目ごとに返す。
 * 教励課題が設定されている項目は、助言者コメント用に1分を上乗せする。
 * 課題が無くても司会者がひと言述べる部分(課題の無い実演など)は、
 * 種別の「コメントの分を足す」で同じ1分を上乗せする。
 */
export function computeEndTimesMinutes(startTimeStr: string, items: TimedItem[]): number[] {
  let cursor = parseTimeToMinutes(startTimeStr)
  const ends: number[] = []
  for (const item of items) {
    cursor += item.duration_minutes ?? 0
    if (item.teaching_point_id || item.program_types?.adds_comment_minute) cursor += 1
    ends.push(cursor)
  }
  return ends
}
