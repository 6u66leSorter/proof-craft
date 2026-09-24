import { Injectable, Logger } from '@nestjs/common'
import { UserNotificationGateway } from './user-notification.gateway.js'

/** Адрес Bot API настраивается для локального Bot API-сервера и тестов. */
export const telegramApiBaseUrl = (): string =>
  (process.env.TELEGRAM_API_BASE_URL || 'https://api.telegram.org').replace(/\/+$/, '')

@Injectable()
export class TelegramUserNotificationGateway implements UserNotificationGateway {
  private readonly logger = new Logger(TelegramUserNotificationGateway.name)

  async send(telegramId: number, message: string): Promise<void> {
    const botToken =
      process.env.BOT_TOKEN ||
      process.env.TELEGRAM_BOT_TOKEN ||
      process.env.VITE_TELEGRAM_BOT_TOKEN
    if (!botToken || !telegramId) return

    try {
      const response = await fetch(`${telegramApiBaseUrl()}/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: telegramId, text: message }),
      })
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean
        description?: string
      }
      if (!payload.ok) {
        this.logger.warn(
          `Telegram sendMessage для ${telegramId}: ${payload.description || response.status}`,
        )
      }
    } catch (error) {
      this.logger.warn(
        `Не удалось отправить Telegram-уведомление пользователю ${telegramId}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}
