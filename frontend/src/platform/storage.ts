/** Ключи localStorage совпадают с исходным клиентом: тема, гостевой режим и web-сессия сохраняются у существующих пользователей. */
export const STORAGE_KEYS = {
  guest: 'ba_guest_mode',
  webSession: 'ba_web_session',
  theme: 'ba_theme',
} as const

const safe = <T>(fn: () => T, fallback: T): T => {
  try {
    return fn()
  } catch {
    return fallback
  }
}

export const local = {
  get: (key: string) => safe(() => localStorage.getItem(key), null),
  set: (key: string, value: string) => safe(() => localStorage.setItem(key, value), undefined),
  remove: (key: string) => safe(() => localStorage.removeItem(key), undefined),
}

export const session = {
  get: (key: string) => safe(() => sessionStorage.getItem(key), null),
  remove: (key: string) => safe(() => sessionStorage.removeItem(key), undefined),
}
