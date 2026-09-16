import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useAppData } from '../../context/AppDataContext'
import { PdfReportView } from '../../components/PdfReportView'
import { fetchRangeData } from '../../lib/printData'
import { buildSchedulePdf } from '../../lib/pdf/schedulePdf'
import { loadReportFont } from '../../lib/pdf/loadFont'
import { toScheduleModel } from '../../lib/pdf/reportModels'

export function SchedulePrintPage() {
  const { from, to, month } = useParams<{ from: string; to: string; month: string }>()
  const { loading, settings, programTypes, songs } = useAppData()

  // 設定・種別・歌の一覧が揃うまでは組み立てない(揃う前に組むと、終了時刻や司会者、歌番号が崩れる)
  const build = useMemo(() => {
    if (!from || !to || loading) return null
    return async () => {
      const [data, font] = await Promise.all([fetchRangeData(from, to), loadReportFont()])
      return buildSchedulePdf(toScheduleModel(data, month, settings.meeting_start_time, programTypes, songs), font)
    }
  }, [from, to, month, loading, settings.meeting_start_time, programTypes, songs])

  const monthLabel = month ? `${Number(month.split('-')[1])}月` : `${from}_${to}`
  return (
    <PdfReportView title="集会予定表" fileName={`集会予定表_${monthLabel}.pdf`} backTo="/reports" build={build} />
  )
}
