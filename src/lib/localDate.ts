/**
 * 日付を「YYYY-MM-DD」の文字列にする処理をまとめたもの。
 *
 * Date.toISOString() は協定世界時(UTC)の日付を返すため、日本時間の午前0時〜8時59分は
 * 前日として扱われてしまう。その時間帯に開くと、月が切り替わらない・終了日が1日ずれる
 * といったことが起きるので、必ずこちらを使う。
 */

/** ローカル時間での「YYYY-MM-DD」 */
export function toLocalDateString(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** 今日(ローカル時間)の「YYYY-MM-DD」 */
export function todayString(): string {
  return toLocalDateString(new Date())
}

/** 今月(ローカル時間)の「YYYY-MM」 */
export function currentMonthString(): string {
  return todayString().slice(0, 7)
}

/** 翌月末(ローカル時間)の「YYYY-MM-DD」 */
export function endOfNextMonthString(): string {
  const d = new Date()
  // 翌々月の0日目 = 翌月の末日
  d.setMonth(d.getMonth() + 2, 0)
  return toLocalDateString(d)
}
