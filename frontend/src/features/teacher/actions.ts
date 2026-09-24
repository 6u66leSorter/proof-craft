import { apiPost } from '../../api/client'
import { useApp } from '../../app/store'
import { toast } from '../../ui/toast'

/** Открыть карточку ученика у преподавателя (legacy `__ba_openTeacherStudent`). */
export function openTeacherStudent(id: number, fullName: string) {
  const student = { id, full_name: fullName }
  useApp.getState().patch({ selectedStudent: student, teacherStudentId: id })
  useApp.getState().go('t-student', { student })
}

/** Чат с учеником (legacy `__ba_teacherOpenChat`); имя берётся из открытой карточки. */
export function openTeacherChat(id: number, loadedName?: string) {
  const selected = useApp.getState().selectedStudent as { id?: number; full_name?: string } | null
  const name = loadedName || (selected?.id === id ? selected.full_name : '')
  useApp.getState().patch({ selectedStudent: { id, full_name: name || 'Ученик' } })
  useApp.getState().go('teacher-chat')
}

export async function saveTeacherAbout(text: string) {
  const about = text.trim()
  const { platform, appUserId } = useApp.getState()
  try {
    await apiPost(platform, '/api/teacher/about', { telegram_id: appUserId, about_me: about })
    const { session } = useApp.getState()
    if (session?.teacher) useApp.getState().patch({ session: { ...session, teacher: { ...session.teacher, about_me: about } } })
    toast('Сохранено')
  } catch (error) {
    toast((error instanceof Error && error.message) || 'Не удалось сохранить')
  }
}
