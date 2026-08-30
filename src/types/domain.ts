export const POSITIONS = ['長老', '援助奉仕者', '成員', '伝道者', '入校者', '巡回監督'] as const
export type Position = (typeof POSITIONS)[number]

export const MEMBER_STATUSES = ['現役', '休止'] as const
export type MemberStatus = (typeof MEMBER_STATUSES)[number]

export const GENDERS = ['男性', '女性'] as const
export type Gender = (typeof GENDERS)[number]

export const QUALIFICATIONS = ['祈り', '聖書研究朗読者', '聖書研究司会', '全体司会', '朗読', '話'] as const
export type Qualification = (typeof QUALIFICATIONS)[number]

export interface Member {
  id: string
  last_name: string
  first_name: string
  last_name_kana: string | null
  first_name_kana: string | null
  gender: Gender
  honorific: string
  position: Position
  status: MemberStatus
  qualifications: Qualification[] | null
  /** このプログラム種別id一覧には担当者候補として絶対に挙げない(除外はせず優先度を下げる他の仕組みとは別) */
  excluded_program_type_ids: string[] | null
  created_at: string
}

export interface ProgramType {
  id: string
  name: string
  required_position: Position[] | null
  required_gender: Gender | null
  needs_partner: boolean | null
  partner_same_gender: boolean | null
  required_qualification: Qualification | null
  partner_program_type_id: string | null
  /**
   * 課題(教励課題)付きプログラムの候補者選定で、直近担当日をまとめて回すグループ名
   * (例: 聖書朗読/実演/話)。同じ値を持つ種別同士で担当日をプールする。
   * 空なら種別ごとに個別管理(他の種別とプールしない)。
   */
  recency_pool: string | null
}

export interface Program {
  id: string
  date: string
  section: string | null
  program_type_id: string | null
  title: string | null
  order_no: number | null
  duration_minutes: number | null
  material: string | null
  content: string | null
  song_id: string | null
  teaching_point_id: string | null
}

export interface Song {
  id: string
  number: number
  title: string
  scripture: string | null
}

export interface TeachingPoint {
  id: string
  code: string
  title: string
  page: string | null
  order_no: number
}

export interface Setting {
  key: string
  value: string
}

export interface Assignment {
  id: string
  program_id: string | null
  member_id: string | null
  partner_id: string | null
  created_at: string
}

export const STAFF_ROLES = ['admin', 'viewer'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

/** ログインできる人。管理者は全操作、閲覧者は週間プログラム・担当履歴・帳票印刷の閲覧のみ */
export interface Staff {
  user_id: string
  role: StaffRole
  display_name: string
  email: string | null
}
