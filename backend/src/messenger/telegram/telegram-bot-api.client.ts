import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { telegramApiBaseUrl } from '../../notifications/telegram-user-notification.gateway.js'

export type TelegramUser = { id: number; username?: string; first_name?: string; last_name?: string }

export type TelegramUpdate = {
  update_id: number
  message?: {
    chat: { id: number }
    from?: TelegramUser
    text?: string
    photo?: unknown[]
    video?: unknown
    document?: unknown
  }
  callback_query?: {
    id: string
    from: TelegramUser
    data?: string
    message?: { chat: { id: number } }
  }
}

export class TelegramApiError extends Error {}

/** Тонкий клиент Bot API на fetch: адрес сервера настраивается (TELEGRAM_API_BASE_URL). */
export class TelegramBotApiClient {
  constructor(private readonly token: string) {}

  private url(method: string): string {
    return `${telegramApiBaseUrl()}/bot${this.token}/${method}`
  }

  private async parse<T>(response: Response, method: string): Promise<T> {
    const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string }
    if (!payload.ok) throw new TelegramApiError(`${method}: ${payload.description || response.status}`)
    return payload.result as T
  }

  async call<T>(method: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    const response = await fetch(this.url(method), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal ?? null,
    })
    return await this.parse<T>(response, method)
  }

  /**
   * Отправка локального файла (sendPhoto / sendVideo). Текстовые поля идут в query-параметрах:
   * FormData по стандарту превращает переводы строк в CRLF, и подпись в Telegram исказилась бы.
   */
  async upload<T>(method: string, field: string, path: string, body: Record<string, unknown>): Promise<T> {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(body)) {
      query.set(key, typeof value === 'string' ? value : JSON.stringify(value))
    }
    const form = new FormData()
    form.set(field, new Blob([await readFile(path)]), basename(path))
    return await this.parse<T>(await fetch(`${this.url(method)}?${query}`, { method: 'POST', body: form }), method)
  }
}
