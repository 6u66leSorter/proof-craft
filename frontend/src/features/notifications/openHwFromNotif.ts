import { apiPost } from '../../api/client'
import type { QueryClient } from '@tanstack/react-query'
import { refreshSessionQuiet } from '../../app/session'
import { useApp } from '../../app/store'
import { toast } from '../../ui/toast'
import { fetchStudentHomeworks } from '../student/api'
import type { AppNotification } from './api'

/** Открыть работу из уведомления (legacy `openHwFromNotif`, ветка ученика). */
export async function openHwFromNotif(queryClient: QueryClient, notification: AppNotification, homeworkId: number) {
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
  }
}
