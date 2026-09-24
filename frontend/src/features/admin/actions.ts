import type { QueryClient } from '@tanstack/react-query'
import { apiPost } from '../../api/client'
import { refreshSessionQuiet } from '../../app/session'
import { useApp } from '../../app/store'
import { toast } from '../../ui/toast'
import { adminKeys } from './api'

const message = (error: unknown) => (error instanceof Error && error.message) || 'Ошибка'
const post = (path: string, body: Record<string, unknown>) =>
  apiPost(useApp.getState().platform, path, { telegram_id: useApp.getState().appUserId, ...body })

/** Одобрить или отклонить ученика на модерации (legacy `adminSetStudentStatus`). */
export async function setStudentStatus(queryClient: QueryClient, studentId: number, action: 'approve' | 'reject', teacherIds: number[] = []) {
  try {
    await post('/api/admin/students', {
      student_id: studentId,
      action,
      ...(action === 'approve' && teacherIds.length ? { teacher_ids: teacherIds } : {}),
    })
    toast('Готово')
    await queryClient.invalidateQueries({ queryKey: adminKeys.moderation() })
    await refreshSessionQuiet()
  } catch (error) {
    toast(message(error))
  }
}

export async function reviewTeacherApplication(queryClient: QueryClient, applicationId: number, action: 'approve' | 'reject') {
  try {
    await post('/api/admin/teacher-applications', { application_id: applicationId, action })
    toast('Готово')
    await queryClient.invalidateQueries({ queryKey: adminKeys.moderation() })
  } catch (error) {
    toast(message(error))
  }
}

export async function reviewProfileEdit(queryClient: QueryClient, editId: number, action: 'approve' | 'reject') {
  try {
    await post(`/api/admin/profile-edits/${editId}`, { action })
    toast(action === 'approve' ? 'Изменения одобрены' : 'Заявка отклонена')
    await queryClient.invalidateQueries({ queryKey: adminKeys.moderation() })
  } catch (error) {
    toast(message(error))
  }
}

export type StudentSettings = { lessons: string; track: string; teacherIds: number[] }

/** Сохранить занятия, категорию и преподавателей ученика (legacy `submitAdminStudentInline`). */
export async function saveStudentSettings(queryClient: QueryClient, studentId: number, settings: StudentSettings) {
  const lessons = settings.lessons.trim()
  try {
    await post('/api/admin/update-student', {
      student_id: studentId,
      lessons_count: lessons === '' ? undefined : Number(lessons),
      student_track: settings.track || undefined,
      teacher_ids: settings.track === 'barber' ? [] : settings.teacherIds,
    })
    toast(settings.track === 'barber' ? 'Барбер: привязка к преподавателям снята' : 'Сохранено')
    useApp.getState().patch({ adminEditOpenId: null })
    await queryClient.invalidateQueries({ queryKey: adminKeys.students() })
    await refreshSessionQuiet()
  } catch (error) {
    toast(message(error))
  }
}

export function openAdminStudent(studentId: number) {
  useApp.getState().patch({ adminStudentId: studentId, teacherStudentId: null })
  useApp.getState().go('admin-student')
}

export function openAdminChat(studentId: number, fullName: string) {
  useApp.getState().patch({ selectedStudent: { id: studentId, full_name: fullName } })
  useApp.getState().go('admin-chat')
}
