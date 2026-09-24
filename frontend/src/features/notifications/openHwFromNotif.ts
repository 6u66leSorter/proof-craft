import { apiPost } from '../../api/client'
import type { QueryClient } from '@tanstack/react-query'
import { refreshSessionQuiet } from '../../app/session'
import { useApp } from '../../app/store'
import { toast } from '../../ui/toast'
import { adminKeys, fetchAdminStudentProfile } from '../admin/api'
import { fetchStudentHomeworks } from '../student/api'
import { fetchTeacherStudentHomeworks, teacherStudentHomeworksKey, type TeacherStudent } from '../teacher/api'
import type { AppNotification } from './api'

/** Открыть работу из уведомления. */
export async function openHwFromNotif(queryClient: QueryClient, notification: AppNotification, homeworkId: number, studentId: number) {
  const { platform, appUserId, session } = useApp.getState()
  if (notification.id > 0) {
    await apiPost(platform, '/api/notifications/read', { telegram_id: appUserId, notification_id: notification.id }).catch(() => {})
  }
  await refreshSessionQuiet()
  if (!homeworkId) {
    toast('Не удалось открыть задание')
    return
  }
  if (session?.student) {
    const homeworks = await queryClient.fetchQuery({ queryKey: ['student', 'homeworks', appUserId], queryFn: fetchStudentHomeworks })
    const hw = homeworks.find((x) => Number(x.id) === homeworkId)
    if (!hw) {
      toast('Работа не найдена')
      return
    }
    useApp.getState().go('hw-view', { homework: hw })
    return
  }
  if (session?.isTeacher) {
    if (!studentId) {
      toast('Нет данных об ученике')
      return
    }
    const known = queryClient.getQueryData<TeacherStudent[]>(['teacher', 'students', appUserId])?.find((s) => Number(s.id) === studentId)
    useApp.getState().patch({ selectedStudent: { id: studentId, full_name: known?.full_name || 'Ученик' }, teacherStudentId: studentId })
    const data = await queryClient.fetchQuery({
      queryKey: teacherStudentHomeworksKey(studentId),
      queryFn: () => fetchTeacherStudentHomeworks(studentId),
      staleTime: 0,
    })
    if (data.student?.full_name) useApp.getState().patch({ selectedStudent: { id: studentId, full_name: data.student.full_name } })
    const hw = data.homeworks.find((x) => Number(x.id) === homeworkId)
    if (!hw) {
      toast('Работа не найдена')
      return
    }
    useApp.getState().go('hw-view', { homework: hw })
    return
  }
  if (session?.isAdmin) {
    if (!studentId) {
      toast('Нет данных об ученике')
      return
    }
    useApp.getState().patch({ adminStudentId: studentId, teacherStudentId: null })
    const data = await queryClient.fetchQuery({ queryKey: adminKeys.student(studentId), queryFn: () => fetchAdminStudentProfile(studentId), staleTime: 0 })
    const hw = data.homeworks.find((x) => Number(x.id) === homeworkId)
    if (!hw) {
      toast('Работа не найдена')
      return
    }
    useApp.getState().go('hw-view', { homework: hw })
  }
}
