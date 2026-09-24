import type { AuthenticationRequest } from '../auth/auth.types.js'
import { invalidParameters } from '../common/invalid-parameters.error.js'

export type SubmitTeacherApplicationCommand = {
  fullName: string
  phone: string
}

export type TeacherApplicationRequest = AuthenticationRequest & {
  teacherApplicationCommand?: SubmitTeacherApplicationCommand
}

export const parseTeacherApplication = (
  rawBody: unknown,
): SubmitTeacherApplicationCommand => {
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return invalidParameters()
  }
  const body = rawBody as Record<string, unknown>
  if (
    typeof body.full_name !== 'string' ||
    body.full_name.length < 2 ||
    typeof body.phone !== 'string' ||
    body.phone.length < 5
  ) {
    return invalidParameters()
  }
  return { fullName: body.full_name, phone: body.phone }
}

export const teacherApplicationCommandFrom = (
  request: TeacherApplicationRequest,
): SubmitTeacherApplicationCommand =>
  request.teacherApplicationCommand ?? invalidParameters()
