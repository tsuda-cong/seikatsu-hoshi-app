/**
 * 帳票を開くボタンに添える「用紙」のしるし。
 * 線の色は currentColor なので、明るい配色でも暗い配色でも文字と同じ色になる。
 */
export function DocumentIcon() {
  return (
    <svg
      className="document-icon"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M9.5 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5z" />
      <path d="M9.5 1.5V5H13" />
      <path d="M5.5 8.5h5M5.5 11h3.5" />
    </svg>
  )
}
