import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAppData } from '../context/AppDataContext'
import { RowActionsMenu } from '../components/RowActionsMenu'
import {
  GENDERS,
  MEMBER_STATUSES,
  POSITIONS,
  QUALIFICATIONS,
  type Member,
  type ProgramType,
  type Qualification,
} from '../types/domain'

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

/**
 * 性別と立場だけで見て、そもそも担当しうる種別かどうか。
 * candidates.ts の getEligibleCandidates と同じ条件のうち、
 * 特別承認(required_qualification)と個別除外は外してある
 * — 特別承認はこの画面でこれから決めるものなので、条件に使うと堂々巡りになる
 */
function canEverBeAssigned(pt: ProgramType, gender: string, position: string): boolean {
  const requiredPositions = pt.required_position ?? []
  if (requiredPositions.length > 0 && !requiredPositions.some((p) => p === position)) return false
  if (pt.required_gender && pt.required_gender !== gender) return false
  return true
}

function kanaOf(m: Member): string {
  return [m.last_name_kana, m.first_name_kana].filter(Boolean).join(' ')
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value]
}

/** 名前とフリガナだけの見出し。カードを開く操作もここが受ける */
function MemberCardHead({
  member,
  expanded,
  onToggle,
  onEdit,
  onDelete,
}: {
  member: Member
  expanded: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="member-card-head">
      {/* ⋮ をボタンの外に置くことで、メニューを押したときに開閉しないようにする */}
      <button type="button" className="member-card-toggle" aria-expanded={expanded} onClick={onToggle}>
        <span className="member-name">
          {member.last_name} {member.first_name}
        </span>
        <span className="member-kana">{kanaOf(member)}</span>
      </button>
      <RowActionsMenu onEdit={onEdit} onDelete={onDelete} />
    </div>
  )
}

