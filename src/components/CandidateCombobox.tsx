import { useEffect, useMemo, useRef, useState } from 'react'
import type { Candidate } from '../lib/candidates'
import { formatLastAssigned, memberDisplayName } from '../lib/candidates'

interface CandidateComboboxProps {
  candidates: Candidate[]
  referenceDate: string
  onSelect: (memberId: string | null) => void
  onClose: () => void
  allowClear?: boolean
  /**
   * 名前で絞り込む入力欄を出すか。候補は担当日順に並んでいて目視で選ぶため、
   * 既定では出さない(スマホでキーボードが開いてしまうのを避ける意味もある)
   */
  searchable?: boolean
}

/** 開会の祈りと閉会の祈りは一目で見分けられるよう色を変える */
function typeNameClass(typeName: string): string {
  if (typeName === '開会の祈り') return 'candidate-type-opening'
  if (typeName === '閉会の祈り') return 'candidate-type-closing'
  return ''
}

export function CandidateCombobox({
  candidates,
  referenceDate,
  onSelect,
  onClose,
  allowClear = true,
  searchable = false,
}: CandidateComboboxProps) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      // 検索欄が無いときはボタンが残ったままリストだけを開くので、
      // ボタンを含む枠の外側を押したときに閉じる(でないとボタンで閉じられない)
      const root = containerRef.current?.closest('.assignment-cell') ?? containerRef.current
      if (root && !root.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const filtered = useMemo(() => {
    const q = searchable ? query.trim() : ''
    if (!q) return candidates
    return candidates.filter(({ member }) => {
      const haystack = `${member.last_name}${member.first_name}${member.last_name_kana ?? ''}${member.first_name_kana ?? ''}${member.honorific}`
      return haystack.includes(q)
    })
  }, [candidates, query, searchable])

  return (
    <div className={`candidate-combobox ${searchable ? '' : 'candidate-combobox-listonly'}`} ref={containerRef}>
      {searchable && (
        <input
          ref={inputRef}
          type="text"
          placeholder="名前で検索..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose()
          }}
        />
      )}
      <ul className="candidate-list">
        {allowClear && (
          <li>
            <button type="button" className="candidate-clear" onClick={() => onSelect(null)}>
              未割当にする
            </button>
          </li>
        )}
        {filtered.length === 0 && <li className="candidate-empty">該当する候補者がいません</li>}
        {filtered.map((c) => (
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
