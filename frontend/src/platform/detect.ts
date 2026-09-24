import bridge from '@vkontakte/vk-bridge'
import { apiUrl, buildHeaders } from '../api/client'
import { urlLooksLikeVkMiniApp } from './env'
import { STORAGE_KEYS, local } from './storage'
import { getTelegram } from './telegram'

const VK_ID_OFFSET = 10_000_000_000
const VK_BRIDGE_TIMEOUT_MS = 5000

const withTimeout = <T>(promise: Promise<T>, ms: number) =>
  Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('VK Bridge timeout')), ms))])

export type Platform = {
  platform: 'telegram' | 'vk' | 'standalone'
  appUserId: number | null
  vkUserId: number | null
  launchParams: string | null
  webSessionToken?: string | null
}

export async function detectPlatform(): Promise<Platform> {
  const url = new URL(window.location.href)
  const params = url.searchParams
  const tg = getTelegram()

  // Сначала Telegram: есть initData — всегда он (один билд для TG и VK).
  if (tg?.initData) {
    const id = Number(tg.initDataUnsafe?.user?.id || 0)
    return { platform: 'telegram', appUserId: id > 0 ? id : null, vkUserId: null, launchParams: null }
  }

  if (urlLooksLikeVkMiniApp(window.location.href)) {
    const vkUserId = Number(params.get('vk_user_id') || 0)
    let realVkUserId: number | null = vkUserId > 0 ? vkUserId : null
    // Вне VK (обычный браузер с vk_* в URL) bridge.send не отвечает никогда — не вызываем его,
    // а внутри VK страхуемся таймаутом, чтобы не зависнуть на экране загрузки.
    if (bridge.isEmbedded()) {
      try {
        await withTimeout(bridge.send('VKWebAppInit'), VK_BRIDGE_TIMEOUT_MS)
        const vkUser = await withTimeout(bridge.send('VKWebAppGetUserInfo'), VK_BRIDGE_TIMEOUT_MS)
        if (vkUser?.id) realVkUserId = Number(vkUser.id)
      } catch {
        // bridge не ответил — остаёмся на vk_user_id из URL
      }
    }
    const launchParams = window.location.search.startsWith('?') ? window.location.search.slice(1) : window.location.search
    const platform: Platform = {
      platform: 'vk',
      appUserId: realVkUserId ? VK_ID_OFFSET + realVkUserId : null,
      vkUserId: realVkUserId,
      launchParams: launchParams || null,
    }
    const webLoginToken = params.get('web_login')
    if (webLoginToken && realVkUserId) {
      try {
        const response = await fetch(apiUrl(`/api/web-auth/confirm/vk?token=${encodeURIComponent(webLoginToken)}`), {
          method: 'POST',
          headers: buildHeaders(platform),
        })
        if (response.ok) document.body.dataset.baWebLoginConfirmed = '1'
      } catch {
        // пользователь всё ещё может войти обычным запуском VK Mini App
      }
    }
    return platform
  }

  return {
    platform: 'standalone',
    appUserId: null,
    vkUserId: null,
    launchParams: null,
    webSessionToken: local.get(STORAGE_KEYS.webSession),
  }
}
