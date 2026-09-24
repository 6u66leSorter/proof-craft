import { studentAvatarUrl } from '../api/files'
import { AuthImg } from './AuthImg'

/** Фото ученика поверх круга с инициалами; ничего, если аватара нет. */
export function StudentAvatarImg({ student, rounded = true }: { student: { id: number; full_name: string; has_avatar: boolean }; rounded?: boolean }) {
  if (!student.has_avatar || student.id == null) return null
  const name = String(student.full_name || '').trim() || 'ученика'
  return (
    <AuthImg
      src={studentAvatarUrl(student.id)}
      alt={`Фото ${name}`}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', ...(rounded ? { borderRadius: '50%' } : {}) }}
    />
  )
}
