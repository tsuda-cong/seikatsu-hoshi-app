import {
  degrees,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setCharacterSqueeze,
  setLineWidth,
  setStrokingColor,
  setTextRenderingMode,
  TextRenderingMode,
  PDFDocument,
  type PDFFont,
  type PDFPage,
  type RGB,
} from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

// 帳票をPDFで描くための共通部品。ブラウザ固有の機能(fetchなど)は使わないので、
// 確認用にNodeからもそのまま呼べる。
//
// 座標は、画面や測った数値と合わせやすいよう「左上が原点・下向きが正」のpt単位で扱い、
// PDF本来の「左下が原点」への変換はここで吸収する。
//
// 以前の帳票はWebページをブラウザに印刷させていたため、iPhone・iPadでは画面の幅に合わせて
// 組み直されて崩れ、iOS 27からはホーム画面のアプリで印刷自体ができなくなった。
// PDFなら寸法も字形も固定されるので、どの端末から出してもPCで出していたものと同じになる。
// 寸法は、PCで出したPDF(游ゴシック UI)から実測した値を使っている。

export const A4_WIDTH = 595.28
export const A4_HEIGHT = 841.89

// 印刷領域。以前の帳票の余白(上下7mm・左右6mm)を、ブラウザが0.75pt単位に丸めた結果を
// PCで出したPDFから実測した値。4つの帳票で共通
export const CONTENT_LEFT = 17.25
export const CONTENT_WIDTH = 561.75
export const CONTENT_RIGHT = CONTENT_LEFT + CONTENT_WIDTH
export const CONTENT_TOP = 19.5
export const CONTENT_BOTTOM = A4_HEIGHT - 19.5

/** mm → pt */
export const mm = (value: number) => (value * 72) / 25.4
/** CSSのpx → pt(96px = 72pt) */
export const px = (value: number) => value * 0.75

