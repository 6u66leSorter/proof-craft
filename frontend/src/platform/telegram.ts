/** Минимальный контракт Telegram WebApp SDK, который использует клиент. */
export type TelegramWebApp = {
  initData: string
  initDataUnsafe?: { user?: { id?: number } }
  safeAreaInset?: { top?: number; bottom?: number }
  ready: () => void
  expand: () => void
  setHeaderColor: (color: string) => void
  setBackgroundColor: (color: string) => void
  BackButton: { show: () => void; hide: () => void; onClick: (cb: () => void) => void; offClick: (cb: () => void) => void }
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp }
  }
}

/** Не кэшировать: SDK может подгрузиться после старта модуля. */
export const getTelegram = (): TelegramWebApp | null => window.Telegram?.WebApp ?? null

export function loadTelegramSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Telegram?.WebApp) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-web-app.js?59'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Не удалось загрузить telegram-web-app.js'))
    document.head.appendChild(script)
  })
}

/** Только настоящий Telegram Mini App (есть initData); в VK WebView и браузере — ничего не делаем. */
export function initTelegramChrome() {
  const tg = getTelegram()
  if (!tg?.initData) return
  try {
    tg.ready()
    tg.expand()
    tg.setHeaderColor('#080808')
    tg.setBackgroundColor('#080808')
    document.documentElement.style.setProperty('--safe-top', `${tg.safeAreaInset?.top || 0}px`)
    document.documentElement.style.setProperty('--safe-bottom', `${tg.safeAreaInset?.bottom || 0}px`)
  } catch {
    // SDK старой версии — оформление не критично
  }
}
