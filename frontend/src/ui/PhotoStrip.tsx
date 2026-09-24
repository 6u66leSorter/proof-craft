import { useApp } from '../app/store'
import type { PhotoItem } from '../domain/homework'
import { AuthImg } from './AuthImg'

/** Лента снимков работы; тап открывает просмотр (legacy `renderHomeworkPhotoStrip`). */
export function PhotoStrip({ items }: { items: PhotoItem[] }) {
  if (!items.length) return null
  const width = items.length === 1 ? '100%' : '85%'
  const hint = items.length > 1 ? `← листайте · ${items.length} фото · нажмите, чтобы открыть →` : 'нажмите, чтобы открыть'
  const open = (index: number) => useApp.getState().patch({ lightbox: { items, index } })
  return (
    <>
      <div
        style={{
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          paddingBottom: 8,
          marginBottom: 8,
          WebkitOverflowScrolling: 'touch',
          scrollSnapType: 'x mandatory',
        }}
      >
        {items.map((item, i) => (
          <AuthImg
            key={item.preview}
            src={item.preview}
            alt={`Фото ${i + 1}`}
            onClick={() => open(i)}
            style={{
              width,
              flexShrink: 0,
              borderRadius: 16,
              border: '1.5px solid var(--border)',
              objectFit: 'cover',
              maxHeight: 280,
              scrollSnapAlign: 'start',
              boxShadow: 'var(--glow)',
              cursor: 'zoom-in',
            }}
          />
        ))}
      </div>
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: 'var(--gold)', fontFamily: 'var(--font-body)', fontWeight: 700, letterSpacing: '.5px' }}>
          {hint}
        </span>
      </div>
    </>
  )
}
