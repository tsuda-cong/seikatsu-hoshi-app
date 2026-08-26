import { memberDisplayName } from '../lib/candidates'
import type { Member, Program, ProgramType, TeachingPoint } from '../types/domain'

interface SlipCardProps {
  member: Member | null
  partner: Member | null
  program: Program & { program_types: ProgramType | null }
  teachingPoint: TeachingPoint | null
}

export function SlipCard({ member, partner, program, teachingPoint }: SlipCardProps) {
  const programType = program.program_types

  return (
    <div className="print-sheet slip-sheet">
      <h1 className="slip-title">
        クリスチャンとしての生活と
        <br />
        奉仕の集会の割り当て
      </h1>
      <dl className="slip-fields">
        <dt>氏名:</dt>
        <dd className="slip-name">{member ? memberDisplayName(member) : '(未割当)'}</dd>

        <dt>相手:</dt>
        <dd>{partner ? `(${memberDisplayName(partner)})` : ''}</dd>

        <dt>日付:</dt>
        <dd>{program.date.replaceAll('-', '/')}</dd>

        <dt>担当部分:</dt>
        <dd>
          {program.title ?? programType?.name}
          {program.duration_minutes ? `(${program.duration_minutes}分)` : ''}
        </dd>

        <dt>資料:</dt>
        <dd>{program.material ?? ''}</dd>

        <dt>内容:</dt>
        <dd>{program.content ?? ''}</dd>

        <dt>課題:</dt>
        <dd>{teachingPoint ? `${teachingPoint.code} ${teachingPoint.title}` : ''}</dd>
      </dl>
      <p className="slip-footnote">
        生徒の方へ: 割り当ての資料と課題は、「生活と奉仕 集会ワークブック」に載せられています。「クリスチャンとしての生活と奉仕の集会に関する説明」(S-38)を参照し、担当する部分の指示を確認してください。
      </p>
    </div>
  )
}
