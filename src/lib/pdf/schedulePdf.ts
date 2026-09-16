import type { PDFFont, PDFPage } from 'pdf-lib'
import {
  BLACK,
  CONTENT_BOTTOM,
  CONTENT_LEFT,
  CONTENT_RIGHT,
  CONTENT_TOP,
  CONTENT_WIDTH,
  WHITE,
  addA4Page,
  createPdf,
  drawText,
  fillRect,
  fitText,
  hex,
  px,
  squeezeToWidth,
  type FittedText,
} from './pdfKit'

// 集会予定表(1か月分の週ごとのプログラムを、1プログラム1行でA4 1ページに並べたもの)をPDFにする。
// 寸法はPCで出したPDFから実測した値。以前のCSS(.schedule-*)と同じ見た目になる。
// 5週ある月(45行ほど)でも1ページに収まる行の高さになっている。

export interface ScheduleRow {
  title: string
  /** 「1．」のような番号付きか。番号付きは、折り返した2行目以降を番号の後ろに揃える */
  numbered: boolean
  /** 例: 40番。歌が無い行は空で、そのときは題名が歌の列まで伸びる */
  song: string
  /** 例: 5分 */
  duration: string
  /** 例: (〜7:05) */
  endTime: string
  material: string
  presenter: string
  /** 例: (野上 貴弥兄弟) */
  partner: string
  /** 行の左端の色帯(#rrggbb)。開会・閉会など帯の無い行は null */
  sectionColor: string | null
}

export interface ScheduleWeek {
  /** 例: 2026年8月6日(木) */
  heading: string
  /** 例: 司会者: 井田 陽介兄弟。いなければ空 */
  chairman: string
  rows: ScheduleRow[]
}

export interface ScheduleModel {
  /** 例: クリスチャンとしての生活と奉仕の集会―8月 */
  title: string
  printedDate: string
  weeks: ScheduleWeek[]
}

const NAVY = hex('#2a4d7a')
const STRIPE = hex('#f0eefc')
const TITLE_TEXT = hex('#111111')
const DATE_COLOR = hex('#333333')

const TEXT_SIZE = 9
const LINE_STEP = TEXT_SIZE * 1.15
/** 番号付きの題名のぶら下げ幅(1.54em) */
const HANG = TEXT_SIZE * 1.54

// 行の左端: 色帯(8px) → 余白(8px) → 本文。右端にも余白(8px)
const BAND_WIDTH = px(8)
const INNER_LEFT = CONTENT_LEFT + BAND_WIDTH + px(8)
const INNER_RIGHT = CONTENT_RIGHT - px(8)
const COLUMN_GAP = px(6)
// 歌・時間・終了時刻・資料・担当者・ペアの幅。担当者とペアは、9ptで一番長い名前
// (「(五百旗頭 真次兄弟)」)が折り返さない幅。題名の列は残りを受け取る
const [SONG_W, DURATION_W, END_W, MATERIAL_W, PRESENTER_W, PARTNER_W] = [34, 34, 48, 116, 100, 108].map(px)
const TITLE_W =
  INNER_RIGHT - INNER_LEFT - (SONG_W + DURATION_W + END_W + MATERIAL_W + PRESENTER_W + PARTNER_W) - COLUMN_GAP * 6
const SONG_X = INNER_LEFT + TITLE_W + COLUMN_GAP
const DURATION_X = SONG_X + SONG_W + COLUMN_GAP
const END_X = DURATION_X + DURATION_W + COLUMN_GAP
const MATERIAL_X = END_X + END_W + COLUMN_GAP
const PRESENTER_X = MATERIAL_X + MATERIAL_W + COLUMN_GAP
const PARTNER_X = PRESENTER_X + PRESENTER_W + COLUMN_GAP

// 以下、PCで出したPDFからの実測値(pt)
const TITLE_SIZE = 16
const TITLE_BASELINE = 38.2
const FIRST_WEEK_TOP = 48.75
const WEEK_HEIGHT = 15.79
const WEEK_BASELINE = 11.25
const WEEK_TEXT_SIZE = px(11)
const ROW_HEIGHT = 13.35
const ROW_BASELINE = 9.7
/** 週と週のあいだ(5px) */
const WEEK_GAP = px(5)

interface LaidOutRow {
  row: ScheduleRow
  height: number
  title: FittedText & { x: number[] }
  material: FittedText
  presenter: FittedText
  partner: FittedText
}

function layoutRow(font: PDFFont, row: ScheduleRow): LaidOutRow {
  // 歌が無い行は、空いている歌の列まで題名を伸ばす(以前の表示と同じ)
  const titleWidth = row.song ? TITLE_W : TITLE_W + COLUMN_GAP + SONG_W
  // 番号付きは1行目を左端から、2行目以降を番号の後ろから。番号なしは全行を番号の後ろから
  const title = row.numbered
    ? fitText(font, row.title, TEXT_SIZE, titleWidth, titleWidth - HANG)
    : fitText(font, row.title, TEXT_SIZE, titleWidth - HANG)
  const titleX = title.lines.map((_, i) => (row.numbered && i === 0 ? INNER_LEFT : INNER_LEFT + HANG))

  const material = fitText(font, row.material, TEXT_SIZE, MATERIAL_W)
  const presenter = fitText(font, row.presenter, TEXT_SIZE, PRESENTER_W)
  const partner = fitText(font, row.partner, TEXT_SIZE, PARTNER_W)
  const lines = Math.max(title.lines.length, material.lines.length, presenter.lines.length, partner.lines.length)
  return {
    row,
    height: ROW_HEIGHT + (lines - 1) * LINE_STEP,
    title: { ...title, x: titleX },
    material,
    presenter,
    partner,
  }
}

