import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

export type RecordedCall = { method: string; body: Record<string, unknown> }
type TelegramFrom = { id: number; username?: string; first_name?: string; last_name?: string }

/**
 * Поддельный Telegram Bot API для тестов бота: отдаёт обновления через getUpdates и записывает
 * всё, что отправляет бот (sendMessage, sendPhoto, answerCallbackQuery…).
 */
export class FakeTelegram {
  readonly calls: RecordedCall[] = []
  private server: Server | null = null
  private updates: object[] = []
  private nextUpdateId = 1
  private waiting: Array<() => void> = []
  private delivered: Array<{ lastId: number; resolve: () => void }> = []

  async start(): Promise<string> {
    this.server = createServer((request, response) => void this.handle(request, response))
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve))
    return `http://127.0.0.1:${(this.server!.address() as AddressInfo).port}`
  }

  async stop(): Promise<void> {
    this.waiting.forEach((wake) => wake())
    await new Promise<void>((resolve) => this.server?.close(() => resolve()) ?? resolve())
  }

  private async readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(chunk as Buffer)
    const raw = Buffer.concat(chunks)
    const type = String(request.headers['content-type'] || '')
    if (type.startsWith('multipart/form-data')) {
      const form = await new Response(raw, { headers: { 'content-type': type } }).formData()
      const body: Record<string, unknown> = {}
      for (const [key, value] of form.entries()) {
        if (typeof value === 'string') {
          try {
            body[key] = JSON.parse(value)
          } catch {
            body[key] = value
          }
        } else {
          body[key] = { uploadedFile: value.name, size: value.size }
        }
      }
      return body
    }
    return raw.length ? (JSON.parse(raw.toString('utf8')) as Record<string, unknown>) : {}
  }

  private async handle(request: IncomingMessage, response: import('node:http').ServerResponse): Promise<void> {
    const url = new URL(String(request.url), 'http://fake')
    const method = url.pathname.split('/').pop() ?? ''
    const body = await this.readBody(request)
    for (const [key, value] of url.searchParams) {
      try {
        body[key] = JSON.parse(value)
      } catch {
        body[key] = value
      }
    }
    const send = (result: unknown) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ ok: true, result }))
    }
    if (method === 'getUpdates') {
      const offset = Number(body.offset ?? 0)
      this.updates = this.updates.filter((u) => (u as { update_id: number }).update_id >= offset)
      // Бот обрабатывает обновления последовательно: новый getUpdates значит, что предыдущие обработаны.
      const processedUpTo = offset - 1
      this.delivered = this.delivered.filter((d) => (d.lastId <= processedUpTo ? (d.resolve(), false) : true))
      if (!this.updates.length) await new Promise<void>((resolve) => {
        this.waiting.push(resolve)
        setTimeout(resolve, 200)
      })
      send(this.updates)
      return
    }
    this.calls.push({ method, body })
    send(method === 'answerCallbackQuery' ? true : { message_id: this.calls.length, chat: { id: body.chat_id } })
  }

  private push(update: Record<string, unknown>): Promise<void> {
    const id = this.nextUpdateId++
    this.updates.push({ update_id: id, ...update })
    this.waiting.splice(0).forEach((wake) => wake())
    return new Promise((resolve) => this.delivered.push({ lastId: id, resolve }))
  }

  /** Сообщение пользователя; промис завершается, когда бот его обработал. */
  message(from: TelegramFrom, text: string): Promise<void> {
    return this.push({ message: { message_id: this.nextUpdateId, chat: { id: from.id }, from, text } })
  }

  /** Нажатие inline-кнопки. */
  press(from: TelegramFrom, data: string): Promise<void> {
    return this.push({
      callback_query: { id: `cb-${this.nextUpdateId}`, from, data, message: { message_id: 1, chat: { id: from.id } } },
    })
  }

  /** Вызовы, сделанные после отметки `since`. */
  after(since: number): RecordedCall[] {
    return this.calls.slice(since)
  }

  texts(since: number, chatId?: number): string[] {
    return this.after(since)
      .filter((c) => c.method !== 'answerCallbackQuery' && (chatId == null || c.body.chat_id === chatId))
      .map((c) => String(c.body.text ?? c.body.caption ?? ''))
  }
}
