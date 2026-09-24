import type { ReactNode } from 'react'

export type TabItem = { key: string; label: string; icon: ReactNode; count?: number }

/** Нижняя панель вкладок (legacy `tabBar`). */
export function TabBar({ tabs, active, onSelect }: { tabs: TabItem[]; active: string; onSelect: (key: string) => void }) {
  return (
    <div className="tab">
      {tabs.map((t) => (
        <button key={t.key} className={`tb${t.key === active ? ' on' : ''}`} onClick={() => onSelect(t.key)}>
          <span style={{ position: 'relative' }}>
            {t.icon}
            {(t.count ?? 0) > 0 && <span className="dot">{t.count}</span>}
          </span>
          {t.label}
        </button>
      ))}
    </div>
  )
}
