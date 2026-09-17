import { useState } from 'react'
import type { Candidate } from '../lib/candidates'
import { memberDisplayName } from '../lib/candidates'
import type { Member } from '../types/domain'
import { formatTalkDate } from '../lib/talkDates'
import { CandidateCombobox } from './CandidateCombobox'

interface AssignmentCellProps {
  currentMember: Member | null | undefined
  candidates: Candidate[]
  /** 候補一覧の「前回/今後」表示の基準日 */
  referenceDate: string
  onAssign: (memberId: string | null) => void
  saving?: boolean
  placeholder?: string
  isDuplicateToday?: boolean
  nearOneWeek?: boolean
  nearTwoWeeks?: boolean
  proximityLabel?: string
  proximityTooltip?: string
  /** 割り当て済みの人が同じ週の週末に講演を担当する場合、その日付 */
  talkDateInWeek?: string | null
}

export function AssignmentCell({
  currentMember,
  candidates,
  referenceDate,
  onAssign,
  saving,
  placeholder = '未割当',
  isDuplicateToday,
  nearOneWeek,
  nearTwoWeeks,
  proximityLabel,
  proximityTooltip,
  talkDateInWeek,
}: AssignmentCellProps) {
  const [open, setOpen] = useState(false)

  // 優先度: 同日重複 > 前後1週 > 前後2週
  const proximityClass = !currentMember
    ? ''
    : isDuplicateToday
      ? 'assignment-duplicate'
      : nearOneWeek
        ? 'assignment-near-1w'
        : nearTwoWeeks
          ? 'assignment-near-2w'
          : ''

  // ラベル・ツールチップは色帯と同じ優先度でのみ表示する(同日重複の時は表示しない)
  const showProximity = !isDuplicateToday && (nearOneWeek || nearTwoWeeks)
  const showLabel = showProximity && !!proximityLabel

  // 週末の講演は前後の週の担当とは別の話なので、色帯ではなく名前の後ろの印で知らせる
  const showTalk = !!currentMember && !!talkDateInWeek
  const talkTooltip = showTalk ? `${formatTalkDate(talkDateInWeek)} に講演` : undefined
  const tooltip = [showProximity ? proximityTooltip : undefined, talkTooltip].filter(Boolean).join('\n') || undefined

  return (
    <div className="assignment-cell">
      <button
        type="button"
        className={`assignment-value ${currentMember ? '' : 'assignment-empty'} ${proximityClass}`}
        onClick={() => setOpen((v) => !v)}
        disabled={saving}
        title={tooltip}
      >
        {saving
          ? '保存中...'
          : currentMember
            ? `${memberDisplayName(currentMember)}${showLabel ? ` ${proximityLabel}` : ''}`
            : placeholder}
        {!saving && showTalk && <span className="assignment-talk">⚠ 週末に講演</span>}
      </button>
      {/* 現在の割り当てを見たまま選べるよう、ボタンは残してその下にリストを開く */}
      {open && (
        <CandidateCombobox
          candidates={candidates}
          referenceDate={referenceDate}
          onClose={() => setOpen(false)}
          onSelect={(memberId) => {
            onAssign(memberId)
            setOpen(false)
          }}
        />
      )}
    </div>
  )
}
