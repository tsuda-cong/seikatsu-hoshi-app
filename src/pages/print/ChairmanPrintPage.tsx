import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useAppData } from '../../context/AppDataContext'
import { PdfReportView } from '../../components/PdfReportView'
import { fetchRangeData } from '../../lib/printData'
import { buildChairmanPdf } from '../../lib/pdf/chairmanPdf'
import { loadReportFont } from '../../lib/pdf/loadFont'
import { toChairmanModel } from '../../lib/pdf/reportModels'

export function ChairmanPrintPage() {
  const { from, to } = useParams<{ from: string; to: string }>()
  const { loading, settings, songs } = useAppData()

  // 設定と歌の一覧が揃うまでは組み立てない(揃う前に組むと、終了時刻や歌の題名が崩れる)
  const build = useMemo(() => {
    if (!from || !to || loading) return null
    return async () => {
      const [data, font] = await Promise.all([fetchRangeData(from, to), loadReportFont()])
      return buildChairmanPdf(toChairmanModel(data, settings.meeting_start_time, songs), font)
    }
  }, [from, to, loading, settings.meeting_start_time, songs])

  return (
    <PdfReportView title="司会進行用紙" fileName={`司会進行用紙_${from}_${to}.pdf`} backTo="/reports" build={build} />
  )
}
