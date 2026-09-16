import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useAppData } from '../../context/AppDataContext'
import { PdfReportView } from '../../components/PdfReportView'
import { fetchRangeData } from '../../lib/printData'
import { buildAssignmentsPdf } from '../../lib/pdf/assignmentsPdf'
import { loadReportFont } from '../../lib/pdf/loadFont'
import { toAssignmentsModel } from '../../lib/pdf/reportModels'

export function AssignmentsRangePrintPage() {
  const { from, to } = useParams<{ from: string; to: string }>()
  const { loading, programTypes, teachingPoints } = useAppData()

  // 種別と課題の一覧が揃うまでは組み立てない(揃う前に組むと、助言者や課題が空のPDFになる)
  const build = useMemo(() => {
    if (!from || !to || loading) return null
    return async () => {
      const [data, font] = await Promise.all([fetchRangeData(from, to), loadReportFont()])
      return buildAssignmentsPdf(toAssignmentsModel(data, programTypes, teachingPoints), font)
    }
  }, [from, to, loading, programTypes, teachingPoints])

  return (
    <PdfReportView title="割当予定表" fileName={`割当予定表_${from}_${to}.pdf`} backTo="/reports" build={build} />
  )
}
