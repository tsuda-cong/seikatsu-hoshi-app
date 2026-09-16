// 帳票PDFに埋め込むフォントを読み込む(ブラウザ用)。
// 5MB超あるので、帳票を開き直すたびに取り直さないよう、読み込んだものを使い回す。
// ファイルの中身については scripts/bake-palt-font.py を参照。

const FONT_URL = `${import.meta.env.BASE_URL}fonts/NotoSansJP-Palt-v1.ttf`

let cache: Promise<ArrayBuffer> | undefined

export function loadReportFont(): Promise<ArrayBuffer> {
  if (!cache) {
    cache = fetch(FONT_URL).then((response) => {
      if (!response.ok) throw new Error(`フォントを読み込めませんでした(${response.status})`)
      return response.arrayBuffer()
    })
    // 失敗したときは、次に開いたときに取り直せるようにする
    cache.catch(() => {
      cache = undefined
    })
  }
  return cache
}
