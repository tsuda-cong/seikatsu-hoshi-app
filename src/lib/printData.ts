import { supabase } from './supabaseClient'
import { fetchAllRows } from './fetchAll'
import type { Assignment, Member, Program, ProgramType } from '../types/domain'

export type ProgramWithType = Program & { program_types: ProgramType | null }
export type AssignmentWithRelations = Assignment & {
  member: Member | null
  partner: Member | null
}

export interface RangeData {
  dates: string[]
  programsByDate: Map<string, ProgramWithType[]>
  assignmentByProgramId: Map<string, AssignmentWithRelations>
}

export async function fetchRangeData(from: string, to: string): Promise<RangeData> {
  // 期間が長いとどちらも1000行を超えうるので、ページングして取り切る
  const programs = await fetchAllRows<ProgramWithType>(() =>
    supabase
      .from('programs')
      .select('*, program_types(*)')
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true })
      .order('order_no', { ascending: true })
      .returns<ProgramWithType[]>(),
  )
  const programIds = programs.map((p) => p.id)

  let assignments: AssignmentWithRelations[] = []
  if (programIds.length > 0) {
    assignments = await fetchAllRows<AssignmentWithRelations>(() =>
      supabase
        .from('assignments')
        .select('*, member:members!member_id(*), partner:members!partner_id(*)')
        .in('program_id', programIds)
        .order('id', { ascending: true })
        .returns<AssignmentWithRelations[]>(),
    )
  }

  const programsByDate = new Map<string, ProgramWithType[]>()
  for (const p of programs) {
    const list = programsByDate.get(p.date) ?? []
    list.push(p)
    programsByDate.set(p.date, list)
  }

  const assignmentByProgramId = new Map<string, AssignmentWithRelations>()
  for (const a of assignments) {
    if (a.program_id) assignmentByProgramId.set(a.program_id, a)
  }

  const dates = [...programsByDate.keys()].sort()

  return { dates, programsByDate, assignmentByProgramId }
}

export function formatDateHeading(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
}

/** 帳票の「出力日」表記(例: 2026年8月6日) */
export function formatPrintedDate(d: Date = new Date()): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

/** 開会・閉会は帯なし(透明)。それ以外は司会進行用紙の配色に合わせる */
const SECTION_COLORS: Record<string, string> = {
  神の言葉の宝: '#707070',
  野外奉仕に励む: '#e8b923',
  伝道を楽しもう: '#e8b923',
  クリスチャンとして生活する: '#7a1f2b',
}

const SECTION_TEXT_COLORS: Record<string, string> = {
  神の言葉の宝: '#fff',
  野外奉仕に励む: '#222',
  伝道を楽しもう: '#222',
  クリスチャンとして生活する: '#fff',
}

/** 帯が不要なセクション(開会・閉会) */
export function hasSectionBand(section: string | null): boolean {
  return !!section && section in SECTION_COLORS
}

export function sectionColor(section: string | null): string {
  if (!section) return 'transparent'
  return SECTION_COLORS[section] ?? 'transparent'
}

export function sectionTextColor(section: string | null): string {
  if (!section) return '#222'
  return SECTION_TEXT_COLORS[section] ?? '#222'
}

/** その日の「開会の言葉」の担当者を、司会者(=助言者)として返す */
export function findChairmanName(
  programs: ProgramWithType[],
  assignmentByProgramId: Map<string, AssignmentWithRelations>,
  programTypes: ProgramType[],
): string | null {
  const openingType = programTypes.find((pt) => pt.name === '開会の言葉')
  if (!openingType) return null
  const openingProgram = programs.find((p) => p.program_type_id === openingType.id)
  if (!openingProgram) return null
  const assignment = assignmentByProgramId.get(openingProgram.id)
  return assignment?.member ? `${assignment.member.last_name} ${assignment.member.first_name}${assignment.member.honorific}` : null
}
