import { apiGet } from '../api/client'
import type { Session } from '../api/types'
import { useApp } from './store'

/** Тихое обновление сессии (счётчик уведомлений, профиль) без смены экрана. */
export async function refreshSessionQuiet() {
  const { platform, appUserId } = useApp.getState()
  try {
    const session = await apiGet<Session>(platform, `/api/session?telegram_id=${encodeURIComponent(String(appUserId))}`)
    useApp.getState().patch({ session })
    if (session?.vk_account_linked) useApp.getState().patch({ vkLinkGenerate: VK_LINK_IDLE })
  } catch {
    // фоновое обновление: ошибка не должна мешать экрану
  }
}

export const VK_LINK_IDLE = { loading: false, token: null, expiresAt: null, error: '' }
