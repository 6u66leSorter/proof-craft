import { useEffect, useRef } from 'react'
import { openFile } from '../api/files'
import { useApp } from '../app/store'
import { AuthImg } from './AuthImg'
import { ICO } from './icons'
import { toast } from './toast'

const close = () => useApp.getState().patch({ lightbox: null })

const step = (delta: number) => {
  const lb = useApp.getState().lightbox
  if (!lb || lb.items.length < 2) return
  const total = lb.items.length
  useApp.getState().patch({ lightbox: { ...lb, index: (lb.index + delta + total) % total } })
}

const arrowStyle = {
  position: 'absolute',
  top: '50%',
  transform: 'translateY(-50%)',
  width: 44,
  height: 44,
  padding: 0,
  borderRadius: '50%',
  background: 'rgba(255,255,255,.12)',
  border: 'none',
  color: '#fff',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: 0,
} as const

/** Клавиатура для просмотра фото: Esc, ←, → (legacy глобальный keydown). */
export function useLightboxKeys() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!useApp.getState().lightbox) return
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        step(-1)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        step(1)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
}

/** Полноэкранный просмотр фото (legacy `renderLightbox`). */
export function Lightbox() {
  const lb = useApp((s) => s.lightbox)
  const touchStartX = useRef<number | null>(null)
  if (!lb || !lb.items.length) return null
  const total = lb.items.length
  const i = Math.min(Math.max(0, lb.index), total - 1)
  const item = lb.items[i]
  const swipe =
    total > 1
      ? {
          onTouchStart: (event: React.TouchEvent) => {
            touchStartX.current = event.changedTouches[0].clientX
          },
          onTouchEnd: (event: React.TouchEvent) => {
            if (touchStartX.current == null) return
            const dx = event.changedTouches[0].clientX - touchStartX.current
            touchStartX.current = null
            if (Math.abs(dx) > 45) step(dx < 0 ? 1 : -1)
          },
        }
      : {}
  return (
    <div
      id="ba-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Просмотр фотографии"
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
      {...swipe}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 7000,
        background: 'rgba(6,6,6,.94)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
        }}
      >
        <span style={{ color: 'var(--gold)', fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700, letterSpacing: '.5px' }}>
          {total > 1 ? `${i + 1} / ${total}` : 'Фото'}
        </span>
        <button
          type="button"
          aria-label="Закрыть просмотр"
          onClick={close}
          style={{
            background: 'rgba(255,255,255,.12)',
            border: 'none',
            color: '#fff',
            width: 34,
            height: 34,
            borderRadius: '50%',
            fontSize: 20,
            lineHeight: 1,
            cursor: 'pointer',
          }}
        >
          ×
        </button>
      </div>
      <AuthImg
        src={item.full}
        alt={`Фото ${i + 1} из ${total}`}
        style={{ maxWidth: '92%', maxHeight: '76vh', objectFit: 'contain', borderRadius: 10 }}
      />
      {total > 1 && (
        <>
          <button
            type="button"
            aria-label="Предыдущее фото"
            onClick={(event) => {
              event.stopPropagation()
              step(-1)
            }}
            style={{ ...arrowStyle, left: 10 }}
          >
            {ICO.back}
          </button>
          <button
            type="button"
            aria-label="Следующее фото"
            onClick={(event) => {
              event.stopPropagation()
              step(1)
            }}
            style={{ ...arrowStyle, right: 10 }}
          >
            {ICO.forward}
          </button>
        </>
      )}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          void openFile(item.full, toast)
        }}
        style={{
          position: 'absolute',
          bottom: 22,
          background: 'none',
          border: 'none',
          color: 'var(--gold)',
          fontFamily: 'var(--font-body)',
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
          textDecoration: 'underline',
          padding: 8,
        }}
      >
        Открыть оригинал
      </button>
    </div>
  )
}
