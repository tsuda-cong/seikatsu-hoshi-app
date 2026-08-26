import { memberDisplayName } from './candidates'
import { fetchRangeData } from './printData'
import type { TeachingPoint } from '../types/domain'

const HEADERS = ['日付', '区分', 'プログラム', '担当者', 'ペア', '課題'] as const

/** カンマ・改行・引用符を含む値でも壊れないように囲む */
function escapeCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCell).join(',')).join('\r\n')
}

/** 指定期間の週間プログラムをCSV文字列にする */
export async function buildProgramCsv(from: string, to: string, teachingPoints: TeachingPoint[]): Promise<string> {
  const data = await fetchRangeData(from, to)
  const teachingPointById = new Map(teachingPoints.map((t) => [t.id, t]))

  const rows: string[][] = [[...HEADERS]]

  for (const date of data.dates) {
    for (const program of data.programsByDate.get(date) ?? []) {
      const assignment = data.assignmentByProgramId.get(program.id)
      const teachingPoint = program.teaching_point_id ? teachingPointById.get(program.teaching_point_id) : undefined

      rows.push([
        date,
        program.section ?? '',
        program.title ?? program.program_types?.name ?? '',
        assignment?.member ? memberDisplayName(assignment.member) : '',
        assignment?.partner ? memberDisplayName(assignment.partner) : '',
        teachingPoint ? `${teachingPoint.code} ${teachingPoint.title}` : '',
      ])
    }
  }

  return toCsv(rows)
}

/** ExcelがUTF-8と判別できるようにするためのBOM */
const UTF8_BOM = '﻿'

/** ブラウザにCSVをダウンロードさせる */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([UTF8_BOM + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
