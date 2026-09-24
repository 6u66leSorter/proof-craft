import type { ReactNode } from 'react'
import { ICO } from './icons'

type HeaderProps = {
  title: string
  onBack?: () => void
  right?: ReactNode
}

/** Шапка экрана (legacy `hdr()`): без «назад» и правого слота на их месте стоят распорки 24px. */
export function Header({ title, onBack, right }: HeaderProps) {
  return (
    <div className="hdr">
      {onBack ? (
        <button className="hdr-btn" onClick={onBack} aria-label="Назад" title="Назад">
          {ICO.back}
        </button>
      ) : (
        <span style={{ width: 24 }} />
      )}
      <h2>{title}</h2>
      {right ?? <span style={{ width: 24 }} />}
    </div>
  )
}
