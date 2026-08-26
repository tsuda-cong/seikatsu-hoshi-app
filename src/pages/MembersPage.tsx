import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAppData } from '../context/AppDataContext'
import { GENDERS, MEMBER_STATUSES, POSITIONS, QUALIFICATIONS, type Member, type Qualification } from '../types/domain'

interface MemberDraft {
  last_name: string
  first_name: string
  last_name_kana: string
  first_name_kana: string
  gender: string
  position: string
  status: string
  qualifications: Qualification[]
  excluded_program_type_ids: string[]
}

const EMPTY_DRAFT: MemberDraft = {
  last_name: '',
  first_name: '',
  last_name_kana: '',
  first_name_kana: '',
  gender: GENDERS[0],
  position: POSITIONS[2],
  status: MEMBER_STATUSES[0],
  qualifications: [],
  excluded_program_type_ids: [],
}

function draftFromMember(m: Member): MemberDraft {
  return {
    last_name: m.last_name,
    first_name: m.first_name,
    last_name_kana: m.last_name_kana ?? '',
    first_name_kana: m.first_name_kana ?? '',
    gender: m.gender,
    position: m.position,
    status: m.status,
    qualifications: m.qualifications ?? [],
    excluded_program_type_ids: m.excluded_program_type_ids ?? [],
  }
}

function draftToPatch(d: MemberDraft) {
  return {
    last_name: d.last_name.trim(),
    first_name: d.first_name.trim(),
    last_name_kana: d.last_name_kana.trim() || null,
    first_name_kana: d.first_name_kana.trim() || null,
    gender: d.gender,
    honorific: d.gender === '男性' ? '兄弟' : '姉妹',
    position: d.position,
    status: d.status,
    qualifications: d.qualifications,
    excluded_program_type_ids: d.excluded_program_type_ids,
  }
}

