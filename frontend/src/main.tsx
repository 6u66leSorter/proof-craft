import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { urlLooksLikeVkMiniApp } from './platform/env'
import { STORAGE_KEYS, local } from './platform/storage'
import { initTelegramChrome, loadTelegramSdk } from './platform/telegram'
// Стили legacy-клиента подключаются как есть — источник внешнего вида общий для обоих клиентов.
import '../../src/index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
})

async function boot() {
  // В VK не подгружаем Telegram SDK — иначе шум в консоли и лишние postEvent.
  if (!urlLooksLikeVkMiniApp(window.location.href)) {
    try {
      await loadTelegramSdk()
      // Дать SDK распарсить initData из hash.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    } catch {
      // обычный браузер без Telegram — допустимо
    }
  }
  const root = document.getElementById('app')
  if (!root) throw new Error('Root element not found')
  document.documentElement.dataset.theme = local.get(STORAGE_KEYS.theme) || 'light'
  initTelegramChrome()
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  )
}

boot().catch((error: unknown) => {
  console.error(error)
  const root = document.getElementById('app')
  if (root) {
    root.innerHTML = `<div style="padding:16px;font-family:sans-serif;color:#c9a227">Ошибка запуска: ${String(
      error instanceof Error ? error.message : error,
    )}</div>`
  }
})
