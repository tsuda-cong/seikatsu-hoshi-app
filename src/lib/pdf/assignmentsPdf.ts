import type { PDFPage } from 'pdf-lib'
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
  type Pdf,
} from './pdfKit'

// 割当予定表(課題のあるプログラムだけを、週ごとに1行ずつ並べた一覧)をPDFにする。
// 寸法はPCで出したPDFから実測した値。以前のCSS(.assignments-*)と同じ見た目になる。

export interface AssignmentsRow {
  title: string
  duration: string
  point: string
  student: string
  partner: string
}

export interface AssignmentsWeek {
  /** 例: 2026年9月3日(木) */
  heading: string
  /** 例: 助言者: 千葉 真也兄弟。いなければ空 */
  counselor: string
  rows: AssignmentsRow[]
}

export interface AssignmentsModel {
  /** 右下に入れる出力日。例: 2026年9月12日 */
  printedDate: string
  weeks: AssignmentsWeek[]
}

const TITLE = 'クリスチャンとしての生活と奉仕の集会の割り当て予定表'

const PURPLE = hex('#6c3093')
const HEADER_BG = hex('#444444')
const STRIPE = hex('#f0eefc')
const DATE_COLOR = hex('#333333')

const LEFT = CONTENT_LEFT
const RIGHT = CONTENT_RIGHT
const TOP = CONTENT_TOP
const BOTTOM = CONTENT_BOTTOM

// 列幅(割当・時間・課題・生徒・相手)。生徒と相手は、9ptで一番長い名前が折り返さない最小限
const COLUMN_RATIOS = [0.35, 0.08, 0.22, 0.175, 0.175]
const HEADERS = ['割当', '時間', '課題', '生徒', '相手']
const CELL_PADDING = px(8)

// 以下、PCで出したPDFからの実測値(pt)
const TITLE_SIZE = 16
const TITLE_BASELINE = 38.2
const TABLE_TOP = 47.2
const HEADER_HEIGHT = 13.5
const HEADER_BASELINE = 9.0
const HEADER_SIZE = px(10)
const WEEK_HEIGHT = 14.25
const WEEK_BASELINE = 10.4
const ROW_HEIGHT = 12.75
const ROW_BASELINE = 9.8
const TEXT_SIZE = 9
/** 折り返したときの2行目以降の送り(9pt × 行の高さ1.15) */
const LINE_STEP = TEXT_SIZE * 1.15
const DATE_SIZE = px(11)

const columnX: number[] = []
const columnWidth: number[] = []
{
  let x = LEFT
  for (const ratio of COLUMN_RATIOS) {
    columnX.push(x)
    columnWidth.push(CONTENT_WIDTH * ratio)
    x += CONTENT_WIDTH * ratio
  }
}

function drawHeaderRow(page: PDFPage, pdf: Pdf, top: number): number {
  fillRect(page, LEFT, top, CONTENT_WIDTH, HEADER_HEIGHT, HEADER_BG)
  HEADERS.forEach((label, i) => {
    drawText(page, pdf.font, label, columnX[i] + CELL_PADDING, top + HEADER_BASELINE, {
      size: HEADER_SIZE,
      color: WHITE,
      weight: 'bold',
    })
  })
  return top + HEADER_HEIGHT
}

export async function buildAssignmentsPdf(model: AssignmentsModel, fontBytes: ArrayBuffer): Promise<Uint8Array> {
  const pdf = await createPdf(fontBytes)
  let page = addA4Page(pdf)

  drawText(page, pdf.font, TITLE, LEFT, TITLE_BASELINE, { size: TITLE_SIZE, color: PURPLE, weight: 'semibold' })
  let y = drawHeaderRow(page, pdf, TABLE_TOP)

  // 入りきらなければ改ページし、次のページの頭にも列の見出しを出す(ブラウザの印刷と同じ)
  const ensureRoom = (height: number) => {
    if (y + height <= BOTTOM) return
    page = addA4Page(pdf)
    y = drawHeaderRow(page, pdf, TOP)
  }

  // 縞は週をまたいで1行おきに数え続ける
  let rowIndex = 0
  for (const week of model.weeks) {
    if (week.rows.length === 0) continue

    // 週の帯だけがページの最下部に取り残されないよう、1行目と一緒に入るか確かめる
    ensureRoom(WEEK_HEIGHT + ROW_HEIGHT)
    fillRect(page, LEFT, y, CONTENT_WIDTH, WEEK_HEIGHT, PURPLE)
    drawText(page, pdf.font, week.heading, LEFT + CELL_PADDING, y + WEEK_BASELINE, {
      size: TEXT_SIZE,
      color: WHITE,
      weight: 'bold',
    })
    // 助言者は、生徒・相手の2列にまたがる欄の右端に寄せる
    drawText(page, pdf.font, week.counselor, columnX[3], y + WEEK_BASELINE, {
      size: TEXT_SIZE,
      color: WHITE,
      weight: 'bold',
      align: 'right',
      width: RIGHT - CELL_PADDING - columnX[3],
    })
    y += WEEK_HEIGHT

    for (const row of week.rows) {
      const cells = [row.title, row.duration, row.point, row.student, row.partner]
      const fitted = cells.map((text, i) => fitText(pdf.font, text, TEXT_SIZE, columnWidth[i] - CELL_PADDING * 2))
      const lineCount = Math.max(...fitted.map((f) => f.lines.length))
      const height = ROW_HEIGHT + (lineCount - 1) * LINE_STEP

      ensureRoom(height)
      if (rowIndex % 2 === 1) fillRect(page, LEFT, y, CONTENT_WIDTH, height, STRIPE)
      fitted.forEach((cell, i) => {
        cell.lines.forEach((line, n) => {
          drawText(page, pdf.font, line, columnX[i] + CELL_PADDING, y + ROW_BASELINE + n * LINE_STEP, {
            size: TEXT_SIZE,
            color: BLACK,
            squeeze: cell.squeeze,
          })
        })
      })
      y += height
      rowIndex += 1
    }
  }

  // 出力日は表のすぐ下の右端
  let dateBaseline = y + px(8) + 9.4
  if (dateBaseline > BOTTOM) {
    page = addA4Page(pdf)
    dateBaseline = TOP + 9.4
  }
  drawText(page, pdf.font, model.printedDate, LEFT, dateBaseline, {
    size: DATE_SIZE,
    color: DATE_COLOR,
    align: 'right',
    width: CONTENT_WIDTH,
  })

  return pdf.doc.save()
}
