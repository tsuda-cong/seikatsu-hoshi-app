import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAppData } from '../../context/AppDataContext'
import { PrintToolbar } from '../../components/PrintToolbar'
import { memberDisplayName } from '../../lib/candidates'
import { computeEndTimesMinutes, formatClockTime } from '../../lib/schedule'
import {
  fetchRangeData,
  findChairmanName,
  formatDateHeading,
  formatPrintedDate,
  sectionColor,
  type RangeData,
} from '../../lib/printData'

function formatTitle(monthStr: string | undefined): string {
  if (!monthStr) return 'クリスチャンとしての生活と奉仕'
  const [, m] = monthStr.split('-').map(Number)
  if (!m) return 'クリスチャンとしての生活と奉仕'
  return `クリスチャンとしての生活と奉仕―${m}月`
}

/** 「1．」のような先頭の番号が付いているか */
function hasLeadingNumber(title: string): boolean {
  return /^\d+[．.]/.test(title)
}

export function SchedulePrintPage() {
  const { from, to, month } = useParams<{ from: string; to: string; month: string }>()
  const { settings, programTypes, songs } = useAppData()
  const [data, setData] = useState<RangeData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!from || !to) return
    fetchRangeData(from, to)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : '不明なエラーが発生しました'))
      .finally(() => setLoading(false))
  }, [from, to])

  if (loading) return <div className="center-message">読み込み中...</div>
  if (error) return <div className="center-message error-text">{error}</div>
  if (!data) return null

  return (
    <div>
      <PrintToolbar backTo="/reports" />
      <div className="print-sheet schedule-sheet">
        <div className="schedule-title-row">
          <h1>{formatTitle(month)}</h1>
          <span className="schedule-printed-date">{formatPrintedDate(new Date())}</span>
        </div>
        {data.dates.map((date) => {
          const allItems = data.programsByDate.get(date) ?? []
          const endMins = computeEndTimesMinutes(settings.meeting_start_time, allItems)
          const chairman = findChairmanName(allItems, data.assignmentByProgramId, programTypes)

          // 課題(教励課題)ありの項目は割当予定表に載せるため、ここでは除外する
          const visibleItems = allItems
            .map((item, idx) => ({ item, endMin: endMins[idx] }))
            .filter(({ item }) => !item.teaching_point_id)

          return (
            <div className="schedule-week" key={date}>
              <div className="schedule-week-header">
                <span>{formatDateHeading(date)}</span>
                {chairman && <span>司会者: {chairman}</span>}
              </div>
              {visibleItems.map(({ item, endMin }) => {
                const assignment = data.assignmentByProgramId.get(item.id)
                const song = item.song_id ? songs.find((s) => s.id === item.song_id) : undefined
                const titleText = item.title ?? item.program_types?.name ?? ''
                return (
                  <div
                    className="schedule-row"
                    key={item.id}
                    style={{ borderLeftColor: sectionColor(item.section) }}
                  >
                    {/* 歌が無い行では、表計算ソフトのように隣の空いた列までタイトルを伸ばす */}
                    <span
                      className={[
                        'schedule-col-title',
                        hasLeadingNumber(titleText) ? '' : 'schedule-col-title-unnumbered',
                        song ? '' : 'schedule-col-title-span-song',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {titleText}
                    </span>
                    {song && <span className="schedule-col-song">{`${song.number}番`}</span>}
                    <span className="schedule-col-duration">
                      {item.duration_minutes ? `${item.duration_minutes}分` : ''}
                    </span>
                    <span className="schedule-col-endtime">{`(〜${formatClockTime(endMin)})`}</span>
                    <span className="schedule-col-material">{item.material ?? ''}</span>
                    <span className="schedule-col-presenter">
                      {assignment?.member ? memberDisplayName(assignment.member) : ''}
                    </span>
                    <span className="schedule-col-partner">
                      {assignment?.partner ? `(${memberDisplayName(assignment.partner)})` : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          )
        })}
        {data.dates.length === 0 && <p className="center-message">対象期間にプログラムがありません。</p>}
      </div>
    </div>
  )
}
