import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAppData } from '../context/AppDataContext'
import { memberDisplayName } from '../lib/candidates'
import { addDays, formatTalkDate, nextEntryDate, talkSpeakers } from '../lib/talkDates'
import { todayString } from '../lib/localDate'
import type { Member } from '../types/domain'

/**
 * 講演(週末の集会)の担当日を入れるページ。管理者だけが使う。
 *
 * 入力は講演の予定表を上から順に拾っていく流れ(「この日はだれ、次の日はだれ」)なので、
 * 人ではなく日付を軸にしてある。名前を押すと登録してそのまま次の週へ進むので、
 * 続けて押していくだけで入力が終わる。同じ日に複数の講演者がいる週のために、
 * 直後だけ「同じ日にもう1人」で日付を戻せるようにしてある。
 *
 * 用途は「週日の集会の担当と同じ週に当たらないか」を見るためだけなので、
 * 過ぎた日付はページを開いたときに消している(いつまで入力済みかが見やすくなる)。
 */
export function TalksPage() {
  const { members, talkDates, refetchTalkDates, loading } = useAppData()
  const [date, setDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // 直前に登録した1件。「同じ日にもう1人」で日付を戻すために覚えておく
  const [lastAdded, setLastAdded] = useState<{ date: string; member: Member } | null>(null)
  const [saving, setSaving] = useState(false)
  const purgedRef = useRef(false)
  const dateInitializedRef = useRef(false)

  // 過ぎた日付を消す。ページを開くたびに一度だけ
  useEffect(() => {
    if (purgedRef.current) return
    purgedRef.current = true
    async function purgePast() {
      const { error } = await supabase.from('talk_dates').delete().lt('date', todayString())
      if (!error) await refetchTalkDates()
    }
    purgePast()
  }, [refetchTalkDates])

  // 入力欄の初期値は、読み込みが終わってから一度だけ入れる。
  // useState の初期値として取ると読み込み前の空のデータで決まってしまい、
  // かといって「空なら入れ直す」にすると、日付を消して打ち直している最中に書き換わってしまう
  useEffect(() => {
    if (loading || dateInitializedRef.current) return
    dateInitializedRef.current = true
    setDate(nextEntryDate(talkDates))
  }, [loading, talkDates])

  const speakers = useMemo(() => talkSpeakers(members, talkDates), [members, talkDates])
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])

  // 日付ごとにまとめた一覧。講演の予定表と同じ並びで見比べられるようにする
  const byDate = useMemo(() => {
    const map = new Map<string, Member[]>()
    for (const t of talkDates) {
      const member = memberById.get(t.member_id)
      if (!member) continue
      const list = map.get(t.date)
      if (list) list.push(member)
      else map.set(t.date, [member])
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
  }, [talkDates, memberById])

  const lastDate = byDate.length > 0 ? byDate[byDate.length - 1][0] : null

  /** 今表示している日付に登録済みの人(名前の一覧に印を付けるため) */
  const registeredToday = useMemo(
    () => new Set(talkDates.filter((t) => t.date === date).map((t) => t.member_id)),
    [talkDates, date],
  )

  // 日付は直接入力せずカレンダーから選ぶ使い方なので、欄のどこを押しても開くようにする
  function openDatePicker(e: MouseEvent<HTMLInputElement>) {
    const el = e.currentTarget
    if (typeof el.showPicker !== 'function') return
    try {
      el.showPicker()
    } catch {
      // 開けないブラウザでは標準どおりアイコンから開いてもらう
    }
  }

  async function handleAdd(member: Member) {
    if (!date || saving) return
    setError(null)
    if (registeredToday.has(member.id)) {
      setNotice(`${formatTalkDate(date)} ${member.last_name} ${member.first_name} はすでに登録されています`)
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.from('talk_dates').insert({ member_id: member.id, date })
      if (error) throw error
      setLastAdded({ date, member })
      setNotice(null)
      // 続けて次の週を入れられるよう、日付を1週間進めておく
      setDate(addDays(date, 7))
      await refetchTalkDates()
    } catch (e) {
      setError(e instanceof Error ? e.message : '登録に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(dateStr: string, member: Member) {
    if (!window.confirm(`${formatTalkDate(dateStr)} の「${member.last_name} ${member.first_name}」を削除しますか?`)) {
      return
    }
    setError(null)
    try {
      const { error } = await supabase.from('talk_dates').delete().eq('member_id', member.id).eq('date', dateStr)
      if (error) throw error
      await refetchTalkDates()
    } catch (e) {
      setError(e instanceof Error ? e.message : '削除に失敗しました')
    }
  }

  return (
    <div className="page">
      <h1>講演日付</h1>
      <p className="reports-hint">
        週日の集会の担当と同じ週に重ならないかを見るためのものです。過ぎた日付は自動で消えます。
      </p>

      <div className="talk-entry">
        <div className="talk-entry-date">
          <label>
            日付
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} onClick={openDatePicker} />
          </label>
          {date && <span className="talk-entry-weekday">{formatTalkDate(date)}</span>}
          <button type="button" onClick={() => date && setDate(addDays(date, -7))} disabled={!date}>
            〈 前の週
          </button>
          <button type="button" onClick={() => date && setDate(addDays(date, 7))} disabled={!date}>
            次の週 〉
          </button>
        </div>

        <p className="talk-entry-label">だれが講演しますか</p>
        <div className="talk-speaker-buttons">
          {speakers.map((m) => (
            <button
              key={m.id}
              type="button"
              className={registeredToday.has(m.id) ? 'talk-speaker is-registered' : 'talk-speaker'}
              onClick={() => handleAdd(m)}
              disabled={saving || !date}
            >
              {registeredToday.has(m.id) && <span className="talk-speaker-check">✓</span>}
              {m.last_name} {m.first_name}
            </button>
          ))}
          {speakers.length === 0 && (
            <p className="talk-empty">
              名簿で特別承認の「講演」にチェックが付いている人がいません(男性の長老・援助奉仕者に出ます)。
            </p>
          )}
        </div>

        {lastAdded && (
          <p className="talk-added">
            {formatTalkDate(lastAdded.date)} {memberDisplayName(lastAdded.member)} を登録しました
            {date !== lastAdded.date && (
              <>
                {' ・ '}
                <button type="button" className="link-button" onClick={() => setDate(lastAdded.date)}>
                  同じ日にもう1人
                </button>
              </>
            )}
          </p>
        )}
        {notice && <p className="talk-notice">{notice}</p>}
        {error && <p className="error-text">{error}</p>}
      </div>

      <h2 className="talk-list-heading">
        登録済み
        <span className="talk-list-count">
          {talkDates.length}件{lastDate && ` ・ ${formatTalkDate(lastDate)}まで`}
        </span>
      </h2>
      <ul className="talk-list">
        {byDate.map(([dateStr, list]) => (
          <li key={dateStr}>
            <span className="talk-list-date">{formatTalkDate(dateStr)}</span>
            <span className="talk-list-names">
              {list.map((m) => (
                <span key={m.id} className="talk-list-name">
                  {m.last_name} {m.first_name}
                  <button
                    type="button"
                    className="talk-list-remove"
                    aria-label={`${formatTalkDate(dateStr)} の ${m.last_name} ${m.first_name} を削除`}
                    onClick={() => handleDelete(dateStr, m)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </span>
          </li>
        ))}
        {byDate.length === 0 && <li className="talk-empty">まだ登録されていません。</li>}
      </ul>
    </div>
  )
}
