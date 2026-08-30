import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAppData } from '../context/AppDataContext'
import { useAuth } from '../context/AuthContext'
import { buildProgramCsv, downloadCsv } from '../lib/csvExport'
import { currentMonthString, endOfNextMonthString, todayString } from '../lib/localDate'

// 帳票を開くと画面が切り替わってこのページは作り直されるため、選んだ期間を覚えておく。
// 続けて別の帳票を出すときに同じ期間であることがほとんどなので、選び直さずに済むようにする。
// sessionStorageなので、アプリを起動し直せば通常どおり初期値(今日〜翌月末・今月)に戻る。
const RANGE_KEY = 'reports.range'

function savedRange(): { from?: string; to?: string; month?: string } {
  try {
    return JSON.parse(sessionStorage.getItem(RANGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

// adminOnly の帳票は閲覧者には出さない(App.tsx側でもルートを塞いである)
const OTHER_REPORTS = [
  { key: 'assignments', label: '割当予定表' },
  { key: 'chairman', label: '司会進行用紙' },
  { key: 'counselor', label: '助言者用紙' },
  { key: 'slips', label: 'スリップ(一括)', adminOnly: true },
]

export function ReportsPage() {
  const { settings, teachingPoints, refetchAll } = useAppData()
  const { isAdmin } = useAuth()
  const [from, setFrom] = useState(() => savedRange().from ?? todayString())
  const [to, setTo] = useState(() => savedRange().to ?? endOfNextMonthString())
  const [scheduleMonth, setScheduleMonth] = useState(() => savedRange().month ?? currentMonthString())
  const [memo, setMemo] = useState(settings.reports_memo ?? '')
  const [savingMemo, setSavingMemo] = useState(false)
  const [memoError, setMemoError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  useEffect(() => {
    sessionStorage.setItem(RANGE_KEY, JSON.stringify({ from, to, month: scheduleMonth }))
  }, [from, to, scheduleMonth])

  async function handleExportCsv() {
    setExporting(true)
    setExportError(null)
    try {
      const csv = await buildProgramCsv(from, to, teachingPoints)
      downloadCsv(`生活と奉仕_${from}_${to}.csv`, csv)
    } catch (e) {
      setExportError(e instanceof Error ? e.message : '書き出しに失敗しました')
    } finally {
      setExporting(false)
    }
  }

  async function handleSaveMemo() {
    setSavingMemo(true)
    setMemoError(null)
    try {
      const { error } = await supabase.from('settings').upsert({ key: 'reports_memo', value: memo })
      if (error) throw error
      await refetchAll()
    } catch (e) {
      setMemoError(e instanceof Error ? e.message : '保存に失敗しました')
    } finally {
      setSavingMemo(false)
    }
  }

  return (
    <div className="page">
      <h1>帳票印刷</h1>
      <div className="reports-layout">
        <div className="reports-main">
          <p className="reports-hint">
            期間を指定して、各帳票を開きます。開いた画面の「印刷 / PDFに保存」からPDF化でき、「← 戻る」でこの画面に戻れます。
          </p>
          <div className="reports-range">
            <label>
              開始日
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label>
              終了日
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>

          {/*
            ホーム画面に追加(PWA)して使うとき、新しいタブで開くとアプリがもう1つ立ち上がった
            ように見えてしまう。同じ画面のまま遷移し、印刷画面の「← 戻る」で戻ってもらう
          */}
          <ul className="reports-list">
            <li className="reports-list-schedule">
              <Link to={`/print/schedule/${from}/${to}/${scheduleMonth}`}>集会予定表</Link>
              <label className="reports-month-label">
                表示する月
                <input
                  type="month"
                  value={scheduleMonth}
                  onChange={(e) => setScheduleMonth(e.target.value)}
                />
              </label>
            </li>
            {OTHER_REPORTS.filter((r) => isAdmin || !r.adminOnly).map((r) => (
              <li key={r.key}>
                <Link to={`/print/${r.key}/${from}/${to}`}>{r.label}</Link>
              </li>
            ))}
          </ul>

          <div className="reports-export">
            <button type="button" onClick={handleExportCsv} disabled={exporting}>
              {exporting ? '書き出し中...' : 'CSVで書き出す'}
            </button>
            {exportError && <p className="error-text">{exportError}</p>}
          </div>
        </div>

        {/* メモは管理者自身の覚書なので、閲覧者には出さない */}
        {isAdmin && (
        <div className="reports-memo">
          <h2>メモ</h2>
          <textarea
            className="reports-memo-textarea"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="例: 8/20週分まで予定表・進行表を共有済み"
          />
          {memoError && <p className="error-text">{memoError}</p>}
          <button type="button" onClick={handleSaveMemo} disabled={savingMemo}>
            {savingMemo ? '保存中...' : '保存'}
          </button>
        </div>
        )}
      </div>
    </div>
  )
}
