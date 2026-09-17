import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// viewer: true を付けた項目だけが閲覧者に見える。
// ここを変えるときは App.tsx の AdminRoute の付け外しも合わせること
// 並びは、ふだんよく開くものから順(割り当て → 確認 → 印刷 → 入力)。
// 名簿より下は、たまにしか触らない設定に近いもの
const NAV_ITEMS = [
  { to: '/', label: '週間プログラム', end: true, viewer: true },
  { to: '/history', label: '担当履歴', viewer: true },
  { to: '/reports', label: '帳票印刷', viewer: true },
  { to: '/talks', label: '講演日付' },
  { to: '/members', label: '名簿' },
  { to: '/program-types', label: 'プログラム種別' },
  { to: '/teaching-points', label: '教励課題' },
  { to: '/songs', label: '歌' },
  { to: '/settings', label: '設定' },
]

export function Layout({ children }: { children: ReactNode }) {
  const { signOut, isAdmin } = useAuth()
  const navItems = isAdmin ? NAV_ITEMS : NAV_ITEMS.filter((item) => item.viewer)
  // 狭い画面ではナビをハンバーガーメニューに畳む。広い画面ではCSS側で常に表示する
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  // 画面を移動したら閉じる(開いたままだと次の画面が隠れてしまう)
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  return (
    <div className="app-shell">
      <header className="app-header">
        <button
          type="button"
          className="app-nav-toggle"
          aria-expanded={menuOpen}
          aria-label="メニュー"
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? '✕' : '☰'}
        </button>
        <nav className={`app-nav ${menuOpen ? 'is-open' : ''}`}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `app-nav-link ${isActive ? 'active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button type="button" className="link-button" onClick={signOut}>
          ログアウト
        </button>
      </header>
      <main>{children}</main>
    </div>
  )
}
