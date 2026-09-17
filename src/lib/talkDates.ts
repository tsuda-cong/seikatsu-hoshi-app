/**
 * 講演(週末の集会)の担当日まわりの計算をまとめたもの。
 *
 * 週日の集会(生活と奉仕)の担当を決めるとき、同じ週の週末に講演を担当する人は
 * 負担が重なる。候補一覧での注意喚起と、講演日付のページの両方でここを使う。
 */

import { TALK_QUALIFICATION, type Member, type TalkDate } from '../types/domain'
import { toLocalDateString, todayString } from './localDate'

/**
 * 「YYYY-MM-DD」をローカル時間の Date にする。
 * new Date('2026-10-04') は協定世界時として解釈され、日本時間では前日になってしまう
 */
export function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** 日数を足した「YYYY-MM-DD」 */
export function addDays(dateStr: string, days: number): string {
  const d = parseLocalDate(dateStr)
  d.setDate(d.getDate() + days)
  return toLocalDateString(d)
}

/**
 * その日を含む週(月曜〜日曜)の範囲。
 * 週日の集会とその週末の講演を「同じ週」と見なすための区切り
 */
export function weekRangeOf(dateStr: string): { start: string; end: string } {
  const d = parseLocalDate(dateStr)
  const offsetFromMonday = (d.getDay() + 6) % 7 // getDay(): 0=日曜
  const start = new Date(d)
  start.setDate(d.getDate() - offsetFromMonday)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return { start: toLocalDateString(start), end: toLocalDateString(end) }
}

/**
 * memberId -> 指定した週(月曜〜日曜)にある講演の日付(古い順)。
 * 同じ日に複数の講演者がいることがあるので、日付ではなく人を軸に持つ
 */
export function buildTalkDatesInWeek(talkDates: TalkDate[], dateStr: string): Map<string, string[]> {
  const { start, end } = weekRangeOf(dateStr)
  const map = new Map<string, string[]>()
  for (const t of talkDates) {
    if (t.date < start || t.date > end) continue
    const list = map.get(t.member_id)
    if (list) list.push(t.date)
    else map.set(t.member_id, [t.date])
  }
  for (const list of map.values()) list.sort()
  return map
}

/** 講演日付のページに出す人。休止中の人は出さない */
export function talkSpeakers(members: Member[], talkDates: TalkDate[]): Member[] {
  const hasDate = new Set(talkDates.map((t) => t.member_id))
  return members.filter(
    (m) =>
      m.status === '現役' &&
      // 承認を外したあとも日付が残っている人は、見えないまま残らないように出す
      ((m.qualifications ?? []).includes(TALK_QUALIFICATION) || hasDate.has(m.id)),
  )
}

/** 一覧や注意喚起に出す短い日付(例: 10/4(日)) */
export function formatTalkDate(dateStr: string): string {
  const d = parseLocalDate(dateStr)
  const weekday = d.toLocaleDateString('ja-JP', { weekday: 'short' })
  return `${d.getMonth() + 1}/${d.getDate()}(${weekday})`
}

/**
 * 入力欄に最初に出す日付。
 * 入力は講演の予定表を上から順に拾っていく流れなので、既に入れてある一番先の日付の
 * 次の週から始める。まだ何も無ければ、今日以降で最初の日曜から始める
 */
export function nextEntryDate(talkDates: TalkDate[]): string {
  const today = todayString()
  const future = talkDates.map((t) => t.date).filter((d) => d >= today)
  if (future.length > 0) return addDays(future.reduce((a, b) => (a > b ? a : b)), 7)
  const d = parseLocalDate(today)
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7))
  return toLocalDateString(d)
}
