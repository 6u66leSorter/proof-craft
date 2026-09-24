import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common'
import { BotRouter } from '../bot.router.js'
import type { Button, ChannelPort, ChannelUser, IncomingEvent, OutgoingMessage } from '../channel.types.js'
import { TelegramBotApiClient, type TelegramUpdate, type TelegramUser } from './telegram-bot-api.client.js'

const channelUser = (user: TelegramUser): ChannelUser => ({
  channel: 'telegram',
  externalId: user.id,
  username: user.username ?? null,
  firstName: user.first_name ?? null,
  lastName: user.last_name ?? null,
})

const keyboard = (buttons: Button[][] | undefined) =>
  buttons?.length
    ? { inline_keyboard: buttons.map((row) => row.map((b) => ('url' in b ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.data }))) }
    : undefined

/** Обновление Telegram → событие ядра бота. Команды вида `/admin@bot args`. */
export const toIncomingEvent = (update: TelegramUpdate): IncomingEvent | null => {
  const query = update.callback_query
  if (query?.data && query.message) {
    return { kind: 'button', user: channelUser(query.from), chatId: query.message.chat.id, data: query.data, callbackId: query.id }
  }
  const message = update.message
  if (!message?.from) return null
  const user = channelUser(message.from)
  const command = /^\/([a-z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i.exec(message.text ?? '')
  if (command) return { kind: 'command', user, chatId: message.chat.id, command: (command[1] ?? '').toLowerCase(), args: command[2] ?? '' }
  return { kind: 'message', user, chatId: message.chat.id, text: message.text ?? null }
}

/**
 * Telegram-адаптер: long polling getUpdates, последовательная обработка обновлений
 * и отправка ответов с inline-кнопками и медиа.
 */
@Injectable()
export class TelegramAdapter implements ChannelPort, OnApplicationShutdown {
  readonly kind = 'telegram' as const
  private readonly logger = new Logger(TelegramAdapter.name)
  private client: TelegramBotApiClient | null = null
  private running = false
  private abort: AbortController | null = null
  private loop: Promise<void> | null = null

  constructor(@Inject(BotRouter) private readonly router: BotRouter) {}

  start(token: string): void {
    this.client = new TelegramBotApiClient(token)
    this.running = true
    this.loop = this.poll()
  }

  async onApplicationShutdown(): Promise<void> {
    this.running = false
    this.abort?.abort()
    await this.loop?.catch(() => {})
  }

  private async poll(): Promise<void> {
    let offset = 0
    while (this.running) {
      this.abort = new AbortController()
      try {
        const updates = await this.client!.call<TelegramUpdate[]>(
          'getUpdates',
          { offset, timeout: Number(process.env.TELEGRAM_POLL_TIMEOUT_SEC ?? 25), allowed_updates: ['message', 'callback_query'] },
          this.abort.signal,
        )
        for (const update of updates) {
          offset = update.update_id + 1
          const event = toIncomingEvent(update)
          if (event) await this.router.handle(this, event)
        }
      } catch (error) {
        if (!this.running) return
        this.logger.warn(`getUpdates: ${error instanceof Error ? error.message : String(error)}`)
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }
  }

  async send(chatId: number, message: OutgoingMessage): Promise<void> {
    const replyMarkup = keyboard(message.buttons)
    const media = message.media
    if (media) {
      const method = media.kind === 'photo' ? 'sendPhoto' : 'sendVideo'
      const body = { chat_id: chatId, caption: message.text, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }
      if (media.isLocalFile) await this.client!.upload(method, media.kind, media.fileRef, body)
      else await this.client!.call(method, { ...body, [media.kind]: media.fileRef })
      return
    }
    await this.client!.call('sendMessage', { chat_id: chatId, text: message.text, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) })
  }

  async answerButton(callbackId: string, text?: string): Promise<void> {
    await this.client!.call('answerCallbackQuery', { callback_query_id: callbackId, ...(text ? { text } : {}) })
  }
}
