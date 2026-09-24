import { openFile } from '../api/files'
import type { MediaButton } from '../domain/homework'
import { toast } from './toast'

/** Кнопки открытия файлов работы. */
export function MediaButtons({ buttons }: { buttons: MediaButton[] }) {
  if (!buttons.length) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {buttons.map((b) => (
        <button key={b.key} type="button" className={b.primary ? 'btn bf btn-w' : 'btn bs btn-w'} onClick={() => void openFile(b.url, toast)}>
          {b.label}
        </button>
      ))}
    </div>
  )
}
