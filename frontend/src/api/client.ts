import type { Platform } from '../platform/detect'
import { getTelegram } from '../platform/telegram'

const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

export const apiUrl = (path: string) => {
  const p = path.startsWith('/') ? path : `/${path}`
  return API_BASE_URL ? `${API_BASE_URL}${p}` : p
}

type PlatformLike = Pick<Platform, 'platform'> & Partial<Platform>

export function buildHeaders(platform: PlatformLike | null): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (platform?.platform) headers['X-Client-Platform'] = platform.platform
  if (platform?.webSessionToken) headers['X-Web-Session'] = platform.webSessionToken

  const tg = getTelegram()
  if (platform?.platform === 'telegram' && tg?.initData) headers['X-Telegram-Init-Data'] = tg.initData
  if (platform?.platform === 'vk' && platform.vkUserId) {
    headers['X-VK-User-Id'] = String(platform.vkUserId)
    if (platform.appUserId) headers['X-App-User-Id'] = String(platform.appUserId)
    if (platform.launchParams) headers['X-VK-Launch-Params'] = String(platform.launchParams)
  }
  return headers
}

export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function unwrap<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.ok === false) {
    throw new ApiError(payload?.error || `Ошибка запроса (${response.status}).`, response.status)
  }
  return (payload?.data ?? payload) as T
}

export async function apiGet<T>(platform: PlatformLike | null, path: string): Promise<T> {
  const response = await fetch(apiUrl(path), { method: 'GET', cache: 'no-store', headers: buildHeaders(platform) })
  return unwrap<T>(response)
}

export async function apiPost<T>(platform: PlatformLike | null, path: string, body?: unknown): Promise<T> {
  const response = await fetch(apiUrl(path), {
    method: 'POST',
    cache: 'no-store',
    headers: buildHeaders(platform),
    body: JSON.stringify(body ?? {}),
  })
  return unwrap<T>(response)
}
