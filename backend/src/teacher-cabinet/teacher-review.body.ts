import type { AuthenticationRequest } from '../auth/auth.types.js'
import { invalidParameters } from '../common/invalid-parameters.error.js'

export type TeacherReviewCommand = {
  homeworkId: number
  rating: number | null
  comment: string | null
}

export type TeacherReviewRequest = AuthenticationRequest & {
  teacherReviewCommand?: TeacherReviewCommand
}

export const parseTeacherReview = (rawBody: unknown): TeacherReviewCommand => {
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return invalidParameters()
  }
  const body = rawBody as Record<string, unknown>
  const homeworkId = Number(body.homework_id)
  const rating = body.rating == null ? null : Number(body.rating)
  if (
    !Number.isSafeInteger(homeworkId) ||
    homeworkId <= 0 ||
    (rating != null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) ||
    (body.comment !== undefined && body.comment !== null && typeof body.comment !== 'string')
  ) {
    return invalidParameters()
  }
  return {
    homeworkId,
    rating,
    comment: typeof body.comment === 'string' ? body.comment : null,
  }
}

export const teacherReviewCommandFrom = (
  request: TeacherReviewRequest,
): TeacherReviewCommand => request.teacherReviewCommand ?? invalidParameters()
