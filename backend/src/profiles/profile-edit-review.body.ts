import type { AuthenticationRequest } from '../auth/auth.types.js'
import { invalidParameters } from '../common/invalid-parameters.error.js'

export type ProfileEditReviewAction = 'approve' | 'reject'

export type ReviewProfileEditCommand = {
  editId: number
  action: ProfileEditReviewAction
  comment: string | null
}

export type ProfileEditReviewRequest = AuthenticationRequest & {
  params?: unknown
  profileEditReviewCommand?: ReviewProfileEditCommand
}

export const parseProfileEditReview = (
  rawParams: unknown,
  rawBody: unknown,
): ReviewProfileEditCommand => {
  if (
    !rawParams ||
    typeof rawParams !== 'object' ||
    Array.isArray(rawParams) ||
    !rawBody ||
    typeof rawBody !== 'object' ||
    Array.isArray(rawBody)
  ) {
    return invalidParameters()
  }

  const params = rawParams as Record<string, unknown>
  const body = rawBody as Record<string, unknown>
  const editId = Number(params.id)
  if (
    !Number.isInteger(editId) ||
    editId <= 0 ||
    !['approve', 'reject'].includes(String(body.action)) ||
    (body.comment !== undefined &&
      (typeof body.comment !== 'string' || body.comment.length > 500))
  ) {
    return invalidParameters()
  }

  return {
    editId,
    action: body.action as ProfileEditReviewAction,
    comment: typeof body.comment === 'string' && body.comment ? body.comment : null,
  }
}

export const profileEditReviewCommandFrom = (
  request: ProfileEditReviewRequest,
): ReviewProfileEditCommand =>
  request.profileEditReviewCommand ?? invalidParameters()
