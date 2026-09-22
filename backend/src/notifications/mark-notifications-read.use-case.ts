import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { sqliteTimestamp } from '../common/sqlite-timestamp.js'
import type { MarkNotificationsReadCommand } from './mark-notifications-read.body.js'
import { NotificationsRepository } from './notifications.repository.js'

@Injectable()
export class MarkNotificationsReadUseCase {
  constructor(
    @Inject(NotificationsRepository)
    private readonly notifications: NotificationsRepository,
  ) {}

  async execute(
    principal: AuthenticatedPrincipal,
    command: MarkNotificationsReadCommand,
  ): Promise<{ ok: true }> {
    if (!principal.user) {
      throw new HttpException(
        { ok: false, error: 'Пользователь не найден.' },
        HttpStatus.NOT_FOUND,
      )
    }
    const readAt = sqliteTimestamp()
    if (command.readAll) {
      await this.notifications.markAllRead(principal.user.id, readAt)
    } else if (command.notificationId != null) {
      await this.notifications.markOneRead(principal.user.id, command.notificationId, readAt)
    } else {
      throw new HttpException(
        { ok: false, error: 'Передайте notification_id или read_all: true.' },
        HttpStatus.BAD_REQUEST,
      )
    }
    return { ok: true }
  }
}
