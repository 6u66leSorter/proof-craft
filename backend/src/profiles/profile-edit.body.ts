import type { AuthenticationRequest } from '../auth/auth.types.js'
import { invalidParameters } from '../common/invalid-parameters.error.js'

export type SubmitProfileEditCommand = {
  fullName: string
  phone: string
  metro: string | null
}

export type ProfileEditRequest = AuthenticationRequest & {
  profileEditCommand?: SubmitProfileEditCommand
}

export const parseProfileEditBody = (rawBody: unknown): SubmitProfileEditCommand => {
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return invalidParameters()
  }
  const body = rawBody as Record<string, unknown>
  if (
    typeof body.full_name !== 'string' ||
    body.full_name.length < 2 ||
    body.full_name.length > 120 ||
    typeof body.phone !== 'string' ||
    body.phone.length < 5 ||
    body.phone.length > 30 ||
    (body.metro !== undefined &&
      (typeof body.metro !== 'string' || body.metro.length > 80))
  ) {
    return invalidParameters()
  }
  return {
    fullName: body.full_name,
    phone: body.phone,
    metro: body.metro || null,
  }
}

export const profileEditCommandFrom = (
  request: ProfileEditRequest,
): SubmitProfileEditCommand => request.profileEditCommand ?? invalidParameters()
