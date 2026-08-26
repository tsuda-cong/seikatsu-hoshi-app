import { useMemo, useState } from 'react'
import { useAppData } from '../context/AppDataContext'
import { memberDisplayName } from '../lib/candidates'
import { todayString } from '../lib/localDate'
import { hasSectionBand, sectionColor, sectionTextColor } from '../lib/printData'
import {
  buildMemberTimeline,
  buildNeverAssignedPools,
  buildPairSummaries,
  buildPoolAverageCycles,
  buildTypeSummaries,
  formatCycle,
  formatCycleDelta,
  formatDate,
  formatRelativeWeeks,
  type AssignmentRole,
  type HistoryEntry,
  type PairSummary,
  type TypeSummary,
} from '../lib/memberHistory'
import type { Member } from '../types/domain'

const SELECTED_MEMBER_KEY = 'memberHistory.selectedMemberId'

function memberSortKey(member: Member): string {
  return `${member.last_name_kana ?? member.last_name}${member.first_name_kana ?? member.first_name}`
}

/**
 * 日付と「◯週間前」をひとまとまりで出す。狭い画面ではセルがグリッドになるため、
 * 一つの要素にまとめないと相対表示が次の行に落ちてしまう。
 */
function DateWithRelative({ date, today, future }: { date: string; today: string; future?: boolean }) {
  return (
    <span className={future ? 'history-datecell history-future-date' : 'history-datecell'}>
      <span className="history-date">{formatDate(date)}</span>
      <span className="history-relative">{formatRelativeWeeks(date, today)}</span>
    </span>
  )
}