/** #rrggbb と、省略形の #rgb(区分の文字色 #fff など)の両方を受け付ける */
export function hex(color: string): RGB {
  let digits = color.replace('#', '')
  if (digits.length === 3) digits = [...digits].map((d) => d + d).join('')
  const n = parseInt(digits, 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

export const BLACK = rgb(0, 0, 0)
export const WHITE = rgb(1, 1, 1)

/**
 * 太さ。日本語フォントを1書体しか埋め込まない(本物の太字書体を足すとPDFが約3MB増える)ので、
 * 太字は文字の輪郭に線を足して作る。PCの帳票が使っていた游ゴシック UIの
 * Semibold(600)とBold(700)に見た目を寄せるための線の太さ(文字サイズに対する比)
 */
export type Weight = 'regular' | 'semibold' | 'bold'
const STROKE_RATIO: Record<Weight, number> = { regular: 0, semibold: 0.03, bold: 0.045 }

export type Align = 'left' | 'right' | 'center'

export interface Pdf {
  doc: PDFDocument
  font: PDFFont
}

/**
 * 文字の並べ方を決める部品(fontkit)が既定で行う「字形の差し替え」を止める。
 *
 * 英字を含む文字列は英語として扱われ、数字が英語向けの字形に差し替わったり(locl)、
 * fi・fl が合字になったり(liga)する。ところが pdf-lib は差し替え先の字形の幅をPDFに
 * 書き込まないため、既定の全角幅で扱われ、「7．「JWヒストリー…」の「7」の後ろに
 * 大きな隙間が空くといった崩れ方をする。差し替えを止めれば、どの文字も本来の字形と幅で
 * 描かれる(英字・数字・かな・記号を混ぜた文字列で、差し替えが0件になることを確認済み)
 */
const NO_SUBSTITUTION = {
  rvrn: false,
  ltra: false,
  ltrm: false,
  frac: false,
  numr: false,
  dnom: false,
  ccmp: false,
  locl: false,
  rlig: false,
  calt: false,
  clig: false,
  liga: false,
  rclt: false,
}

export async function createPdf(fontBytes: ArrayBuffer): Promise<Pdf> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  // pdf-lib の subset:true は一部の文字が描かれなくなる不具合があるため使えない
  // (奉仕報告アプリで確認済み。pdf-lib は1.17.1で更新が止まっている)。全文字を埋め込む。
  // embedFont が元のバッファを書き換えないとは限らないので複製を渡す
  const font = await doc.embedFont(fontBytes.slice(0), { subset: false, features: NO_SUBSTITUTION })
  return { doc, font }
}

export function addA4Page(pdf: Pdf): PDFPage {
  return pdf.doc.addPage([A4_WIDTH, A4_HEIGHT])
}

export interface TextOptions {
  size: number
  color?: RGB
  weight?: Weight
  italic?: boolean
  /** align が right/center のときの基準になる箱。left なら x がそのまま書き出し位置 */
  width?: number
  align?: Align
  /** 横方向の縮め具合(1 = そのまま)。fitText が決める */
  squeeze?: number
}

export function textWidth(font: PDFFont, text: string, size: number): number {
  return text ? font.widthOfTextAtSize(text, size) : 0
}

/**
 * 1行を描く。y はベースライン(上からの距離)。
 * 文字が欠けても例外にならないフォントなので、呼び出し側で幅を確かめてから渡すこと
 */
export function drawText(page: PDFPage, font: PDFFont, text: string, x: number, y: number, options: TextOptions) {
  if (!text) return
  const { size, color = BLACK, weight = 'regular', italic = false, width = 0, align = 'left', squeeze = 1 } = options
  const w = textWidth(font, text, size) * squeeze
  let left = x
  if (align === 'right') left = x + width - w
  else if (align === 'center') left = x + (width - w) / 2

  const stroke = STROKE_RATIO[weight]
  const needsState = stroke > 0 || squeeze !== 1
  if (needsState) {
    // 線や横幅の設定は drawText の外で積んでおく(drawText は塗りの色しか設定しないので引き継がれる)
    page.pushOperators(pushGraphicsState())
    if (squeeze !== 1) page.pushOperators(setCharacterSqueeze(squeeze * 100))
    if (stroke > 0) {
      page.pushOperators(
        setTextRenderingMode(TextRenderingMode.FillAndOutline),
        setLineWidth(size * stroke),
        setStrokingColor(color),
      )
    }
  }
  page.drawText(text, {
    x: left,
    y: page.getHeight() - y,
    size,
    font,
    color,
    // 日本語の書体には斜体が無いので、ブラウザと同じく傾けて作る
    xSkew: italic ? degrees(12) : undefined,
  })
  if (needsState) page.pushOperators(popGraphicsState())
}

/** 塗りつぶしの矩形。y は上端(上からの距離) */
export function fillRect(page: PDFPage, x: number, y: number, width: number, height: number, color: RGB) {
  page.drawRectangle({ x, y: page.getHeight() - y - height, width, height, color })
}

/** 横線。y は線の中心(上からの距離) */
export function hLine(page: PDFPage, x1: number, x2: number, y: number, thickness: number, color: RGB) {
  const py = page.getHeight() - y
  page.drawLine({ start: { x: x1, y: py }, end: { x: x2, y: py }, thickness, color })
}

// 行頭に来てはいけない文字と、行末に来てはいけない文字(ブラウザの禁則処理に寄せる)
const NO_LINE_START = new Set([...'、。，．,.）)」』】〕〉》］]｝}’”ーぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ・：；:;！？!?'])
const NO_LINE_END = new Set([...'（(「『【〔〈《［[｛{‘“'])

/**
 * 幅に収まるよう折り返す。日本語なので1文字単位で区切り、簡単な禁則処理をする。
 * 2行目以降だけ幅を変えたいとき(ぶら下げインデント)は restWidth を渡す
 */
export function wrapText(font: PDFFont, text: string, size: number, width: number, restWidth = width): string[] {
  if (!text) return ['']
  const chars = [...text]
  const lines: string[] = []
  let line = ''
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i]
    const limit = lines.length === 0 ? width : restWidth
    if (line && textWidth(font, line + ch, size) > limit) {
      let carry = ''
      // 行頭禁則: 次の行の頭に来てはいけない文字は、今の行に押し込む(少しはみ出すのはブラウザと同じ)
      if (NO_LINE_START.has(ch)) {
        line += ch
        continue
      }
      // 行末禁則: 開き括弧で終わるなら、次の行へ送る(行が空になる場合は送らない)
      while ([...line].length > 1 && NO_LINE_END.has([...line].at(-1)!)) {
        const last = [...line].at(-1)!
        carry = last + carry
        line = [...line].slice(0, -1).join('')
      }
      lines.push(line)
      line = carry + ch
    } else {
      line += ch
    }
  }
  lines.push(line)
  return lines
}

/**
 * PCで出していたときに1行に収まっていたものは、1行のまま出すための折り返し。
 *
 * Noto Sans JP のかなは、PCの帳票が使っていた游ゴシック UIより最大15%ほど広い。
 * そのまま折り返すと、PCでは1行だった題名が2行になり、行の高さも変わってしまう。
 * そこで、少しだけはみ出す程度なら折り返さずに横方向に縮めて1行に収める。
 * 縮めても入らない(=PCでも折り返していたはずの)長さなら、普通に折り返す。
 */
export const MAX_SQUEEZE = 0.87

export interface FittedText {
  lines: string[]
  squeeze: number
}

export function fitText(font: PDFFont, text: string, size: number, width: number, restWidth = width): FittedText {
  const w = textWidth(font, text, size)
  if (w <= width) return { lines: [text], squeeze: 1 }
  if (w * MAX_SQUEEZE <= width) return { lines: [text], squeeze: width / w }
  return { lines: wrapText(font, text, size, width, restWidth), squeeze: 1 }
}

/** 折り返さない欄(時間など)。入りきらなければ横方向に縮める */
export function squeezeToWidth(font: PDFFont, text: string, size: number, width: number): number {
  const w = textWidth(font, text, size)
  return w > width ? width / w : 1
}
