/**
 * Один билд для Telegram и VK: эвристика «это WebView VK» без ложных срабатываний
 * (не ищем подстроку vk_ по всей строке запроса).
 */
export function urlLooksLikeVkMiniApp(href: string = window.location.href): boolean {
  try {
    const url = new URL(href)
    if (/\.vk-apps\.com$/i.test(url.hostname)) return true
    if (Number(url.searchParams.get('vk_user_id') || 0) > 0) return true
    for (const key of url.searchParams.keys()) {
      if (key.startsWith('vk_')) return true
    }
  } catch {
    // некорректный URL — не VK
  }
  return false
}
