import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAppData } from '../context/AppDataContext'
import { GENDERS, POSITIONS, QUALIFICATIONS, type Position, type ProgramType } from '../types/domain'

interface ProgramTypeDraft {
  name: string
  required_position: Position[]
  required_gender: string
  needs_partner: boolean
  partner_same_gender: boolean
  required_qualification: string
  partner_program_type_id: string
  recency_pool: string
}

const EMPTY_DRAFT: ProgramTypeDraft = {
  name: '',
  required_position: [],
  required_gender: '',
  needs_partner: false,
  partner_same_gender: false,
  required_qualification: '',
  partner_program_type_id: '',
  recency_pool: '',
}

function draftFromType(pt: ProgramType): ProgramTypeDraft {
  return {
    name: pt.name,
    required_position: pt.required_position ?? [],
    required_gender: pt.required_gender ?? '',
    needs_partner: pt.needs_partner ?? false,
    partner_same_gender: pt.partner_same_gender ?? false,
    required_qualification: pt.required_qualification ?? '',
    partner_program_type_id: pt.partner_program_type_id ?? '',
    recency_pool: pt.recency_pool ?? '',
  }
}

function draftToPatch(d: ProgramTypeDraft) {
  return {
    name: d.name.trim(),
    required_position: d.required_position.length > 0 ? d.required_position : null,
    required_gender: d.required_gender || null,
    needs_partner: d.needs_partner,
    partner_same_gender: d.partner_same_gender,
    required_qualification: d.required_qualification || null,
    partner_program_type_id: d.partner_program_type_id || null,
    recency_pool: d.recency_pool.trim() || null,
  }
}

export function ProgramTypesPage() {
  const { programTypes, refetchAll } = useAppData()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<ProgramTypeDraft>(EMPTY_DRAFT)
  const [newDraft, setNewDraft] = useState<ProgramTypeDraft>(EMPTY_DRAFT)
  const [error, setError] = useState<string | null>(null)

  function startEdit(pt: ProgramType) {
    setEditingId(pt.id)
    setDraft(draftFromType(pt))
    setError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setDraft(EMPTY_DRAFT)
  }

  function togglePosition(list: Position[], p: Position): Position[] {
    return list.includes(p) ? list.filter((x) => x !== p) : [...list, p]
  }

  async function handleSave() {
    if (!editingId) return
    setError(null)
    try {
      const { error } = await supabase.from('program_types').update(draftToPatch(draft)).eq('id', editingId)
      if (error) throw error
      cancelEdit()
      await refetchAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存に失敗しました')
    }
  }

  async function handleAdd() {
    if (!newDraft.name.trim()) {
      setError('名称は必須です')
      return
    }
    setError(null)
    try {
      const { error } = await supabase.from('program_types').insert(draftToPatch(newDraft))
      if (error) throw error
      setNewDraft(EMPTY_DRAFT)
      await refetchAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : '追加に失敗しました')
    }
  }

  async function handleDelete(pt: ProgramType) {
    if (!window.confirm(`「${pt.name}」を削除しますか?`)) return
    setError(null)
    try {
      const { error } = await supabase.from('program_types').delete().eq('id', pt.id)
      if (error) throw error
      await refetchAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : '削除に失敗しました')
    }
  }

  function renderForm(d: ProgramTypeDraft, setD: (fn: (d: ProgramTypeDraft) => ProgramTypeDraft) => void, excludeId?: string) {
    return (
      <>
        <td>
          <input placeholder="名称" value={d.name} onChange={(e) => setD((x) => ({ ...x, name: e.target.value }))} />
        </td>
        <td>
          <div className="crud-checkbox-group">
            {POSITIONS.map((p) => (
              <label key={p}>
                <input
                  type="checkbox"
                  checked={d.required_position.includes(p)}
                  onChange={() => setD((x) => ({ ...x, required_position: togglePosition(x.required_position, p) }))}
                />
                {p}
              </label>
            ))}
          </div>
        </td>
        <td>
          <select
            value={d.required_gender}
            onChange={(e) => setD((x) => ({ ...x, required_gender: e.target.value }))}
          >
            <option value="">指定なし</option>
            {GENDERS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </td>
        <td>
          <select
            value={d.required_qualification}
            onChange={(e) => setD((x) => ({ ...x, required_qualification: e.target.value }))}
          >
            <option value="">指定なし</option>
            {QUALIFICATIONS.map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        </td>
        <td>
          <label>
            <input
              type="checkbox"
              checked={d.needs_partner}
              onChange={(e) => setD((x) => ({ ...x, needs_partner: e.target.checked }))}
            />
            ペア必要
          </label>
          <label>
            <input
              type="checkbox"
              checked={d.partner_same_gender}
              onChange={(e) => setD((x) => ({ ...x, partner_same_gender: e.target.checked }))}
            />
            ペアは同性
          </label>
        </td>
        <td>
          <select
            value={d.partner_program_type_id}
            onChange={(e) => setD((x) => ({ ...x, partner_program_type_id: e.target.value }))}
          >
            <option value="">(自分と同じルール)</option>
            {programTypes
              .filter((pt) => pt.id !== excludeId)
              .map((pt) => (
                <option key={pt.id} value={pt.id}>
                  {pt.name}
                </option>
              ))}
          </select>
        </td>
        <td>
          <input
            placeholder="例: 実演"
            value={d.recency_pool}
            onChange={(e) => setD((x) => ({ ...x, recency_pool: e.target.value }))}
          />
        </td>
      </>
    )
  }

  return (
    <div className="page">
      <h1>プログラム種別</h1>
      {error && <p className="error-text">{error}</p>}
      {/* 狭い画面では表を組み替えず、横スクロールで見てもらう */}
      <div className="crud-table-scroll">
        <table className="crud-table">
        <thead>
          <tr>
            <th>名称</th>
            <th>必要な立場</th>
            <th>必要な性別</th>
            <th>必要な特別承認</th>
            <th>ペア</th>
            <th>ペアのルール参照元</th>
            <th>候補プール</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {programTypes.map((pt) =>
            editingId === pt.id ? (
              <tr key={pt.id}>
                {renderForm(draft, setDraft, pt.id)}
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
              <tr key={pt.id}>
                <td>{pt.name}</td>
                <td>{(pt.required_position ?? []).join('、')}</td>
                <td>{pt.required_gender ?? ''}</td>
                <td>{pt.required_qualification ?? ''}</td>
                <td>
                  {pt.needs_partner ? '必要' : '不要'}
                  {pt.needs_partner && pt.partner_same_gender ? '(同性)' : ''}
                </td>
                <td>{programTypes.find((p) => p.id === pt.partner_program_type_id)?.name ?? ''}</td>
                <td>{pt.recency_pool ?? ''}</td>
                <td className="row-actions">
                  <button type="button" onClick={() => startEdit(pt)}>
                    編集
                  </button>
                  <button type="button" onClick={() => handleDelete(pt)}>
                    削除
                  </button>
                </td>
              </tr>
            ),
          )}
          <tr>
            {renderForm(newDraft, setNewDraft)}
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
