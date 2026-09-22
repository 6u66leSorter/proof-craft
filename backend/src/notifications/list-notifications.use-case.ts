import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { NotificationsRepository } from './notifications.repository.js'
import { NotificationsRetentionService } from './notifications-retention.service.js'

const parsePayload = (payload: string | null): unknown => {
  if (!payload) return null
  try {
    return JSON.parse(payload) as unknown
  } catch {
    return null
  }
}

@Injectable()
export class ListNotificationsUseCase {
  constructor(
    @Inject(NotificationsRepository)
    private readonly notifications: NotificationsRepository,
    @Inject(NotificationsRetentionService)
    private readonly retention: NotificationsRetentionService,
  ) {}

  async execute(principal: AuthenticatedPrincipal, limit: number): Promise<object> {
    await this.retention.pruneIfDue()
    if (!principal.user) {
      throw new HttpException(
        { ok: false, error: 'Пользователь не найден.' },
        HttpStatus.NOT_FOUND,
      )
    }

    const snapshot = await this.notifications.findForUser(principal.user.id, limit)
    return {
      ok: true,
      data: {
        notifications: snapshot.notifications.map((notification) => ({
          id: notification.id,
          kind: notification.kind,
          body: notification.body,
          payload: parsePayload(notification.payload),
          read_at: notification.readAt,
          created_at: notification.createdAt,
        })),
        unread_count: snapshot.unreadCount,
      },
    }
  }
}
