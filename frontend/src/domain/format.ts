
export type StudentTrack = 'student' | 'intern' | 'barber'

export const STUDENT_TRACKS: [StudentTrack, string][] = [
  ['student', 'Ученик'],
  ['intern', 'Стажёр'],
  ['barber', 'Барбер'],
]

export const studentTrackRu = (track: string | null | undefined) =>
  ({ student: 'Ученик', intern: 'Стажёр', barber: 'Барбер' })[String(track || '')] || 'Ученик'

export const studentStatusRu = (status: string | null | undefined) =>
  ({ moderation: 'На модерации', studying: 'Обучается', completed: 'Завершил', rejected: 'Отклонён' })[String(status || '')] ||
  String(status || '—')

export const homeworkStatusRu = (status: string | null | undefined) =>
  ({ pending: 'На проверке', approved: 'Принято', rejected: 'Отклонено', revision: 'На доработке' })[String(status || '')] ||
  String(status || '—')

export const initialsFromName = (name: string | null | undefined) => {
  const parts = String(name || '').trim().split(/\s+/u).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

/** Текстовое представление значения: null/undefined → пустая строка. */
export const text = (value: unknown) => String(value ?? '')
