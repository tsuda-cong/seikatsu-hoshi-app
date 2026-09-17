import { useEffect, useRef } from 'react'
import type { Candidate } from '../lib/candidates'
import { formatLastAssigned, memberDisplayName } from '../lib/candidates'
import { formatTalkDate } from '../lib/talkDates'

interface CandidateComboboxProps {
  candidates: Candidate[]
  referenceDate: string
  onSelect: (memberId: string | null) => void
  onClose: () => void
  allowClear?: boolean
}

/** 開会の祈りと閉会の祈りは一目で見分けられるよう色を変える */
function typeNameClass(typeName: string): string {
  if (typeName === '開会の祈り') return 'candidate-type-opening'
  if (typeName === '閉会の祈り') return 'candidate-type-closing'
  return ''
}

/**
 * 候補者の一覧。名前で絞り込む入力欄は置かない。候補は担当日順に並んでいて
 * 目視で選ぶものであり、スマホでは入力欄のせいでキーボードが開いてしまうため。
 */
export function CandidateCombobox({
  candidates,
  referenceDate,
  onSelect,
  onClose,
  allowClear = true,
}: CandidateComboboxProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      // 現在の割り当てを示すボタンは開いたまま残るので、そのボタンを含む枠の
      // 外側を押したときに閉じる(でないとボタンで閉じられない)
      const root = containerRef.current?.closest('.assignment-cell') ?? containerRef.current
      if (root && !root.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  return (
    <div className="candidate-combobox" ref={containerRef}>
      <ul className="candidate-list">
        {allowClear && (
          <li>
            <button type="button" className="candidate-clear" onClick={() => onSelect(null)}>
              未割当にする
            </button>
          </li>
        )}
        {candidates.length === 0 && <li className="candidate-empty">該当する候補者がいません</li>}
        {candidates.map((c) => (
          <li key={c.member.id}>
            <button
              type="button"
              className={c.isDuplicateToday ? 'candidate-duplicate' : ''}
              onClick={() => onSelect(c.member.id)}
            >
              <span className={`candidate-name ${c.previouslyPaired ? 'candidate-name-paired' : ''}`}>
                {memberDisplayName(c.member)}
              </span>
              <span className="candidate-meta">
                {c.isDuplicateToday && <span className="candidate-warning">⚠ 本日他の担当あり</span>}
                {/* 同じ週の週末に講演がある人。選ぶことはできる(注意喚起だけ) */}
                {c.talkDateInWeek && (
                  <span className="candidate-warning">⚠ 週末に講演 {formatTalkDate(c.talkDateInWeek)}</span>
                )}
                {(() => {
                  const { period, typeName } = formatLastAssigned(
                    c.lastAssignedDate,
                    c.lastAssignedType,
                    referenceDate,
                  )
                  if (!typeName) return period
                  return (
                    <>
                      {period}・<span className={typeNameClass(typeName)}>{typeName}</span>
                    </>
                  )
                })()}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
