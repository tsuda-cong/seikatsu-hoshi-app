import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAppData } from '../../context/AppDataContext'
import { PrintToolbar } from '../../components/PrintToolbar'
import { SlipCard } from '../../components/SlipCard'
import type { Assignment, Member, Program, ProgramType } from '../../types/domain'

type ProgramWithType = Program & { program_types: ProgramType | null }
type AssignmentWithRelations = Assignment & {
  member: Member | null
  partner: Member | null
}

export function SlipsRangePrintPage() {
  const { from, to } = useParams<{ from: string; to: string }>()
  const { teachingPoints } = useAppData()
  const [programs, setPrograms] = useState<ProgramWithType[]>([])
  const [assignments, setAssignments] = useState<AssignmentWithRelations[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!from || !to) return
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const { data: programData, error: programError } = await supabase
          .from('programs')
          .select('*, program_types(*)')
          .gte('date', from)
          .lte('date', to)
          .not('teaching_point_id', 'is', null)
          .order('date', { ascending: true })
          .order('order_no', { ascending: true })
          .returns<ProgramWithType[]>()
        if (programError) throw programError
        setPrograms(programData ?? [])

        const programIds = (programData ?? []).map((p) => p.id)
        if (programIds.length === 0) {
          setAssignments([])
          return
        }
        const { data: assignmentData, error: assignmentError } = await supabase
          .from('assignments')
          .select('*, member:members!member_id(*), partner:members!partner_id(*)')
          .in('program_id', programIds)
          .returns<AssignmentWithRelations[]>()
        if (assignmentError) throw assignmentError
        setAssignments(assignmentData ?? [])
      } catch (e) {
        setError(e instanceof Error ? e.message : '不明なエラーが発生しました')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [from, to])

  if (loading) return <div className="center-message">読み込み中...</div>
  if (error) return <div className="center-message error-text">{error}</div>

  const slipItems = programs
    .map((program) => ({ program, assignment: assignments.find((a) => a.program_id === program.id) }))
    .filter((item) => item.assignment?.member_id)

  return (
    <div>
      <PrintToolbar backTo="/reports" />
      <div className="slip-grid">
        {slipItems.map(({ program, assignment }) => (
          <SlipCard
            key={program.id}
            member={assignment?.member ?? null}
            partner={assignment?.partner ?? null}
            program={program}
            teachingPoint={
              program.teaching_point_id
                ? (teachingPoints.find((t) => t.id === program.teaching_point_id) ?? null)
                : null
            }
          />
        ))}
        {slipItems.length === 0 && <p className="center-message">対象期間に該当する割り当てがありません。</p>}
      </div>
    </div>
  )
}
