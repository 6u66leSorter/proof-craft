export type NotificationRecord = {
  id: number
  kind: string
  body: string
  payload: string | null
  readAt: string | null
  createdAt: string
}

export type NotificationSnapshot = {
  notifications: NotificationRecord[]
  unreadCount: number
}

export abstract class NotificationsRepository {
  abstract findForUser(userId: number, limit: number): Promise<NotificationSnapshot>
  abstract deleteCreatedBefore(cutoff: string): Promise<number>
}
