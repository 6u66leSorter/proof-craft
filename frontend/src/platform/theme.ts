import { STORAGE_KEYS, local } from './storage'

export function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
  document.documentElement.dataset.theme = next
  local.set(STORAGE_KEYS.theme, next)
}
