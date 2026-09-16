import type { PDFFont, PDFPage } from 'pdf-lib'
import {
  BLACK,
  CONTENT_LEFT,
  CONTENT_RIGHT,
  CONTENT_WIDTH,
  addA4Page,
  createPdf,
  drawText,
  fillRect,
  fitText,
  hex,
  px,
  squeezeToWidth,
  textWidth,
} from './pdfKit'

// 助言者用紙(1週1ページ。課題のあるプログラムを、ページの高さを等分して並べたもの)をPDFにする。
// 寸法はPCで出したPDFから実測した値。以前のCSS(.counselor-*)と同じ見た目になる。
//
// 各件は上から「題名 / 課題 / 資料と生徒 / 内容と相手 / 終了時刻」を縦に積む。
// 中身が空の段は高さが無くなって詰まる(段の間隔だけが残る。以前の表示と同じ)。

export interface CounselorItem {
  /** 例: 3．聖書朗読(4分) */
  title: string
  /** 例: 教励 第5課 正確に朗読する（8ページ） */
  point: string
  material: string
  student: string
  content: string
  /** 例: (湯野 容代姉妹) */
  partner: string
  /** 例: 〜7:31 */
  endTime: string
}

export interface CounselorPage {
  /** 例: 2026年9月17日 */
  date: string
  items: CounselorItem[]
}

export interface CounselorModel {
  pages: CounselorPage[]
}

const TITLE_BAND = hex('#b7c98f')
const STRIPE = hex('#f0eefc')
const HEADING = hex('#111111')

const TEXT_LEFT = CONTENT_LEFT + px(16)
const TEXT_RIGHT = CONTENT_RIGHT - px(16)
const TEXT_W = TEXT_RIGHT - TEXT_LEFT
/** 左の文章と右の名前のあいだ */
const ROW_GAP_X = px(16)

const ITEM_SIZE = px(15)
const BODY_SIZE = px(13)
const END_SIZE = px(12)
/** 行の高さ1.55での1行分 */
const ITEM_LINE = ITEM_SIZE * 1.55
const BODY_LINE = BODY_SIZE * 1.55
/** 1行の枠の上端からベースラインまで(実測) */
const ITEM_ASCENT = 12.75
const BODY_ASCENT = 11.2
const END_ASCENT = 10.4
const STACK_GAP = px(6)
const ITEM_PAD_TOP = px(14)

// 以下、PCで出したPDFからの実測値(pt)
const BAND_TOP = 19.5
const BAND_HEIGHT = 35.25
const PAGE_TITLE_BASELINE = 43.5
const DATE_BASELINE = 69.8
/** 課題を並べる範囲。件数で等分する */
const ITEMS_TOP = 84.75
const ITEMS_BOTTOM = 793.5

/** 左の文章と右の名前を1段に並べる。名前は折り返さず、文章は残りの幅に収める */
function drawSplitRow(
  page: PDFPage,
  font: PDFFont,
  left: string,
  right: string,
  top: number,
): number {
  if (!left && !right) return 0
  const rightW = textWidth(font, right, BODY_SIZE)
  const nameSqueeze = squeezeToWidth(font, right, BODY_SIZE, TEXT_W / 2)
  const leftW = TEXT_W - (right ? rightW * nameSqueeze + ROW_GAP_X : 0)
  const fitted = fitText(font, left, BODY_SIZE, leftW)
  const base = top + BODY_ASCENT
  fitted.lines.forEach((line, n) =>
    drawText(page, font, line, TEXT_LEFT, base + n * BODY_LINE, { size: BODY_SIZE, color: BLACK, squeeze: fitted.squeeze }),
  )
  drawText(page, font, right, TEXT_LEFT, base, {
    size: BODY_SIZE,
    color: BLACK,
    weight: 'semibold',
    align: 'right',
    width: TEXT_W,
    squeeze: nameSqueeze,
  })
  return fitted.lines.length * BODY_LINE
}

function drawItem(page: PDFPage, font: PDFFont, item: CounselorItem, top: number) {
  let y = top + ITEM_PAD_TOP

  const title = fitText(font, item.title, ITEM_SIZE, TEXT_W)
  title.lines.forEach((line, n) =>
    drawText(page, font, line, TEXT_LEFT, y + ITEM_ASCENT + n * ITEM_LINE, {
      size: ITEM_SIZE,
      color: HEADING,
      weight: 'bold',
      squeeze: title.squeeze,
    }),
  )
  y += title.lines.length * ITEM_LINE + STACK_GAP

  if (item.point) {
    const point = fitText(font, item.point, BODY_SIZE, TEXT_W)
    point.lines.forEach((line, n) =>
      drawText(page, font, line, TEXT_LEFT, y + BODY_ASCENT + n * BODY_LINE, {
        size: BODY_SIZE,
        color: BLACK,
        weight: 'semibold',
        squeeze: point.squeeze,
      }),
    )
    y += point.lines.length * BODY_LINE
  }
  y += STACK_GAP

  y += drawSplitRow(page, font, item.material, item.student, y) + STACK_GAP
  y += drawSplitRow(page, font, item.content, item.partner, y) + STACK_GAP

  drawText(page, font, item.endTime, TEXT_LEFT, y + END_ASCENT, {
    size: END_SIZE,
    color: BLACK,
    align: 'right',
    width: TEXT_W,
  })
}

export async function buildCounselorPdf(model: CounselorModel, fontBytes: ArrayBuffer): Promise<Uint8Array> {
  const pdf = await createPdf(fontBytes)
  const { font } = pdf

  for (const sheet of model.pages) {
    const page = addA4Page(pdf)
    fillRect(page, CONTENT_LEFT, BAND_TOP, CONTENT_WIDTH, BAND_HEIGHT, TITLE_BAND)
    drawText(page, font, '助言者用紙', CONTENT_LEFT, PAGE_TITLE_BASELINE, {
      size: px(20),
      color: HEADING,
      weight: 'semibold',
      align: 'center',
      width: CONTENT_WIDTH,
    })
    drawText(page, font, sheet.date, CONTENT_LEFT, DATE_BASELINE, {
      size: px(14),
      color: HEADING,
      weight: 'semibold',
      align: 'center',
      width: CONTENT_WIDTH,
    })

    // 残りの高さを件数で等分し、2件目・4件目…に縞を敷く
    const itemHeight = (ITEMS_BOTTOM - ITEMS_TOP) / Math.max(sheet.items.length, 1)
    sheet.items.forEach((item, i) => {
      const top = ITEMS_TOP + i * itemHeight
      if (i % 2 === 1) fillRect(page, CONTENT_LEFT, top, CONTENT_WIDTH, itemHeight, STRIPE)
      drawItem(page, font, item, top)
    })
  }

  if (model.pages.length === 0) {
    const page = addA4Page(pdf)
    drawText(page, font, '対象期間に課題のあるプログラムがありません。', CONTENT_LEFT, ITEMS_TOP, { size: 11 })
  }

  return pdf.doc.save()
}
