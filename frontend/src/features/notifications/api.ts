import { useQuery } from '@tanstack/react-query'
import { apiGet, apiPost } from '../../api/client'
import { refreshSessionQuiet } from '../../app/session'
import { useApp } from '../../app/store'

export type AppNotification = {
  id: number
  kind: string
  body: string
  payload: Record<string, unknown> | null
  read_at: string | null
  created_at: string
}

/**
 * Список уведомлений. Каждое открытие вкладки перечитывает список,
 * затем помечает всё прочитанным и тихо обновляет сессию (счётчик на вкладке).
 */
export function useNotifications() {
  const platform = useApp((s) => s.platform)
  const appUserId = useApp((s) => s.appUserId)
  return useQuery({
    queryKey: ['notifications', appUserId],
    refetchOnMount: 'always',
    queryFn: async () => {
      const data = await apiGet<{ notifications?: AppNotification[]; unread_count?: number }>(
        platform,
        `/api/notifications?telegram_id=${encodeURIComponent(String(appUserId))}&limit=40`,
      )
      void (async () => {
        await apiPost(platform, '/api/notifications/read', { telegram_id: appUserId, read_all: true }).catch(() => {})
        await refreshSessionQuiet()
      })()
      return data.notifications ?? []
    },
  })
}
