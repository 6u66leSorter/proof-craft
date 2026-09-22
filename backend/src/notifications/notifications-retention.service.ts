import { Inject, Injectable, Logger } from '@nestjs/common'
import { NotificationsRepository } from './notifications.repository.js'

const PRUNE_INTERVAL_MS = 60 * 60 * 1000
const DEFAULT_RETENTION_DAYS = 90

const sqliteTimestamp = (timestamp: number): string =>
  new Date(timestamp).toISOString().slice(0, 19).replace('T', ' ')

const retentionDays = (): number => {
  const configured = Number(process.env.APP_NOTIFICATIONS_RETENTION_DAYS || DEFAULT_RETENTION_DAYS)
  return Number.isFinite(configured) ? Math.min(365, Math.max(7, configured)) : DEFAULT_RETENTION_DAYS
}

@Injectable()
export class NotificationsRetentionService {
  private readonly logger = new Logger(NotificationsRetentionService.name)
  private lastPruneAt = 0

  constructor(
    @Inject(NotificationsRepository)
    private readonly notifications: NotificationsRepository,
  ) {}

  async pruneIfDue(now = Date.now()): Promise<void> {
    if (now - this.lastPruneAt < PRUNE_INTERVAL_MS) return
    this.lastPruneAt = now
    const cutoff = sqliteTimestamp(now - retentionDays() * 24 * 60 * 60 * 1000)
    try {
      await this.notifications.deleteCreatedBefore(cutoff)
    } catch (error) {
      this.logger.warn(`Не удалось очистить старые уведомления: ${String(error)}`)
    }
  }
}
