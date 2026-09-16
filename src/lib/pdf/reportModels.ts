import { memberDisplayName } from '../candidates'
import { computeEndTimesMinutes, formatClockTime } from '../schedule'
import {
  findChairmanName,
  formatDateHeading,
  formatPrintedDate,
  hasSectionBand,
  sectionColor,
  sectionTextColor,
  type RangeData,
} from '../printData'
import type { ProgramType, Song, TeachingPoint } from '../../types/domain'
import type { AssignmentsModel } from './assignmentsPdf'
import type { ChairmanModel, ChairmanSection } from './chairmanPdf'
import type { CounselorModel } from './counselorPdf'
import type { ScheduleModel } from './schedulePdf'

export function toChairmanModel(data: RangeData, meetingStartTime: string, songs: Song[]): ChairmanModel {
  return {
    pages: data.dates.map((date) => {
      const items = data.programsByDate.get(date) ?? []
      const endMinutes = computeEndTimesMinutes(meetingStartTime, items)

      // 同じ区分が続くあいだを1つのまとまりにする(帯は区分が変わったところにだけ出す)
      const sections: (ChairmanSection & { key: string | null })[] = []
      items.forEach((item, i) => {
        const assignment = data.assignmentByProgramId.get(item.id)
        const song = item.song_id ? songs.find((s) => s.id === item.song_id) : undefined
        const name = item.title ?? item.program_types?.name ?? ''
        const row = {
          title: song ? `${song.number}番の${name}` : name,
          time: `${item.duration_minutes ? `${item.duration_minutes}分` : ''} (〜${formatClockTime(endMinutes[i])})`,
          presenter: assignment?.member ? memberDisplayName(assignment.member) : '',
          // 歌の行は、資料の代わりに歌の題名と聖句を出す
          material: item.material || (song ? `${song.title}${song.scripture ?? ''}` : ''),
          partner: assignment?.partner ? `(${memberDisplayName(assignment.partner)})` : '',
          content: item.content ?? '',
        }
        const last = sections[sections.length - 1]
        if (last && last.key === item.section) {
          last.items.push(row)
        } else {
          sections.push({
            key: item.section,
            band: hasSectionBand(item.section)
              ? {
                  name: item.section!,
                  color: sectionColor(item.section),
                  textColor: sectionTextColor(item.section),
                }
              : null,
            items: [row],
          })
        }
      })
      return { date: formatDateHeading(date), sections: sections.map(({ band, items: rows }) => ({ band, items: rows })) }
    }),
  }
}

/** 助言者用紙の日付。曜日は付けない(例: 2026年9月17日) */
function formatDateWithoutWeekday(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
}

export function toCounselorModel(
  data: RangeData,
  meetingStartTime: string,
  teachingPoints: TeachingPoint[],
): CounselorModel {
  return {
    pages: data.dates.flatMap((date) => {
      const all = data.programsByDate.get(date) ?? []
      const endMinutes = computeEndTimesMinutes(meetingStartTime, all)
      const items = all
        .map((item, i) => ({ item, endMinute: endMinutes[i] }))
        // 課題(教励課題)のあるプログラムだけ。無い週はページごと出さない
        .filter(({ item }) => item.teaching_point_id)
      if (items.length === 0) return []
      return [
        {
          date: formatDateWithoutWeekday(date),
          items: items.map(({ item, endMinute }) => {
            const assignment = data.assignmentByProgramId.get(item.id)
            const point = teachingPoints.find((t) => t.id === item.teaching_point_id)
            return {
              title: `${item.title ?? item.program_types?.name ?? ''}${item.duration_minutes ? `(${item.duration_minutes}分)` : ''}`,
              point: point ? `${point.code} ${point.title}${point.page ?? ''}` : '',
              material: item.material ?? '',
              student: assignment?.member ? memberDisplayName(assignment.member) : '',
              content: item.content ?? '',
              partner: assignment?.partner ? `(${memberDisplayName(assignment.partner)})` : '',
              endTime: `〜${formatClockTime(endMinute)}`,
            }
          }),
        },
      ]
    }),
  }
}

