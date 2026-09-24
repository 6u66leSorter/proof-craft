import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common'
import { PrismaService } from '../persistence/prisma/prisma.service.js'
import type { ChannelPort } from './channel.types.js'

const INTERVAL_MS = 30_000
const BATCH = 20
/** Синтетические идентификаторы VK-пользователей (VK_ID_OFFSET) не могут получить сообщение в Telegram. */
const SYNTHETIC_ID_FROM = 9_000_000_000

/**
 * Очередь приглашений к отзыву после принятия уроков 5, 10 и 15.
 * Запись атомарно переводится в `sending`, поэтому несколько процессов бота не отправят её дважды;
 * неоднозначный ответ мессенджера помечается `failed` без повторов.
 */
@Injectable()
export class FeedbackInvitesWorker implements OnApplicationShutdown {
  private readonly logger = new Logger(FeedbackInvitesWorker.name)
  private timer: NodeJS.Timeout | null = null
  private running = false

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Запускается только при HTTPS-адресе сайта: ссылка ведёт на форму отзыва. */
  start(channel: ChannelPort, siteUrl: string | undefined): boolean {
    const url = this.feedbackUrl(siteUrl)
    if (!url) return false
    const run = () => void this.runOnce(channel, url).catch((error) => this.logger.error(`Очередь приглашений: ${String(error)}`))
    this.timer = setInterval(run, INTERVAL_MS)
    this.timer.unref()
    run()
    return true
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer)
  }

  feedbackUrl(siteUrl: string | undefined): string | null {
    try {
      const url = new URL(String(siteUrl))
      if (url.protocol !== 'https:') return null
      url.searchParams.set('feedback', '1')
      return url.toString()
    } catch {
      return null
    }
  }

  async runOnce(channel: ChannelPort, url: string): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      const invites = await this.prisma.feedback_invites.findMany({
        where: { delivery_status: 'pending' },
        take: BATCH,
        select: { id: true, milestone: true, students: { select: { users: { select: { telegram_id: true } } } } },
      })
      for (const invite of invites) {
        const telegramId = Number(invite.students.users.telegram_id)
        if (!telegramId || telegramId >= SYNTHETIC_ID_FROM) continue
        const claimed = await this.prisma.feedback_invites.updateMany({
          where: { id: invite.id, delivery_status: 'pending' },
          data: { delivery_status: 'sending' },
        })
        if (claimed.count !== 1) continue
        try {
          await channel.send(telegramId, {
            text: `Урок №${invite.milestone} принят! Поделитесь впечатлениями о преподавателе и академии. Сообщение увидит только администратор вместе с вашим именем. Преподаватель не получит отзыв или уведомление о нём.`,
            buttons: [[{ text: 'Оставить отзыв', url }]],
          })
          await this.prisma.feedback_invites.update({ where: { id: invite.id }, data: { delivery_status: 'sent' } })
        } catch {
          await this.prisma.feedback_invites.update({ where: { id: invite.id }, data: { delivery_status: 'failed' } })
          this.logger.error(`Не отправлено приглашение к отзыву: ${invite.id}`)
        }
      }
    } finally {
      this.running = false
    }
  }
}
