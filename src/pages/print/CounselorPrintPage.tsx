import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useAppData } from '../../context/AppDataContext'
import { PdfReportView } from '../../components/PdfReportView'
import { fetchRangeData } from '../../lib/printData'
import { buildCounselorPdf } from '../../lib/pdf/counselorPdf'
import { loadReportFont } from '../../lib/pdf/loadFont'
import { toCounselorModel } from '../../lib/pdf/reportModels'

export function CounselorPrintPage() {
  const { from, to } = useParams<{ from: string; to: string }>()
  const { loading, settings, teachingPoints } = useAppData()

  // 設定と課題の一覧が揃うまでは組み立てない(揃う前に組むと、終了時刻や課題が空になる)
  const build = useMemo(() => {
    if (!from || !to || loading) return null
    return async () => {
      const [data, font] = await Promise.all([fetchRangeData(from, to), loadReportFont()])
      return buildCounselorPdf(toCounselorModel(data, settings.meeting_start_time, teachingPoints), font)
    }
  }, [from, to, loading, settings.meeting_start_time, teachingPoints])

  return (
    <PdfReportView title="助言者用紙" fileName={`助言者用紙_${from}_${to}.pdf`} backTo="/reports" build={build} />
  )
}
