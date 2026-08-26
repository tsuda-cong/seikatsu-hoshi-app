import { Fragment, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAppData } from '../../context/AppDataContext'
import { PrintToolbar } from '../../components/PrintToolbar'
import { memberDisplayName } from '../../lib/candidates'
import { fetchRangeData, findChairmanName, formatDateHeading, formatPrintedDate, type RangeData } from '../../lib/printData'

export function AssignmentsRangePrintPage() {
  const { from, to } = useParams<{ from: string; to: string }>()
  const { programTypes, teachingPoints } = useAppData()
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
      <div className="print-sheet assignments-sheet">
        <h1>クリスチャンとしての生活と奉仕の集会の割り当て予定表</h1>
        <table className="assignments-table">
          <colgroup>
            <col className="col-title" />
            <col className="col-duration" />
            <col className="col-point" />
            <col className="col-student" />
            <col className="col-partner" />
          </colgroup>
          <thead>
            <tr>
              <th>割当</th>
              <th>時間</th>
              <th>課題</th>
              <th>生徒</th>
              <th>相手</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              let rowIndex = 0
              return data.dates.map((date) => {
                const items = (data.programsByDate.get(date) ?? []).filter((item) => item.teaching_point_id)
                if (items.length === 0) return null
                const chairman = findChairmanName(
                  data.programsByDate.get(date) ?? [],
                  data.assignmentByProgramId,
                  programTypes,
                )

                return (
                  <Fragment key={date}>
                    {/* 生徒・相手の列を名前の幅まで絞ったので、助言者名が入るよう
                        見出しは最後の2列にまたがらせる */}
                    <tr className="assignments-week-header">
                      <td colSpan={3}>{formatDateHeading(date)}</td>
                      <td colSpan={2}>{chairman ? `助言者: ${chairman}` : ''}</td>
                    </tr>
                    {items.map((item) => {
                      const assignment = data.assignmentByProgramId.get(item.id)
                      const teachingPoint = item.teaching_point_id
                        ? teachingPoints.find((t) => t.id === item.teaching_point_id)
                        : null
                      const isStripe = rowIndex % 2 === 1
                      rowIndex += 1
                      return (
                        <tr key={item.id} className={isStripe ? 'assignments-stripe' : undefined}>
                          <td>{item.title ?? item.program_types?.name}</td>
                          <td>{item.duration_minutes ? `(${item.duration_minutes}分)` : ''}</td>
                          <td>{teachingPoint?.code ?? ''}</td>
                          <td>{assignment?.member ? memberDisplayName(assignment.member) : ''}</td>
                          <td>{assignment?.partner ? `(${memberDisplayName(assignment.partner)})` : ''}</td>
                        </tr>
                      )
                    })}
                  </Fragment>
                )
              })
            })()}
          </tbody>
        </table>
        <div className="assignments-printed-date">{formatPrintedDate()}</div>
      </div>
    </div>
  )
}
