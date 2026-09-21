import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

/** これ以上横に動かしたらめくる */
const SWIPE_THRESHOLD = 60
/** 縦の動きよりこれだけ横が大きいときだけ、ページ送りの操作とみなす(縦スクロールを邪魔しない) */
const DIRECTION_RATIO = 1.5
/** 横か縦かを決めるまでに必要な動き */
const DECIDE_DISTANCE = 10
/** 画面の左右この幅から始まったスワイプは無視する(iOSの「前に戻る」と取り合いになるため) */
const EDGE_IGNORE = 20
/** 最初・最後の週で引っ張れる量。これ以上は動かない */
const RUBBER_MAX = 60
/** めくる動きにかける時間(ミリ秒) */
const SLIDE_MS = 160

interface WeekPagerProps {
  hasPrev: boolean
  hasNext: boolean
  onPrev: () => void
  onNext: () => void
  /** 編集中など、スワイプを効かせたくないとき false にする(ボタンは使える) */
  swipeEnabled?: boolean
  children: ReactNode
}

/**
 * 週ごとのプログラムを、紙をめくるように前後の週へ送るための枠。
 *
 * - 左右のボタン: マウスのある端末にだけ出す(CSSの hover/pointer で判定)。
 *   スマホ・タブレットはスワイプで送るので、画面を狭めるボタンは出さない
 * - スワイプ: 右へ払うと前の週、左へ払うと次の週(紙をめくる向き)
 * - マウスのドラッグとキーボードでの送りは入れていない(文字の選択と取り合いになるため)
 */
export function WeekPager({ hasPrev, hasNext, onPrev, onNext, swipeEnabled = true, children }: WeekPagerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  // 動かす量(px)と、その動きをなめらかに見せるかどうか。
  // 指に追従している間は補間せず、めくるときだけ補間する
  const [slide, setSlide] = useState<{ offset: number; animate: boolean }>({ offset: 0, animate: false })
  // めくっている最中は次の操作を受け付けない
  const busyRef = useRef(false)

  const commit = useCallback(
    (direction: 1 | -1) => {
      // direction: 1 = 前の週(中身は右へ出ていく) / -1 = 次の週(中身は左へ出ていく)
      if (busyRef.current) return
      if (direction === 1 ? !hasPrev : !hasNext) return
      busyRef.current = true
      const width = containerRef.current?.offsetWidth ?? window.innerWidth

      setSlide({ offset: direction * width, animate: true })
      window.setTimeout(() => {
        if (direction === 1) onPrev()
        else onNext()
        // 反対側に置き直してから戻すことで、入ってくるように見せる
        setSlide({ offset: -direction * width, animate: false })
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            setSlide({ offset: 0, animate: true })
            busyRef.current = false
          }),
        )
      }, SLIDE_MS)
    },
    [hasPrev, hasNext, onPrev, onNext],
  )

  // 指の操作。縦スクロールを止める必要があるので、Reactの onTouchMove ではなく
  // passive: false で直に登録する(Reactの登録では preventDefault が効かない)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    let startX = 0
    let startY = 0
    let tracking = false
    let decided = false
    let horizontal = false

    function handleStart(e: TouchEvent) {
      if (!swipeEnabled || busyRef.current || e.touches.length !== 1) return
      const touch = e.touches[0]
      if (touch.clientX < EDGE_IGNORE || touch.clientX > window.innerWidth - EDGE_IGNORE) return
      const target = e.target as HTMLElement | null
      // 入力中の欄の上と、候補の一覧が開いている間は送らない
      if (target?.closest('input, textarea, select')) return
      if (document.querySelector('.candidate-list')) return
      tracking = true
      decided = false
      horizontal = false
      startX = touch.clientX
      startY = touch.clientY
    }

    function handleMove(e: TouchEvent) {
      if (!tracking) return
      const touch = e.touches[0]
      const dx = touch.clientX - startX
      const dy = touch.clientY - startY

      if (!decided) {
        if (Math.abs(dx) < DECIDE_DISTANCE && Math.abs(dy) < DECIDE_DISTANCE) return
        decided = true
        horizontal = Math.abs(dx) > Math.abs(dy) * DIRECTION_RATIO
        if (!horizontal) {
          tracking = false
          return
        }
      }

      // 横に送ると決まったので、画面の縦スクロールは止める
      e.preventDefault()
      const allowed = dx > 0 ? hasPrev : hasNext
      // 行き止まりの向きへは、少しだけ動いて戻る(これ以上進めないことが手で分かる)
      const offset = allowed ? dx : Math.sign(dx) * Math.min(RUBBER_MAX, Math.abs(dx) / 3)
      setSlide({ offset, animate: false })
    }

    function handleEnd() {
      if (!tracking) return
      tracking = false
      if (!horizontal) return
      setSlide((current) => {
        if (Math.abs(current.offset) >= SWIPE_THRESHOLD) {
          const direction = current.offset > 0 ? 1 : -1
          if (direction === 1 ? hasPrev : hasNext) {
            // 指を離した位置から続けてめくる
            queueMicrotask(() => commit(direction))
            return current
          }
        }
        return { offset: 0, animate: true }
      })
    }

    el.addEventListener('touchstart', handleStart, { passive: true })
    el.addEventListener('touchmove', handleMove, { passive: false })
    el.addEventListener('touchend', handleEnd)
    el.addEventListener('touchcancel', handleEnd)
    return () => {
      el.removeEventListener('touchstart', handleStart)
      el.removeEventListener('touchmove', handleMove)
      el.removeEventListener('touchend', handleEnd)
      el.removeEventListener('touchcancel', handleEnd)
    }
  }, [swipeEnabled, hasPrev, hasNext, commit])

  return (
    <div className="week-pager" ref={containerRef}>
      {/* ボタンはマウスのある端末にだけ出す(CSS側で判定)。ふだんは薄く、近づくとはっきりする */}
      <button
        type="button"
        className="week-pager-button is-prev"
        aria-label="前の週"
        disabled={!hasPrev}
        onClick={() => commit(1)}
      >
        〈
      </button>
      <button
        type="button"
        className="week-pager-button is-next"
        aria-label="次の週"
        disabled={!hasNext}
        onClick={() => commit(-1)}
      >
        〉
      </button>
      <div
        className="week-pager-content"
        style={{
          transform: `translate3d(${slide.offset}px, 0, 0)`,
          transition: slide.animate ? `transform ${SLIDE_MS}ms ease-out` : 'none',
        }}
      >
        {children}
      </div>
    </div>
  )
}
