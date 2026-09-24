import type { AuthenticationRequest } from '../auth/auth.types.js'
import { invalidParameters } from '../common/invalid-parameters.error.js'

export type ChatMessagesQuery = {
  studentId: number
  limit: number
}

export type ChatRequest = AuthenticationRequest & {
  params?: unknown
  chatMessagesQuery?: ChatMessagesQuery
  chatMessageId?: number
}

const recordFrom = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return invalidParameters()
  }
  return value as Record<string, unknown>
}

const positiveInteger = (value: unknown): number => {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return invalidParameters()
  return parsed
}

export const parseChatMessagesQuery = (rawQuery: unknown): ChatMessagesQuery => {
  const query = recordFrom(rawQuery)
  const limit = query.limit == null ? 80 : Number(query.limit)
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    return invalidParameters()
  }
  return { studentId: positiveInteger(query.student_id), limit }
}

export const parseChatMessageId = (rawParams: unknown): number => {
  const params = recordFrom(rawParams)
  return positiveInteger(params.id)
}

export const chatMessagesQueryFrom = (request: ChatRequest): ChatMessagesQuery =>
  request.chatMessagesQuery ?? invalidParameters()

export const chatMessageIdFrom = (request: ChatRequest): number =>
  request.chatMessageId ?? invalidParameters()
