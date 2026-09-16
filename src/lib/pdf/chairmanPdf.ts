import type { PDFFont, PDFPage } from 'pdf-lib'
import {
  BLACK,
  CONTENT_BOTTOM,
  CONTENT_LEFT,
  CONTENT_RIGHT,
  CONTENT_TOP,
  CONTENT_WIDTH,
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

// 司会進行用紙(1週1ページ。区分ごとに色の帯を付け、各プログラムの時間・担当者・資料・内容を並べたもの)をPDFにする。
// 寸法はPCで出したPDFから実測した値。以前のCSS(.chair-*)と同じ見た目になる。
//
// 各プログラムは、以前のCSSのグリッドと同じく3段で積む。
//   1段目: 題名 / 時間 / 担当者
//   2段目: 資料 / ペア            (どちらも空なら段ごと詰まる)
//   3段目: 内容                   (空なら無し)

export interface ChairmanItem {
  /** 例: 161番の歌と祈り、1．エホバは従い続ける人に報いを与える */
  title: string
  /** 例: 5分 (〜7:05) */
  time: string
  presenter: string
  /** 資料。歌の行では歌の題名と聖句 */
  material: string
  /** 例: (湯野 容代姉妹) */
  partner: string
  content: string
}

export interface ChairmanSection {
  /** 帯に出す区分名。開会など帯の無い区分は null */
  band: { name: string; color: string; textColor: string } | null
  items: ChairmanItem[]
}

export interface ChairmanPage {
  /** 例: 2026年9月17日(木) */
  date: string
  sections: ChairmanSection[]
}

export interface ChairmanModel {
  pages: ChairmanPage[]
}

const STRIPE = hex('#f0eefc')
const HEADING = hex('#111111')
const RULE = hex('#333333')

const TITLE_SIZE = px(13)
const SUB_SIZE = px(12)
/** 行の高さ1.55(以前の画面全体の設定)での1行分の高さ */
const TITLE_LINE = TITLE_SIZE * 1.55
const SUB_LINE = SUB_SIZE * 1.55
/** 1行の枠の上端からベースラインまで(実測) */
const TITLE_ASCENT = 11.25
const SUB_ASCENT = 10.39

// 各プログラムの枠: 上下の余白5px・左右10px。3列は 残り / 74px / 130px、列の間は10px、段の間は1px
const ITEM_PAD_Y = px(5)
const TEXT_LEFT = CONTENT_LEFT + px(10)
const TEXT_RIGHT = CONTENT_RIGHT - px(10)
const COLUMN_GAP = px(10)
const ROW_GAP = px(1)
const PRESENTER_W = px(130)
const TIME_W = px(74)
const PRESENTER_X = TEXT_RIGHT - PRESENTER_W
const TIME_X = PRESENTER_X - COLUMN_GAP - TIME_W
const MAIN_W = TIME_X - COLUMN_GAP - TEXT_LEFT
/** 内容は3列にまたがる */
const CONTENT_W = TEXT_RIGHT - TEXT_LEFT

// 以下、PCで出したPDFからの実測値(pt)
const PAGE_TITLE_BASELINE = 37.5
const DATE_BASELINE = 58.5
const RULE_TOP = 67.5
const RULE_HEIGHT = px(2)
const FIRST_ITEM_TOP = 76.5
const BAND_HEIGHT = px(4) * 2 + TITLE_LINE
const BAND_BASELINE = px(4) + TITLE_ASCENT
const BAND_AFTER = px(4)
const SECTION_AFTER = px(10)

interface LaidOutItem {
  item: ChairmanItem
  height: number
  title: FittedText
  presenter: FittedText
  material: FittedText
  partner: FittedText
  content: FittedText
  /** 2段目・3段目の枠の上端(プログラムの上端から)。段が無ければ null */
  row2Top: number | null
  row3Top: number | null
}

function layoutItem(font: PDFFont, item: ChairmanItem): LaidOutItem {
  const title = fitText(font, item.title, TITLE_SIZE, MAIN_W)
  const presenter = fitText(font, item.presenter, TITLE_SIZE, PRESENTER_W)
  const material = fitText(font, item.material, SUB_SIZE, MAIN_W)
  const partner = fitText(font, item.partner, SUB_SIZE, PRESENTER_W)
  const content = fitText(font, item.content, SUB_SIZE, CONTENT_W)

  const row1Lines = Math.max(title.lines.length, presenter.lines.length)
  let y = ITEM_PAD_Y + row1Lines * TITLE_LINE
  // グリッドの段の間は、中身の無い段があっても空く(以前の表示と同じ)
  const hasRow2 = !!(item.material || item.partner)
  const row2Top = hasRow2 ? y + ROW_GAP : null
  y += ROW_GAP
  if (hasRow2) y += Math.max(material.lines.length, partner.lines.length) * SUB_LINE
  const row3Top = item.content ? y + ROW_GAP : null
  if (item.content) y += ROW_GAP + content.lines.length * SUB_LINE
  y += ITEM_PAD_Y

  return { item, height: y, title, presenter, material, partner, content, row2Top, row3Top }
}

function drawItem(page: PDFPage, font: PDFFont, laid: LaidOutItem, top: number, striped: boolean) {
  const { item } = laid
  if (striped) fillRect(page, CONTENT_LEFT, top, CONTENT_WIDTH, laid.height, STRIPE)

  const base1 = top + ITEM_PAD_Y + TITLE_ASCENT
  laid.title.lines.forEach((line, n) =>
    drawText(page, font, line, TEXT_LEFT, base1 + n * TITLE_LINE, {
      size: TITLE_SIZE,
      color: HEADING,
      weight: 'semibold',
      squeeze: laid.title.squeeze,
    }),
  )
  // 時間は折り返さない(以前の表示の white-space: nowrap)
  drawText(page, font, item.time, TIME_X, base1, {
    size: TITLE_SIZE,
    color: BLACK,
    align: 'right',
    width: TIME_W,
    squeeze: squeezeToWidth(font, item.time, TITLE_SIZE, TIME_W),
  })
  laid.presenter.lines.forEach((line, n) =>
    drawText(page, font, line, PRESENTER_X, base1 + n * TITLE_LINE, {
      size: TITLE_SIZE,
      color: BLACK,
      align: 'right',
      width: PRESENTER_W,
      squeeze: laid.presenter.squeeze,
    }),
  )

  if (laid.row2Top !== null) {
    const base2 = top + laid.row2Top + SUB_ASCENT
    laid.material.lines.forEach((line, n) =>
      drawText(page, font, line, TEXT_LEFT, base2 + n * SUB_LINE, {
        size: SUB_SIZE,
        color: BLACK,
        squeeze: laid.material.squeeze,
      }),
    )
    laid.partner.lines.forEach((line, n) =>
      drawText(page, font, line, PRESENTER_X, base2 + n * SUB_LINE, {
        size: SUB_SIZE,
        color: BLACK,
        align: 'right',
        width: PRESENTER_W,
        squeeze: laid.partner.squeeze,
      }),
    )
  }
  if (laid.row3Top !== null) {
    const base3 = top + laid.row3Top + SUB_ASCENT
    laid.content.lines.forEach((line, n) =>
      drawText(page, font, line, TEXT_LEFT, base3 + n * SUB_LINE, {
        size: SUB_SIZE,
        color: BLACK,
        squeeze: laid.content.squeeze,
      }),
    )
  }
}

function drawPageHeading(page: PDFPage, font: PDFFont, date: string) {
  drawText(page, font, 'プログラム司会進行用紙', CONTENT_LEFT, PAGE_TITLE_BASELINE, {
    size: px(20),
    color: HEADING,
    weight: 'semibold',
  })
  drawText(page, font, date, CONTENT_LEFT, DATE_BASELINE, { size: px(15), color: HEADING, weight: 'semibold' })
  fillRect(page, CONTENT_LEFT, RULE_TOP, CONTENT_WIDTH, RULE_HEIGHT, RULE)
}

export async function buildChairmanPdf(model: ChairmanModel, fontBytes: ArrayBuffer): Promise<Uint8Array> {
  const pdf = await createPdf(fontBytes)
  const { font } = pdf

  for (const sheet of model.pages) {
    // 1週1ページ
    let page = addA4Page(pdf)
    drawPageHeading(page, font, sheet.date)
    let y = FIRST_ITEM_TOP
    // 縞はページの中で区分をまたいで数え続ける
    let itemIndex = 0

    // 1週分が1ページに収まらないときだけ、次のページに続ける(通常は収まる)
    const ensureRoom = (height: number) => {
      if (y + height <= CONTENT_BOTTOM) return
      page = addA4Page(pdf)
      y = CONTENT_TOP
    }

    for (const section of sheet.sections) {
      const items = section.items.map((item) => layoutItem(font, item))
      if (section.band) {
        ensureRoom(BAND_HEIGHT + BAND_AFTER + (items[0]?.height ?? 0))
        fillRect(page, CONTENT_LEFT, y, CONTENT_WIDTH, BAND_HEIGHT, hex(section.band.color))
        drawText(page, font, section.band.name, TEXT_LEFT, y + BAND_BASELINE, {
          size: TITLE_SIZE,
          color: hex(section.band.textColor),
          weight: 'bold',
        })
        y += BAND_HEIGHT + BAND_AFTER
      }
      for (const laid of items) {
        ensureRoom(laid.height)
        drawItem(page, font, laid, y, itemIndex % 2 === 1)
        y += laid.height
        itemIndex += 1
      }
      y += SECTION_AFTER
    }
  }

  if (model.pages.length === 0) {
    const page = addA4Page(pdf)
    drawText(page, font, '対象期間にプログラムがありません。', CONTENT_LEFT, FIRST_ITEM_TOP, { size: 11 })
  }

  return pdf.doc.save()
}
