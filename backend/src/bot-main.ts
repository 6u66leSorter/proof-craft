import 'reflect-metadata'
import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { MessengerModule } from './messenger/messenger.module.js'
import { FeedbackInvitesWorker } from './messenger/feedback-invites.worker.js'
import { TelegramAdapter } from './messenger/telegram/telegram.adapter.js'

/** Отдельный процесс бота: те же модули и Prisma, что у API, но без HTTP-сервера. */
const bootstrap = async (): Promise<void> => {
  const token = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    // Не ошибка: стек без бота (сайт и API) — допустимая конфигурация, перезапуск не нужен.
    new Logger('Bot').warn('BOT_TOKEN не задан — бот не запущен. Укажите его в .env и перезапустите контейнер bot.')
    return
  }
  const app = await NestFactory.createApplicationContext(MessengerModule, { logger: ['error', 'warn', 'log'] })
  app.enableShutdownHooks()
  const telegram = app.get(TelegramAdapter)
  telegram.start(token)
  const invites = app.get(FeedbackInvitesWorker).start(telegram, process.env.WEB_APP_URL)
  new Logger('Bot').log(`Бот запущен: Telegram long polling${invites ? ', очередь приглашений к отзыву' : ''}.`)
}

await bootstrap()
