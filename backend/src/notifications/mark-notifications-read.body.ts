import { invalidParameters } from '../common/invalid-parameters.error.js'

export type MarkNotificationsReadCommand = {
  notificationId: number | null
  readAll: boolean
}

export const parseMarkNotificationsReadBody = (rawBody: unknown): MarkNotificationsReadCommand => {
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return invalidParameters()
  }
  const body = rawBody as Record<string, unknown>
  let notificationId: number | null = null
  if (body.notification_id !== undefined) {
    notificationId = Number(body.notification_id)
    if (!Number.isSafeInteger(notificationId) || notificationId <= 0) {
      return invalidParameters()
    }
  }
  if (body.read_all !== undefined && typeof body.read_all !== 'boolean') {
    return invalidParameters()
  }
  return { notificationId, readAll: body.read_all === true }
}