export function MembersPage() {
  const { members, programTypes, refetchAll } = useAppData()
  const [query, setQuery] = useState('')
  const [genderFilter, setGenderFilter] = useState('')
  const [positionFilter, setPositionFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<MemberDraft>(EMPTY_DRAFT)
  const [newDraft, setNewDraft] = useState<MemberDraft>(EMPTY_DRAFT)
  const [error, setError] = useState<string | null>(null)

  const visibleMembers = useMemo(() => {
    const q = query.trim()
    return members
      .filter((m) => !q || `${m.last_name}${m.first_name}${m.last_name_kana ?? ''}${m.first_name_kana ?? ''}`.includes(q))
      .filter((m) => !genderFilter || m.gender === genderFilter)
      .filter((m) => !positionFilter || m.position === positionFilter)
      .filter((m) => !statusFilter || m.status === statusFilter)
  }, [members, query, genderFilter, positionFilter, statusFilter])

  function startEdit(member: Member) {
    setEditingId(member.id)
    setDraft(draftFromMember(member))
    setError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setDraft(EMPTY_DRAFT)
  }

  function toggleQualification(list: Qualification[], q: Qualification): Qualification[] {
    return list.includes(q) ? list.filter((x) => x !== q) : [...list, q]
  }

  function toggleExcludedType(list: string[], typeId: string): string[] {
    return list.includes(typeId) ? list.filter((x) => x !== typeId) : [...list, typeId]
  }

  async function handleSave() {
    if (!editingId) return
    setError(null)
    try {
      const { error } = await supabase.from('members').update(draftToPatch(draft)).eq('id', editingId)
      if (error) throw error
      cancelEdit()
      await refetchAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存に失敗しました')
    }
  }

  async function handleAdd() {
    if (!newDraft.last_name.trim() || !newDraft.first_name.trim()) {
      setError('姓と名は必須です')
      return
    }
    setError(null)
    try {
      const { error } = await supabase.from('members').insert(draftToPatch(newDraft))
      if (error) throw error
      setNewDraft(EMPTY_DRAFT)
      await refetchAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : '追加に失敗しました')
    }
  }

  async function handleDelete(member: Member) {
    if (!window.confirm(`「${member.last_name} ${member.first_name}」を削除しますか?`)) return
    setError(null)
    try {
      const { error } = await supabase.from('members').delete().eq('id', member.id)
      if (error) throw error
      await refetchAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : '削除に失敗しました')
    }
  }

  function renderQualificationCheckboxes(list: Qualification[], onChange: (next: Qualification[]) => void) {
    return (
      <div className="crud-checkbox-group">
        {QUALIFICATIONS.map((q) => (
          <label key={q}>
            <input
              type="checkbox"
              checked={list.includes(q)}
              onChange={() => onChange(toggleQualification(list, q))}
            />
            {q}
          </label>
        ))}
      </div>
    )
  }

  function renderExcludedTypeCheckboxes(list: string[], onChange: (next: string[]) => void) {
    return (
      <div className="crud-checkbox-group">
        {programTypes.map((pt) => (
          <label key={pt.id}>
            <input
              type="checkbox"
              checked={list.includes(pt.id)}
              onChange={() => onChange(toggleExcludedType(list, pt.id))}
            />
            {pt.name}
          </label>
        ))}
      </div>
    )
  }

  return (
    <div className="page">
      <h1>名簿</h1>
      <div className="members-filter-bar">
        <input
          className="crud-search"
          type="text"
          placeholder="名前で検索..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select value={genderFilter} onChange={(e) => setGenderFilter(e.target.value)}>
          <option value="">性別: すべて</option>
          {GENDERS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <select value={positionFilter} onChange={(e) => setPositionFilter(e.target.value)}>
          <option value="">立場: すべて</option>
          {POSITIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">状況: すべて</option>
          {MEMBER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {(genderFilter || positionFilter || statusFilter) && (
          <button
            type="button"
            className="members-filter-clear"
            onClick={() => {
              setGenderFilter('')
              setPositionFilter('')
              setStatusFilter('')
            }}
          >
            絞り込み解除
          </button>
        )}
      </div>
      {error && <p className="error-text">{error}</p>}
      {/* 狭い画面では表を組み替えず、横スクロールで見てもらう */}
      <div className="crud-table-scroll">
        <table className="crud-table">
        <thead>
          <tr>
            <th>姓</th>
            <th>名</th>
            <th>姓かな</th>
            <th>名かな</th>
            <th>性別</th>
            <th>立場</th>
            <th>状況</th>
            <th>特別承認</th>
            <th>担当させない種別</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {visibleMembers.map((member) =>
            editingId === member.id ? (
              <tr key={member.id}>
                <td>
                  <input value={draft.last_name} onChange={(e) => setDraft((d) => ({ ...d, last_name: e.target.value }))} />
                </td>
                <td>
                  <input value={draft.first_name} onChange={(e) => setDraft((d) => ({ ...d, first_name: e.target.value }))} />
                </td>
                <td>
                  <input
                    value={draft.last_name_kana}
                    onChange={(e) => setDraft((d) => ({ ...d, last_name_kana: e.target.value }))}
                  />
                </td>
                <td>
                  <input
                    value={draft.first_name_kana}
                    onChange={(e) => setDraft((d) => ({ ...d, first_name_kana: e.target.value }))}
                  />
                </td>
                <td>
                  <select value={draft.gender} onChange={(e) => setDraft((d) => ({ ...d, gender: e.target.value }))}>
                    {GENDERS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select value={draft.position} onChange={(e) => setDraft((d) => ({ ...d, position: e.target.value }))}>
                    {POSITIONS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}>
                    {MEMBER_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  {renderQualificationCheckboxes(draft.qualifications, (next) =>
                    setDraft((d) => ({ ...d, qualifications: next })),
                  )}
                </td>
                <td>
                  {renderExcludedTypeCheckboxes(draft.excluded_program_type_ids, (next) =>
                    setDraft((d) => ({ ...d, excluded_program_type_ids: next })),
                  )}
                </td>
                <td className="row-actions">
                  <button type="button" onClick={handleSave}>
                    保存
                  </button>
                  <button type="button" onClick={cancelEdit}>
                    取消
                  </button>
                </td>
              </tr>
            ) : (
              <tr key={member.id}>
                <td>{member.last_name}</td>
                <td>{member.first_name}</td>
                <td>{member.last_name_kana}</td>
                <td>{member.first_name_kana}</td>
                <td>{member.gender}</td>
                <td>{member.position}</td>
                <td>{member.status}</td>
                <td>{(member.qualifications ?? []).join('、')}</td>
                <td>
                  {(member.excluded_program_type_ids ?? [])
                    .map((id) => programTypes.find((pt) => pt.id === id)?.name)
                    .filter(Boolean)
                    .join('、')}
                </td>
                <td className="row-actions">
                  <button type="button" onClick={() => startEdit(member)}>
                    編集
                  </button>
                  <button type="button" onClick={() => handleDelete(member)}>
                    削除
                  </button>
                </td>
              </tr>
            ),
          )}
          <tr>
            <td>
              <input
                placeholder="姓"
                value={newDraft.last_name}
                onChange={(e) => setNewDraft((d) => ({ ...d, last_name: e.target.value }))}
              />
            </td>
            <td>
              <input
                placeholder="名"
                value={newDraft.first_name}
                onChange={(e) => setNewDraft((d) => ({ ...d, first_name: e.target.value }))}
              />
            </td>
            <td>
              <input
                placeholder="姓かな"
                value={newDraft.last_name_kana}
                onChange={(e) => setNewDraft((d) => ({ ...d, last_name_kana: e.target.value }))}
              />
            </td>
            <td>
              <input
                placeholder="名かな"
                value={newDraft.first_name_kana}
                onChange={(e) => setNewDraft((d) => ({ ...d, first_name_kana: e.target.value }))}
              />
            </td>
            <td>
              <select value={newDraft.gender} onChange={(e) => setNewDraft((d) => ({ ...d, gender: e.target.value }))}>
                {GENDERS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </td>
            <td>
              <select value={newDraft.position} onChange={(e) => setNewDraft((d) => ({ ...d, position: e.target.value }))}>
                {POSITIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </td>
            <td>
              <select value={newDraft.status} onChange={(e) => setNewDraft((d) => ({ ...d, status: e.target.value }))}>
                {MEMBER_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </td>
            <td>
              {renderQualificationCheckboxes(newDraft.qualifications, (next) =>
                setNewDraft((d) => ({ ...d, qualifications: next })),
              )}
            </td>
            <td>
              {renderExcludedTypeCheckboxes(newDraft.excluded_program_type_ids, (next) =>
                setNewDraft((d) => ({ ...d, excluded_program_type_ids: next })),
              )}
            </td>
            <td className="row-actions">
              <button type="button" onClick={handleAdd}>
                + 追加
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      </div>
    </div>
  )
}
