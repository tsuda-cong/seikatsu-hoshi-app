import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/fetchAll'
import { useAppData } from '../context/AppDataContext'
import { parseAssignmentTsv, type ParseResult } from '../lib/importHistory'

/**
 * 過去の割当一覧(Excel)を取り込むための画面。一度きりの作業なのでナビには出さず、
 * URLを直接開いて使う(/#/import-history)。
 *
 * ファイルではなく貼り付けにしているのは、リポジトリが公開されているため、
 * 実名を含むデータをファイルとして置きたくないから。
 */

/** この年以降は既に手入力済みなので取り込まない */
const IMPORT_BEFORE_YEAR = 2026

export function ImportHistoryPage() {
  const { members, programTypes, songs, teachingPoints, loading, refetchAll } = useAppData()

  const [tsv, setTsv] = useState('')
  const [result, setResult] = useState<ParseResult | null>(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const parseOptions = useMemo(
    () => ({ members, programTypes, songs, teachingPoints, beforeYear: IMPORT_BEFORE_YEAR }),
    [members, programTypes, songs, teachingPoints],
  )

  function handleCheck() {
    setError(null)
    setLog([])
    try {
      setResult(parseAssignmentTsv(tsv, parseOptions))
    } catch (e) {
      setError(e instanceof Error ? e.message : '読み取りに失敗しました')
    }
  }

  async function handleImport() {
    const parsed = result ?? parseAssignmentTsv(tsv, parseOptions)
    if (parsed.weeks.length === 0) {
      setError('取り込む週がありません。先に「確認する」を押してください。')
      return
    }
    if (!window.confirm(`${parsed.weeks.length}週 / ${parsed.stats.rows}件を取り込みます。よろしいですか?`)) {
      return
    }

    setImporting(true)
    setError(null)
    const messages: string[] = []

    try {
      // 既にプログラムがある週は丸ごと飛ばす。二重取り込みを防ぐ唯一の歯止め
      const existing = await fetchAllRows<{ date: string }>(() =>
        supabase.from('programs').select('date').order('date', { ascending: true }),
      )
      const existingDates = new Set(existing.map((r) => r.date))

      let imported = 0
      let skipped = 0
      setProgress({ done: 0, total: parsed.weeks.length })

      for (const [index, week] of parsed.weeks.entries()) {
        if (existingDates.has(week.date)) {
          skipped += 1
          messages.push(`${week.date}: 既にプログラムがあるため飛ばしました`)
          setProgress({ done: index + 1, total: parsed.weeks.length })
          continue
        }

        const { data: created, error: programError } = await supabase
          .from('programs')
          .insert(
            week.programs.map((p, i) => ({
              date: week.date,
              order_no: i + 1,
              section: p.section,
              program_type_id: p.programTypeId,
              title: p.title,
              material: p.material,
              content: p.content,
              duration_minutes: p.durationMinutes,
              song_id: p.songId,
              teaching_point_id: p.teachingPointId,
            })),
          )
          .select()
        if (programError) throw programError

        // insertした順にそのまま返るので、order_noで元の行に対応づける
        const createdByOrder = new Map((created ?? []).map((row) => [row.order_no, row.id]))
        const assignmentRows = week.programs
          .map((p, i) => ({ p, id: createdByOrder.get(i + 1) }))
          .filter(({ p, id }) => !!id && (p.memberId || p.partnerId))
          .map(({ p, id }) => ({ program_id: id as string, member_id: p.memberId, partner_id: p.partnerId }))

        if (assignmentRows.length > 0) {
          const { error: assignmentError } = await supabase.from('assignments').insert(assignmentRows)
          if (assignmentError) throw assignmentError
        }

        imported += 1
        setProgress({ done: index + 1, total: parsed.weeks.length })
      }

      messages.unshift(`取り込み完了: ${imported}週を追加、${skipped}週を飛ばしました`)
      await refetchAll()
    } catch (e) {
      messages.unshift(`途中で失敗しました: ${e instanceof Error ? e.message : String(e)}`)
      messages.push('成功した週はそのまま残っています。原因を直して、もう一度実行してください(済んだ週は自動で飛ばされます)。')
      setError(e instanceof Error ? e.message : '取り込みに失敗しました')
    } finally {
      setLog(messages)
      setImporting(false)
    }
  }

  if (loading) return <div className="center-message">読み込み中...</div>

  return (
    <div className="page">
      <h1>過去データの取り込み</h1>
      <p className="history-note">
        Excel「割当一覧」の範囲をコピーして、下に貼り付けてください。列は
        「日付／タイプ／時間／資料／内容／課題／歌／生徒／相手／セクション」の順です。
        <strong>{IMPORT_BEFORE_YEAR}年以降の行は取り込みません</strong>(既に入力済みのため)。
        既にプログラムがある週も飛ばすので、同じものを二度貼っても増えません。
      </p>

      {error && <p className="error-text">{error}</p>}

      <textarea
        className="paste-import-textarea"
        rows={10}
        placeholder={'日付\tタイプ\t時間\t資料\t内容\t課題\t歌\t生徒\t相手\tセクション'}
        value={tsv}
        onChange={(e) => setTsv(e.target.value)}
      />

      <div className="import-actions">
        <button type="button" onClick={handleCheck} disabled={!tsv.trim() || importing}>
          確認する(書き込みません)
        </button>
        <button
          type="button"
          className="manage-toggle"
          onClick={handleImport}
          disabled={!result || result.weeks.length === 0 || importing}
        >
          {importing ? '取り込み中...' : '取り込む'}
        </button>
        {progress && (
          <span className="import-progress">
            {progress.done} / {progress.total} 週
          </span>
        )}
      </div>

      {log.length > 0 && (
        <section className="history-section">
          <h2>結果</h2>
          <ul className="import-list">
            {log.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </section>
      )}

      {result && (
        <>
          <section className="history-section">
            <h2>確認</h2>
            <div className="history-cards">
              <div className="history-card">
                <div className="history-card-label">取り込む週</div>
                <div className="history-card-value">{result.stats.weeks}週</div>
              </div>
              <div className="history-card">
                <div className="history-card-label">プログラム</div>
                <div className="history-card-value">{result.stats.rows}件</div>
              </div>
              <div className="history-card">
                <div className="history-card-label">担当者が付く</div>
                <div className="history-card-value">{result.stats.withMember}件</div>
              </div>
              <div className="history-card">
                <div className="history-card-label">ペアが付く</div>
                <div className="history-card-value">{result.stats.withPartner}件</div>
              </div>
            </div>
            {result.weeks.length > 0 && (
              <p className="history-note">
                期間: {result.weeks[0].date} 〜 {result.weeks[result.weeks.length - 1].date}
                （対象外として飛ばした行: {result.stats.skippedRows}件）
              </p>
            )}
          </section>

          <section className="history-section">
            <h2>種別の対応</h2>
            <p className="history-note">
              Excelの「タイプ」を、現在の種別にどう割り当てるかの一覧です。
              <strong>「解決できず」が無いことを確認してから取り込んでください。</strong>
            </p>
            <table className="history-table">
              <thead>
                <tr>
                  <th>Excelのタイプ</th>
                  <th className="history-num">件数</th>
                  <th>割り当て先</th>
                  <th>判定</th>
                </tr>
              </thead>
              <tbody>
                {result.typeMapping.map((m) => (
                  <tr key={m.rawType} className={m.via === '解決できず' ? 'import-unresolved' : ''}>
                    <td data-label="タイプ">{m.rawType}</td>
                    <td data-label="件数" className="history-num">
                      {m.count}
                    </td>
                    <td data-label="割り当て先">{m.resolvedTypeName ?? '(種別なし)'}</td>
                    <td data-label="判定">{m.via}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {result.warnings.length > 0 && (
            <section className="history-section">
              <h2>警告 ({result.warnings.length}件)</h2>
              <ul className="import-list">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}