/** 集会予定表の題名。例: クリスチャンとしての生活と奉仕の集会―8月 */
function scheduleTitle(month: string | undefined): string {
  const m = month ? Number(month.split('-')[1]) : NaN
  return m ? `クリスチャンとしての生活と奉仕の集会―${m}月` : 'クリスチャンとしての生活と奉仕の集会'
}

export function toScheduleModel(
  data: RangeData,
  month: string | undefined,
  meetingStartTime: string,
  programTypes: ProgramType[],
  songs: Song[],
): ScheduleModel {
  return {
    title: scheduleTitle(month),
    printedDate: formatPrintedDate(),
    weeks: data.dates.map((date) => {
      const all = data.programsByDate.get(date) ?? []
      // 終了時刻は、表に出さない行(課題のある行)も含めた全体で積み上げる
      const endMinutes = computeEndTimesMinutes(meetingStartTime, all)
      const chairman = findChairmanName(all, data.assignmentByProgramId, programTypes)
      return {
        heading: formatDateHeading(date),
        chairman: chairman ? `司会者: ${chairman}` : '',
        rows: all
          .map((item, i) => ({ item, endMinute: endMinutes[i] }))
          // 課題(教励課題)のある行は割当予定表に載せるので、ここでは除く
          .filter(({ item }) => !item.teaching_point_id)
          .map(({ item, endMinute }) => {
            const assignment = data.assignmentByProgramId.get(item.id)
            const song = item.song_id ? songs.find((s) => s.id === item.song_id) : undefined
            const title = item.title ?? item.program_types?.name ?? ''
            const color = sectionColor(item.section)
            return {
              title,
              numbered: /^\d+[．.]/.test(title),
              song: song ? `${song.number}番` : '',
              duration: item.duration_minutes ? `${item.duration_minutes}分` : '',
              endTime: `(〜${formatClockTime(endMinute)})`,
              material: item.material ?? '',
              presenter: assignment?.member ? memberDisplayName(assignment.member) : '',
              partner: assignment?.partner ? `(${memberDisplayName(assignment.partner)})` : '',
              sectionColor: color === 'transparent' ? null : color,
            }
          }),
      }
    }),
  }
}

// 取得したデータを、各帳票のPDFに描く中身(文字列だけの組み立て済みの形)にする。
// 描く側(*Pdf.ts)をデータの取り方から切り離しておくと、確認用にNodeから同じ描画を呼べる。

export function toAssignmentsModel(
  data: RangeData,
  programTypes: ProgramType[],
  teachingPoints: TeachingPoint[],
): AssignmentsModel {
  return {
    printedDate: formatPrintedDate(),
    weeks: data.dates.flatMap((date) => {
      const all = data.programsByDate.get(date) ?? []
      // 課題(教励課題)のあるプログラムだけを載せる
      const items = all.filter((item) => item.teaching_point_id)
      if (items.length === 0) return []
      const counselor = findChairmanName(all, data.assignmentByProgramId, programTypes)
      return [
        {
          heading: formatDateHeading(date),
          counselor: counselor ? `助言者: ${counselor}` : '',
          rows: items.map((item) => {
            const assignment = data.assignmentByProgramId.get(item.id)
            const point = teachingPoints.find((t) => t.id === item.teaching_point_id)
            return {
              title: item.title ?? item.program_types?.name ?? '',
              duration: item.duration_minutes ? `(${item.duration_minutes}分)` : '',
              point: point?.code ?? '',
              student: assignment?.member ? memberDisplayName(assignment.member) : '',
              partner: assignment?.partner ? `(${memberDisplayName(assignment.partner)})` : '',
            }
          }),
        },
      ]
    }),
  }
}
