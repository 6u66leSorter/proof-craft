import type { AuthenticationRequest } from '../auth/auth.types.js'
import { invalidParameters } from '../common/invalid-parameters.error.js'

export type HomeworkCommentCommand = {
  homeworkId: number
  text: string
}

export type HomeworkCommentRequest = AuthenticationRequest & {
  params?: unknown
  homeworkCommentCommand?: HomeworkCommentCommand
}

const MAX_COMMENT_LENGTH = 2000

/** Legacy: `id` — положительное целое, `text_content` — строка 1..2000 символов после trim. */
export const parseHomeworkComment = (rawParams: unknown, rawBody: unknown): HomeworkCommentCommand => {
  const params = rawParams && typeof rawParams === 'object' ? (rawParams as Record<string, unknown>) : {}
  const homeworkId = Number(params.id)
  if (!Number.isSafeInteger(homeworkId) || homeworkId <= 0) return invalidParameters()
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) return invalidParameters()
  const body = rawBody as Record<string, unknown>
  if (typeof body.text_content !== 'string') return invalidParameters()
  const text = body.text_content.trim()
  if (text.length < 1 || text.length > MAX_COMMENT_LENGTH) return invalidParameters()
  return { homeworkId, text }
}

export const homeworkCommentCommandFrom = (request: HomeworkCommentRequest): HomeworkCommentCommand =>
  request.homeworkCommentCommand ?? invalidParameters()
