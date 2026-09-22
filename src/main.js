import './index.css'
import { urlLooksLikeVkMiniApp } from './platformEnv.js'

function loadTelegramWebAppScript() {
  return new Promise((resolve, reject) => {
    if (window.Telegram?.WebApp) {
      resolve()
      return
    }
    const s = document.createElement('script')
    s.src = 'https://telegram.org/js/telegram-web-app.js?59'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Не удалось загрузить telegram-web-app.js'))
    document.head.appendChild(s)
  })
}

async function boot() {
  /** В VK не подгружаем Telegram SDK — иначе шум в консоли и лишние postEvent */
  if (!urlLooksLikeVkMiniApp(window.location.href)) {
    try {
      await loadTelegramWebAppScript()
      /** Дать SDK распарсить initData из hash (Telegram Mini App) */
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    } catch {
      /* локальный dev без Telegram — допустимо */
    }
  }
  const { startApp } = await import('./newFrontApp.js')
  startApp(document.getElementById('app'))
}

boot().catch((e) => {
  console.error(e)
  const root = document.getElementById('app')
  if (root) root.innerHTML = `<div style="padding:16px;font-family:sans-serif;color:#c9a227">Ошибка запуска: ${String(e?.message || e)}</div>`
})
