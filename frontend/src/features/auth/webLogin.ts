import { apiGet, apiPost } from '../../api/client'
import { bootstrap } from '../../app/bootstrap'
import { useApp, WEB_LOGIN_IDLE } from '../../app/store'
import { STORAGE_KEYS, local } from '../../platform/storage'

type StartResponse = { token: string; handoff_url: string; expires_in_seconds?: number }
type StatusResponse = { status: string; session_token?: string }

const standalone = { platform: 'standalone' as const }
const setLogin = (webLogin: ReturnType<typeof useApp.getState>['webLogin']) => useApp.getState().patch({ webLogin })

/**
 * Вход на сайт: одноразовый запрос, подтверждение в Telegram/VK во внешней вкладке
 * и опрос статуса до выдачи web-сессии.
 */
export async function startWebsiteLogin(provider: 'telegram' | 'vk') {
  setLogin({ status: 'starting', error: '', provider, token: null })
  try {
    const data = await apiPost<StartResponse>(standalone, '/api/web-auth/start', { provider })
    setLogin({ status: 'waiting', error: '', provider, token: data.token })
    window.open(data.handoff_url, '_blank', 'noopener')
    const until = Date.now() + Number(data.expires_in_seconds || 900) * 1000
    const poll = async () => {
      if (Date.now() >= until || useApp.getState().webLogin.token !== data.token) {
        setLogin({ status: 'expired', error: 'Время подтверждения истекло. Начните вход ещё раз.', provider: null, token: null })
        return
      }
      try {
        const result = await apiGet<StatusResponse>(standalone, `/api/web-auth/status?token=${encodeURIComponent(data.token)}`)
        if (result.status === 'approved' && result.session_token) {
          local.set(STORAGE_KEYS.webSession, result.session_token)
          setLogin(WEB_LOGIN_IDLE)
          await bootstrap()
          return
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : ''
        if (message.includes('истекло')) {
          setLogin({ status: 'expired', error: message, provider: null, token: null })
          return
        }
      }
      setTimeout(poll, 2500)
    }
    setTimeout(poll, 1200)
  } catch (error) {
    setLogin({
      status: 'error',
      error: (error instanceof Error && error.message) || 'Не удалось начать вход.',
      provider: null,
      token: null,
    })
  }
}

export const cancelWebsiteLogin = () => setLogin(WEB_LOGIN_IDLE)