export function MemberHistoryPage() {
  const { members, programTypes, teachingPoints, historyRows, loading, error } = useAppData()

  const [selectedId, setSelectedId] = useState<string>(
    () => sessionStorage.getItem(SELECTED_MEMBER_KEY) ?? '',
  )

  function selectMember(id: string) {
    setSelectedId(id)
    if (id) sessionStorage.setItem(SELECTED_MEMBER_KEY, id)
    else sessionStorage.removeItem(SELECTED_MEMBER_KEY)
  }

  const today = todayString()

  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => memberSortKey(a).localeCompare(memberSortKey(b), 'ja')),
    [members],
  )

  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const teachingPointsById = useMemo(() => new Map(teachingPoints.map((t) => [t.id, t])), [teachingPoints])

  const member = selectedId ? (membersById.get(selectedId) ?? null) : null

  const entries = useMemo(
    () => (member ? buildMemberTimeline(historyRows, member.id) : []),
    [historyRows, member],
  )

  const asMemberSummaries = useMemo(
    () => buildTypeSummaries(entries, 'member', programTypes, today),
    [entries, programTypes, today],
  )
  const asPartnerSummaries = useMemo(
    () => buildTypeSummaries(entries, 'partner', programTypes, today),
    [entries, programTypes, today],
  )
  // 全体平均は選んだ人に依らないので、名簿全体の履歴から一度だけ求める
  const poolAveragesAsMember = useMemo(
    () => buildPoolAverageCycles(historyRows, 'member', programTypes),
    [historyRows, programTypes],
  )
  const poolAveragesAsPartner = useMemo(
    () => buildPoolAverageCycles(historyRows, 'partner', programTypes),
    [historyRows, programTypes],
  )

  const neverAssigned = useMemo(
    () => (member ? buildNeverAssignedPools(member, entries, programTypes) : []),
    [member, entries, programTypes],
  )

  const pairsAsMember = useMemo(() => buildPairSummaries(entries, 'member'), [entries])
  const pairsAsPartner = useMemo(() => buildPairSummaries(entries, 'partner'), [entries])

  const pastEntries = entries.filter((e) => e.date <= today)
  const futureEntries = entries.filter((e) => e.date > today).reverse()
  const memberCount = entries.filter((e) => e.role === 'member').length
  const partnerCount = entries.filter((e) => e.role === 'partner').length

  function nameOf(id: string | null): string {
    if (!id) return ''
    const m = membersById.get(id)
    return m ? memberDisplayName(m) : '(名簿にない人)'
  }

  if (loading) return <div className="center-message">読み込み中...</div>

  return (
    <div className="page">
      <h1>担当履歴</h1>
      {error && <p className="error-text">{error}</p>}

      <div className="history-picker">
        <label htmlFor="history-member">名前:</label>
        <select id="history-member" value={selectedId} onChange={(e) => selectMember(e.target.value)}>
          <option value="">選んでください</option>
          {sortedMembers.map((m) => (
            <option key={m.id} value={m.id}>
              {memberDisplayName(m)}
              {m.status !== '現役' ? `(${m.status})` : ''}
            </option>
          ))}
        </select>
      </div>

      {!member ? (
        <p className="history-empty">名前を選ぶと、その人の担当履歴を表示します。</p>
      ) : entries.length === 0 ? (
        <p className="history-empty">{memberDisplayName(member)}の担当記録はまだありません。</p>
      ) : (
        <>
          <ProfileBlock
            member={member}
            memberCount={memberCount}
            partnerCount={partnerCount}
            lastEntry={pastEntries[0] ?? null}
            futureEntries={futureEntries}
            neverAssigned={neverAssigned}
            programTypeNameById={programTypes}
            today={today}
          />

          <section className="history-section">
            <h2>種別ごと</h2>
            <p className="history-note">
              候補選択と同じまとめ方です(実演・話などは種別が分かれていても一つとして数えます)。
              平均サイクルは担当日の間隔の平均で、2回以上ある場合のみ出ます。全体平均は、その種別を
              担当した人それぞれの平均サイクルをならしたものです。
            </p>
            <div className="history-two-col">
              <TypeSummaryTable
                title="担当者として"
                summaries={asMemberSummaries}
                poolAverages={poolAveragesAsMember}
                today={today}
              />
              <TypeSummaryTable
                title="ペアとして"
                summaries={asPartnerSummaries}
                poolAverages={poolAveragesAsPartner}
                today={today}
              />
            </div>
          </section>

          <section className="history-section">
            <h2>ペアの履歴</h2>
            <p className="history-note">課題付き(実演形式)のプログラムのみ。担当者側とペア側は分けて数えます。</p>
            <div className="history-two-col">
              <PairTable
                title="担当者として組んだ相手"
                pairs={pairsAsMember}
                nameOf={nameOf}
                today={today}
              />
              <PairTable
                title="ペアで入ったときの担当者"
                pairs={pairsAsPartner}
                nameOf={nameOf}
                today={today}
              />
            </div>
          </section>

          <section className="history-section">
            <h2>時系列</h2>
            <table className="history-table">
              <colgroup>
                <col className="history-col-date" />
                <col className="history-col-section" />
                <col />
                <col className="history-col-role" />
                <col className="history-col-name" />
                <col className="history-col-point" />
              </colgroup>
              <thead>
                <tr>
                  <th>日付</th>
                  <th>区分</th>
                  <th>プログラム</th>
                  <th>役割</th>
                  <th>相手</th>
                  <th>課題</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => {
                  const teachingPoint = e.teachingPointId ? teachingPointsById.get(e.teachingPointId) : undefined
                  const isFuture = e.date > today
                  return (
                    <tr key={`${e.date}-${e.programLabel}-${i}`} className={isFuture ? 'history-future' : ''}>
                      <td data-label="日付">
                        <DateWithRelative date={e.date} today={today} />
                      </td>
                      <td data-label="区分">
                        {e.section && hasSectionBand(e.section) ? (
                          <span
                            className="history-section-tag"
                            style={{ background: sectionColor(e.section), color: sectionTextColor(e.section) }}
                          >
                            {e.section}
                          </span>
                        ) : (
                          (e.section ?? '')
                        )}
                      </td>
                      <td data-label="プログラム">{e.programLabel}</td>
                      <td data-label="役割">
                        <span className={e.role === 'member' ? 'history-role-main' : 'history-role-partner'}>
                          {e.role === 'member' ? '担当' : 'ペア'}
                        </span>
                      </td>
                      <td data-label="相手">{nameOf(e.counterpartId)}</td>
                      <td data-label="課題">
                        {teachingPoint ? `${teachingPoint.code} ${teachingPoint.title}` : ''}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  )
}

function ProfileBlock({
  member,
  memberCount,
  partnerCount,
  lastEntry,
  futureEntries,
  neverAssigned,
  programTypeNameById,
  today,
}: {
  member: Member
  memberCount: number
  partnerCount: number
  lastEntry: HistoryEntry | null
  futureEntries: HistoryEntry[]
  neverAssigned: string[]
  programTypeNameById: { id: string; name: string }[]
  today: string
}) {
  const excluded = (member.excluded_program_type_ids ?? [])
    .map((id) => programTypeNameById.find((pt) => pt.id === id)?.name)
    .filter((n): n is string => !!n)

  return (
    <section className="history-section">
      <h2>{memberDisplayName(member)}</h2>
      <div className="history-cards">
        <div className="history-card">
          <div className="history-card-label">立場・状況</div>
          <div className="history-card-value">
            {member.position}・{member.gender}・{member.status}
          </div>
          {(member.qualifications ?? []).length > 0 && (
            <div className="history-card-sub">特別承認: {(member.qualifications ?? []).join('、')}</div>
          )}
          {excluded.length > 0 && <div className="history-card-sub">当てない種別: {excluded.join('、')}</div>}
        </div>

        <div className="history-card">
          <div className="history-card-label">担当回数</div>
          <div className="history-card-value">
            担当者 {memberCount}回 / ペア {partnerCount}回
          </div>
        </div>

        <div className="history-card">
          <div className="history-card-label">前回</div>
          {lastEntry ? (
            <>
              <div className="history-card-value">{lastEntry.programLabel}</div>
              <div className="history-card-sub">
                {formatDate(lastEntry.date)}({formatRelativeWeeks(lastEntry.date, today)})
              </div>
            </>
          ) : (
            <div className="history-card-value">―</div>
          )}
        </div>

        <div className="history-card history-card-wide">
          <div className="history-card-label">先の予定</div>
          {futureEntries.length === 0 ? (
            <div className="history-card-value">―</div>
          ) : (
            <ul className="history-card-list">
              {futureEntries.map((e, i) => (
                <li key={i}>
                  <span className="history-card-list-date">{formatDate(e.date)}</span>
                  {e.programLabel}
                  {e.role === 'partner' ? '(ペア)' : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {neverAssigned.length > 0 && (
        <p className="history-never">
          <strong>候補に挙がるのにまだ回っていない種別:</strong> {neverAssigned.join('、')}
        </p>
      )}
    </section>
  )
}

function TypeSummaryTable({
  title,
  summaries,
  poolAverages,
  today,
}: {
  title: string
  summaries: TypeSummary[]
  poolAverages: Map<string, number | null>
  today: string
}) {
  return (
    <div className="history-subblock">
      <h3>{title}</h3>
      {summaries.length === 0 ? (
        <p className="history-empty">記録なし</p>
      ) : (
        <table className="history-table">
          <thead>
            <tr>
              <th>種別</th>
              <th className="history-num">回数</th>
              <th>前回</th>
              <th>今後</th>
              <th className="history-num">平均サイクル</th>
              <th className="history-num">全体平均</th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((s) => (
              <tr key={s.key}>
                <td data-label="種別">{s.label}</td>
                <td data-label="回数" className="history-num">
                  {s.count}
                </td>
                <td data-label="前回">
                  {s.lastDate ? <DateWithRelative date={s.lastDate} today={today} /> : '―'}
                </td>
                <td data-label="今後">
                  {s.nextDate ? <DateWithRelative date={s.nextDate} today={today} future /> : '―'}
                </td>
                <td data-label="平均サイクル" className="history-num">
                  {/* 狭い画面ではセルがグリッドになるため、値と差は一つの要素にまとめる */}
                  <span className="history-cyclecell">
                    <span className="history-cycle">{formatCycle(s.averageCycleDays)}</span>
                    {(() => {
                      const delta = formatCycleDelta(s.averageCycleDays, poolAverages.get(s.key))
                      if (!delta) return null
                      return (
                        <span className={`history-cycle-delta ${delta.shorter ? 'is-shorter' : 'is-longer'}`}>
                          {delta.text}
                        </span>
                      )
                    })()}
                  </span>
                </td>
                <td data-label="全体平均" className="history-num history-cycle-pool">
                  {formatCycle(poolAverages.get(s.key) ?? null)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function PairTable({
  title,
  pairs,
  nameOf,
  today,
}: {
  title: string
  pairs: PairSummary[]
  nameOf: (id: string | null) => string
  today: string
}) {
  return (
    <div className="history-subblock">
      <h3>{title}</h3>
      {pairs.length === 0 ? (
        <p className="history-empty">記録なし</p>
      ) : (
        <table className="history-table">
          <thead>
            <tr>
              <th>相手</th>
              <th className="history-num">回数</th>
              <th>直近</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((p) => (
              <tr key={p.counterpartId}>
                <td data-label="相手">{nameOf(p.counterpartId)}</td>
                <td data-label="回数" className="history-num">
                  {p.count}
                </td>
                <td data-label="直近">
                  <DateWithRelative date={p.lastDate} today={today} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export type { AssignmentRole }
