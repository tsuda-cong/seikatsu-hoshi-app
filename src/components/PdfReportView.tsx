import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

// 帳票をPDFとして表示する画面の共通部分。奉仕報告アプリと同じ動きにしている。
//
// 以前はWebページとして帳票を出し、ブラウザの印刷機能(window.print)で印刷していた。
// その方式では、iPhone・iPadで画面の幅に合わせてレイアウトが崩れ、iOS 27からは
// ホーム画面のアプリで印刷ボタン自体が効かなくなった。PDFにして端末のPDFビューアに渡せば、
// どの端末からでもPCと同じA4の帳票になり、印刷や保存もそこから行える。

export function PdfReportView({
  title,
  fileName,
  backTo,
  build,
}: {
  title: string
  fileName: string
  backTo: string
  /** PDFを組み立てる。null のあいだは待つ(データの読み込み中など) */
  build: (() => Promise<Uint8Array>) | null
}) {
  // 帳票印刷以外の画面(週ごとのプログラムなど)から開いたときは、そこへ戻す。
  // リンクに ?back=/ のように添えてある。アプリの中の行き先だけを受け取る
  const [searchParams] = useSearchParams()
  const requestedBack = searchParams.get('back')
  const isInAppPath = !!requestedBack && requestedBack.startsWith('/') && !requestedBack.startsWith('//')
  const backLink = isInAppPath ? requestedBack : backTo

  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!build) return
    // 条件が続けて変わったときに、古い組み立ての結果で上書きしないようにする
    let cancelled = false
    let objectUrl: string | null = null
    setPdfUrl(null)
    setError(null)

    build()
      .then((bytes) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
        setPdfUrl(objectUrl)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'PDFの作成に失敗しました')
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [build])

  return (
    <div className="pdf-print-page">
      <div className="print-toolbar">
        <Link to={backLink}>← 戻る</Link>
        {pdfUrl && (
          <a href={pdfUrl} download={fileName}>
            ダウンロード
          </a>
        )}
      </div>
      {error ? (
        <div className="center-message error-text">{error}</div>
      ) : pdfUrl ? (
        <iframe src={pdfUrl} className="pdf-frame" title={title} />
      ) : (
        <div className="center-message">PDFを作成中...</div>
      )}
    </div>
  )
}
