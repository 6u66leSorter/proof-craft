import { apiGet, apiPost } from '../api/client'
import type { Session, WebAuthSession } from '../api/types'
import { detectPlatform } from '../platform/detect'
import { STORAGE_KEYS, local, session as sessionStore } from '../platform/storage'
import { useApp } from './store'

/**
 * Определение платформы, сессии и стартового экрана — перенос legacy `bootstrap()`.
 * Dev-only режимы `?preview=…` намеренно не переносятся: демо-данные будут обеспечены MSW.
 */
export async function bootstrap() {
  const app = useApp.getState()
  app.patch({ error: '' })
  const pageParams = new URLSearchParams(window.location.search)

  const platform = await detectPlatform()
  app.patch({ platform, appUserId: platform.appUserId })

  // Публичная витрина не требует Telegram, VK или учётной записи.
  if (pageParams.get('guest') === '1') {
    app.replace('guest', { isGuestMode: true, stack: [] })
    return
  }

  let appUserId = platform.appUserId
  if (!appUserId && platform.webSessionToken) {
    try {
      const web = await apiGet<WebAuthSession>(platform, '/api/web-auth/session')
      appUserId = web.telegram_id
      platform.appUserId = appUserId
    } catch {
      local.remove(STORAGE_KEYS.webSession)
      platform.webSessionToken = null
    }
    app.patch({ platform: { ...platform }, appUserId })
  }

  if (!appUserId) {
    app.replace('web-login', { stack: [] })
    return
  }

  try {
    const session = await apiGet<Session>(platform, `/api/session?telegram_id=${encodeURIComponent(appUserId)}`)
    app.patch({ session })

    if (session?.hasUser) {
      sessionStore.remove(STORAGE_KEYS.guest)
      app.patch({ isGuestMode: false })
    }
    const resumeGuest = sessionStore.get(STORAGE_KEYS.guest) === '1'

    if (!session?.hasUser && resumeGuest) {
      app.replace('guest', {
        isGuestMode: true,
        tab: null,
        registerRole: null,
        registerTab: 'reg',
        teacherApplicationSent: false,
        stack: [],
      })
      return
    }

    if (!session?.hasUser) {
      app.patch({ tab: null, registerRole: null, registerTab: 'reg', teacherApplicationSent: false, isGuestMode: false })
      useApp.getState().go('register-role')
      return
    }

    if (pageParams.get('feedback') === '1' && session.student) {
      app.patch({ tab: 'home', scr: 'student' })
      useApp.getState().go('feedback')
    } else if (session.isAdmin) {
      app.patch({ tab: 'pending' })
      useApp.getState().go('admin')
    } else if (session.isTeacher) {
      app.patch({ tab: 'profile' })
      useApp.getState().go('teacher')
    } else {
      app.patch({ tab: 'home' })
      useApp.getState().go('student')
    }
  } catch (error) {
    app.patch({ error: error instanceof Error && error.message ? error.message : 'Не удалось загрузить данные' })
    useApp.getState().go('error')
  }
}

/** Выход: сброс web-сессии, гостевого режима и навигации (legacy `logout`). */
export function logout() {
  const { platform } = useApp.getState()
  if (platform?.webSessionToken) {
    void apiPost(platform, '/api/web-auth/logout', {}).catch(() => {})
    local.remove(STORAGE_KEYS.webSession)
  }
  sessionStore.remove(STORAGE_KEYS.guest)
  useApp.getState().patch({
    session: null,
    error: '',
    stack: [],
    tab: null,
    selectedStudent: null,
    selectedHomework: null,
    selectedAdminTeacher: null,
    registerRole: null,
    registerTab: 'reg',
    teacherApplicationSent: false,
    isGuestMode: false,
  })
  useApp.getState().go('loading')
  void bootstrap()
}

/** Повторная попытка после ошибки (legacy `__ba_retry`). */
export function retry() {
  useApp.getState().go('loading')
  void bootstrap()
}