function drawRow(page: PDFPage, font: PDFFont, laid: LaidOutRow, top: number, striped: boolean) {
  const { row, height } = laid
  if (striped) fillRect(page, CONTENT_LEFT, top, CONTENT_WIDTH, height, STRIPE)
  if (row.sectionColor) fillRect(page, CONTENT_LEFT, top, BAND_WIDTH, height, hex(row.sectionColor))

  const base = top + ROW_BASELINE
  const at = (n: number) => base + n * LINE_STEP
  const text = { size: TEXT_SIZE, color: BLACK }

  laid.title.lines.forEach((line, n) =>
    drawText(page, font, line, laid.title.x[n], at(n), { ...text, color: TITLE_TEXT, squeeze: laid.title.squeeze }),
  )
  // 歌・時間・終了時刻は折り返さない(以前の表示の white-space: nowrap)
  drawText(page, font, row.song, SONG_X, base, {
    ...text,
    align: 'right',
    width: SONG_W,
    squeeze: squeezeToWidth(font, row.song, TEXT_SIZE, SONG_W),
  })
  drawText(page, font, row.duration, DURATION_X, base, {
    ...text,
    align: 'right',
    width: DURATION_W,
    squeeze: squeezeToWidth(font, row.duration, TEXT_SIZE, DURATION_W),
  })
  drawText(page, font, row.endTime, END_X, base, {
    ...text,
    squeeze: squeezeToWidth(font, row.endTime, TEXT_SIZE, END_W),
  })
  laid.material.lines.forEach((line, n) =>
    drawText(page, font, line, MATERIAL_X, at(n), { ...text, squeeze: laid.material.squeeze }),
  )
  laid.presenter.lines.forEach((line, n) =>
    drawText(page, font, line, PRESENTER_X, at(n), {
      ...text,
      align: 'right',
      width: PRESENTER_W,
      squeeze: laid.presenter.squeeze,
    }),
  )
  laid.partner.lines.forEach((line, n) =>
    drawText(page, font, line, PARTNER_X, at(n), {
      ...text,
      align: 'right',
      width: PARTNER_W,
      squeeze: laid.partner.squeeze,
    }),
  )
}

export async function buildSchedulePdf(model: ScheduleModel, fontBytes: ArrayBuffer): Promise<Uint8Array> {
  const pdf = await createPdf(fontBytes)
  const { font } = pdf
  let page = addA4Page(pdf)

  drawText(page, font, model.title, CONTENT_LEFT, TITLE_BASELINE, {
    size: TITLE_SIZE,
    color: NAVY,
    weight: 'semibold',
  })
  drawText(page, font, model.printedDate, CONTENT_LEFT, TITLE_BASELINE, {
    size: px(11),
    color: DATE_COLOR,
    align: 'right',
    width: CONTENT_WIDTH,
  })

  let y = FIRST_WEEK_TOP
  for (const week of model.weeks) {
    const rows = week.rows.map((row) => layoutRow(font, row))
    const weekHeight = WEEK_HEIGHT + rows.reduce((sum, r) => sum + r.height, 0)

    // 週の途中でページを分けない(以前の表示の break-inside: avoid と同じ)
    if (y + weekHeight > CONTENT_BOTTOM && y > FIRST_WEEK_TOP) {
      page = addA4Page(pdf)
      y = CONTENT_TOP
    }

    fillRect(page, CONTENT_LEFT, y, CONTENT_WIDTH, WEEK_HEIGHT, NAVY)
    drawText(page, font, week.heading, CONTENT_LEFT + px(8), y + WEEK_BASELINE, {
      size: WEEK_TEXT_SIZE,
      color: WHITE,
      weight: 'bold',
    })
    drawText(page, font, week.chairman, CONTENT_LEFT + px(8), y + WEEK_BASELINE, {
      size: WEEK_TEXT_SIZE,
      color: WHITE,
      weight: 'bold',
      align: 'right',
      width: CONTENT_WIDTH - px(8) * 2,
    })
    y += WEEK_HEIGHT

    // 縞は週ごとに数え直す。週の1行目から縞を敷く(以前の表示と同じ)
    rows.forEach((laid, i) => {
      drawRow(page, font, laid, y, i % 2 === 0)
      y += laid.height
    })
    y += WEEK_GAP
  }

  if (model.weeks.length === 0) {
    drawText(page, font, '対象期間にプログラムがありません。', CONTENT_LEFT, FIRST_WEEK_TOP + 20, {
      size: 11,
      color: BLACK,
    })
  }

  return pdf.doc.save()
}
