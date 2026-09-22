import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../persistence/prisma/prisma.service.js'
import {
  NotificationsRepository,
  type NotificationSnapshot,
} from './notifications.repository.js'

@Injectable()
export class PrismaNotificationsRepository implements NotificationsRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findForUser(userId: number, limit: number): Promise<NotificationSnapshot> {
    const [rows, unreadCount] = await Promise.all([
      this.prisma.app_notifications.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        take: limit,
        select: {
          id: true,
          kind: true,
          body: true,
          payload: true,
          read_at: true,
          created_at: true,
        },
      }),
      this.prisma.app_notifications.count({
        where: { user_id: userId, read_at: null },
      }),
    ])

    return {
      notifications: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        body: row.body,
        payload: row.payload,
        readAt: row.read_at,
        createdAt: row.created_at,
      })),
      unreadCount,
    }
  }

  async deleteCreatedBefore(cutoff: string): Promise<number> {
    const result = await this.prisma.app_notifications.deleteMany({
      where: { created_at: { lt: cutoff } },
    })
    return result.count
  }
}
