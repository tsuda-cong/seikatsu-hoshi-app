import { useMemo, useState } from 'react'

export interface CrudColumn<T> {
  key: keyof T & string
  label: string
  type?: 'text' | 'number'
  placeholder?: string
}

interface SimpleCrudTableProps<T extends { id: string }> {
  items: T[]
  columns: CrudColumn<T>[]
  onAdd: (values: Record<string, string>) => Promise<void>
  onUpdate: (id: string, values: Record<string, string>) => Promise<void>
  onDelete: (item: T) => Promise<void>
  itemLabel: (item: T) => string
  searchPredicate?: (item: T, query: string) => boolean
}

function emptyDraft<T>(columns: CrudColumn<T>[]): Record<string, string> {
  const draft: Record<string, string> = {}
  for (const c of columns) draft[c.key] = ''
  return draft
}

function draftFromItem<T>(item: T, columns: CrudColumn<T>[]): Record<string, string> {
  const draft: Record<string, string> = {}
  for (const c of columns) {
    const v = item[c.key]
    draft[c.key] = v === null || v === undefined ? '' : String(v)
  }
  return draft
}

export function SimpleCrudTable<T extends { id: string }>({
  items,
  columns,
  onAdd,
  onUpdate,
  onDelete,
  itemLabel,
  searchPredicate,
}: SimpleCrudTableProps<T>) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>(emptyDraft(columns))
  const [newDraft, setNewDraft] = useState<Record<string, string>>(emptyDraft(columns))
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const visibleItems = useMemo(() => {
    if (!searchPredicate || !query.trim()) return items
    return items.filter((item) => searchPredicate(item, query.trim()))
  }, [items, query, searchPredicate])

  function startEdit(item: T) {
    setEditingId(item.id)
    setDraft(draftFromItem(item, columns))
    setError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setDraft(emptyDraft(columns))
  }

  async function handleSave() {
    if (!editingId) return
    setError(null)
    try {
      await onUpdate(editingId, draft)
      cancelEdit()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存に失敗しました')
    }
  }

  async function handleAdd() {
    setError(null)
    try {
      await onAdd(newDraft)
      setNewDraft(emptyDraft(columns))
    } catch (e) {
      setError(e instanceof Error ? e.message : '追加に失敗しました')
    }
  }

  async function handleDelete(item: T) {
    if (!window.confirm(`「${itemLabel(item)}」を削除しますか?`)) return
    setError(null)
    try {
      await onDelete(item)
    } catch (e) {
      setError(e instanceof Error ? e.message : '削除に失敗しました')
    }
  }

  return (
    <div>
      {searchPredicate && (
        <input
          className="crud-search"
          type="text"
          placeholder="検索..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      {error && <p className="error-text">{error}</p>}
      {/* 狭い画面では表を組み替えず、横スクロールで見てもらう */}
      <div className="crud-table-scroll">
      <table className="crud-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {visibleItems.map((item) =>
            editingId === item.id ? (
              <tr key={item.id}>
                {columns.map((c) => (
                  <td key={c.key}>
                    <input
                      type={c.type ?? 'text'}
                      value={draft[c.key] ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, [c.key]: e.target.value }))}
                    />
                  </td>
                ))}
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
              <tr key={item.id}>
                {columns.map((c) => (
                  <td key={c.key}>{item[c.key] === null || item[c.key] === undefined ? '' : String(item[c.key])}</td>
                ))}
                <td className="row-actions">
                  <button type="button" onClick={() => startEdit(item)}>
                    編集
                  </button>
                  <button type="button" onClick={() => handleDelete(item)}>
                    削除
                  </button>
                </td>
              </tr>
            ),
          )}
          <tr>
            {columns.map((c) => (
              <td key={c.key}>
                <input
                  type={c.type ?? 'text'}
                  placeholder={c.placeholder ?? c.label}
                  value={newDraft[c.key] ?? ''}
                  onChange={(e) => setNewDraft((d) => ({ ...d, [c.key]: e.target.value }))}
                />
              </td>
            ))}
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
