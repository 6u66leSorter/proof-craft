/**
 * Один билд для Telegram и VK: общая эвристика «это WebView VK», без ложных срабатываний
 * (не используем includes('vk_') по всей строке запроса).
 */
export function urlLooksLikeVkMiniApp(href) {
  const h = href ?? (typeof window !== 'undefined' ? window.location.href : '')
  try {
    const url = new URL(h)
    if (/\.vk-apps\.com$/i.test(url.hostname)) return true
    if (Number(url.searchParams.get('vk_user_id') || 0) > 0) return true
    for (const key of url.searchParams.keys()) {
      if (key.startsWith('vk_')) return true
    }
  } catch {
    /* ignore */
  }
  return false
}