export function MembersPage() {
  const { members, programTypes, refetchAll } = useAppData()
  const [query, setQuery] = useState('')
  const [genderFilter, setGenderFilter] = useState('')
  const [positionFilter, setPositionFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<MemberDraft>(EMPTY_DRAFT)
  const [adding, setAdding] = useState(false)
  const [newDraft, setNewDraft] = useState<MemberDraft>(EMPTY_DRAFT)
  const [error, setError] = useState<string | null>(null)
  // 編集フォームを閉じたあと、そのカードを「押したボタンがあった高さ」へ持ってくるための控え。
  // フォームは画面より高く、保存・取消はその下端にある。押した時点では編集していたカードは
  // 画面の外にあり、そのまま閉じると無関係な場所が目の前に出てしまう。
  // 視線はクリックした指やポインターの所にあるので、そこに名前が来るのが一番見失わない
  // (画面の中央や編集前の位置に戻すと、目を動かして探し直すことになる)。
  // 保存では一覧を取り直して並び順が変わりうるので、スクロール量ではなくカードの位置を基準にする
  const [scrollBack, setScrollBack] = useState<{ id: string; viewportTop: number } | null>(null)

  const typeNameById = useMemo(() => new Map(programTypes.map((pt) => [pt.id, pt.name])), [programTypes])

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
    setExpandedId(null)
    setAdding(false)
    setDraft(draftFromMember(member))
    setError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setDraft(EMPTY_DRAFT)
  }

  // 保存・取消を押した瞬間に、そのボタンが画面のどの高さにあったかを控える
  function rememberScrollBack(id: string, button: HTMLElement) {
    setScrollBack({ id, viewportTop: button.getBoundingClientRect().top })
  }

  // フォームを閉じてカードが並び直したあとに、控えておいた位置へ戻す。
  // 保存時は一覧の取り直しを待つ必要があるので members も依存に入れている
  useEffect(() => {
    if (!scrollBack || editingId !== null) return
    setScrollBack(null)
    const el = document.querySelector(`[data-member-id="${scrollBack.id}"]`)
    if (!el) return
    // ずれた分だけ動かす(一覧の末尾付近では、それ以上スクロールできず多少ずれることがある)
    window.scrollBy(0, el.getBoundingClientRect().top - scrollBack.viewportTop)
  }, [scrollBack, editingId, members])

  function handleToggleExpand(member: Member) {
    if (editingId === member.id) return
    setExpandedId((id) => (id === member.id ? null : member.id))
  }

  async function handleSave() {
    if (!editingId) return
    if (!draft.last_name.trim() || !draft.first_name.trim()) {
      setError('姓と名は必須です')
      return
    }
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
      setAdding(false)
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

  /** 展開したときに出す、読み取り専用の詳細 */
  function renderDetail(member: Member) {
    const qualifications = member.qualifications ?? []
    const excluded = (member.excluded_program_type_ids ?? [])
      .map((id) => typeNameById.get(id))
      .filter((name): name is string => !!name)

    return (
      <div className="member-card-panel">
        <dl className="member-facts">
          <div>
            <dt>性別</dt>
            <dd>{member.gender}</dd>
          </div>
          <div>
            <dt>立場</dt>
            <dd>{member.position}</dd>
          </div>
          <div>
            <dt>状況</dt>
            <dd>{member.status}</dd>
          </div>
        </dl>
        <div className="member-tag-block">
          <span className="member-tag-label">特別承認</span>
          {qualifications.length > 0 ? (
            <div className="member-tags">
              {qualifications.map((q) => (
                <span key={q} className="member-tag">
                  {q}
                </span>
              ))}
            </div>
          ) : (
            <p className="member-tag-empty">なし</p>
          )}
        </div>
        <div className="member-tag-block">
          <span className="member-tag-label">担当させない種別</span>
          {excluded.length > 0 ? (
            <div className="member-tags">
              {excluded.map((name) => (
                <span key={name} className="member-tag">
                  {name}
                </span>
              ))}
            </div>
          ) : (
            <p className="member-tag-empty">なし</p>
          )}
        </div>
      </div>
    )
  }

  /** 追加と編集で共通の入力欄 */
  function renderForm(value: MemberDraft, onChange: (next: MemberDraft) => void) {
    // 選んだ性別・立場では担当しえない項目まで並べると、探すのに時間がかかり見落としも出る。
    // ただし既にチェックが付いているものは、条件から外れても隠さない
    // (見えないまま値だけ残るのを防ぐため。外したいときは自分で外せる)
    const assignableTypes = programTypes.filter(
      (pt) =>
        canEverBeAssigned(pt, value.gender, value.position) || value.excluded_program_type_ids.includes(pt.id),
    )
    const availableQualifications = QUALIFICATIONS.filter((q) => {
      if (value.qualifications.includes(q)) return true
      const requiredBy = programTypes.filter((pt) => pt.required_qualification === q)
      // どの種別からも求められていない承認は、判断する材料が無いのでそのまま出す
      if (requiredBy.length === 0) return true
      return requiredBy.some((pt) => canEverBeAssigned(pt, value.gender, value.position))
    })

    return (
      <>
        <div className="member-form-grid">
          <label>
            姓
            <input value={value.last_name} onChange={(e) => onChange({ ...value, last_name: e.target.value })} />
          </label>
          <label>
            名
            <input value={value.first_name} onChange={(e) => onChange({ ...value, first_name: e.target.value })} />
          </label>
          <label>
            姓カナ
            <input
              value={value.last_name_kana}
              onChange={(e) => onChange({ ...value, last_name_kana: e.target.value })}
            />
          </label>
          <label>
            名カナ
            <input
              value={value.first_name_kana}
              onChange={(e) => onChange({ ...value, first_name_kana: e.target.value })}
            />
          </label>
          <label>
            性別
            <select value={value.gender} onChange={(e) => onChange({ ...value, gender: e.target.value })}>
              {GENDERS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <label>
            立場
            <select value={value.position} onChange={(e) => onChange({ ...value, position: e.target.value })}>
              {POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label>
            状況
            <select value={value.status} onChange={(e) => onChange({ ...value, status: e.target.value })}>
              {MEMBER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset className="member-checks">
          <legend>特別承認</legend>
          {availableQualifications.length === 0 && (
            <p className="member-checks-empty">この性別・立場で該当するものはありません</p>
          )}
          {availableQualifications.map((q) => (
            <label key={q}>
              <input
                type="checkbox"
                checked={value.qualifications.includes(q)}
                onChange={() => onChange({ ...value, qualifications: toggle(value.qualifications, q) })}
              />
              {q}
            </label>
          ))}
        </fieldset>
        <fieldset className="member-checks">
          <legend>担当させない種別</legend>
          <p className="member-checks-empty">性別・立場から担当しえないものは出していません</p>
          {assignableTypes.map((pt) => (
            <label key={pt.id}>
              <input
                type="checkbox"
                checked={value.excluded_program_type_ids.includes(pt.id)}
                onChange={() =>
                  onChange({ ...value, excluded_program_type_ids: toggle(value.excluded_program_type_ids, pt.id) })
                }
              />
              {pt.name}
            </label>
          ))}
        </fieldset>
      </>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>名簿</h1>
        <button
          type="button"
          onClick={() => {
            setAdding((v) => !v)
            setEditingId(null)
            setError(null)
          }}
        >
          {adding ? '取消' : '+ 新規追加'}
        </button>
      </div>

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

      {adding && (
        <div className="member-form-card">
          <h2 className="member-form-title">新しく追加</h2>
          {renderForm(newDraft, setNewDraft)}
          <div className="member-form-actions">
            <button type="button" className="primary" onClick={handleAdd}>
              追加
            </button>
            <button type="button" onClick={() => setAdding(false)}>
              取消
            </button>
          </div>
        </div>
      )}

      <div className="member-grid">
        {visibleMembers.map((member) => {
          const expanded = expandedId === member.id
          const editing = editingId === member.id
          return (
            // 開いた内容はカードに重ねて出す。行を押し広げないので、下に続く一覧が
            // 上下に動かない(見比べながら次々に開けるようにするため)
            <div
              key={member.id}
              className={`member-card${expanded || editing ? ' is-open' : ''}`}
              data-member-id={member.id}
            >
              <MemberCardHead
                member={member}
                expanded={expanded}
                onToggle={() => handleToggleExpand(member)}
                onEdit={() => startEdit(member)}
                onDelete={() => handleDelete(member)}
              />
              {expanded && !editing && renderDetail(member)}
              {editing && (
                <div className="member-card-panel is-edit">
                  {renderForm(draft, setDraft)}
                  <div className="member-form-actions">
                    <button
                      type="button"
                      className="primary"
                      onClick={(e) => {
                        rememberScrollBack(member.id, e.currentTarget)
                        handleSave()
                      }}
                    >
                      保存
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        rememberScrollBack(member.id, e.currentTarget)
                        cancelEdit()
                      }}
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {visibleMembers.length === 0 && <p className="reports-hint">該当する人がいません。</p>}
      </div>
    </div>
  )
}
