import type { AuthenticationRequest } from '../auth/auth.types.js'
import { invalidParameters } from '../common/invalid-parameters.error.js'

export type RegisterStudentCommand = {
  fullName: string
  phone: string
  lessonsCount: string | number
  username: string | null
  firstName: string | null
  lastName: string | null
  metro: string | null
}

export type StudentRegistrationRequest = AuthenticationRequest & {
  studentRegistrationCommand?: RegisterStudentCommand
}

const optionalNullableString = (value: unknown): value is string | null | undefined =>
  value == null || typeof value === 'string'

export const parseStudentRegistration = (rawBody: unknown): RegisterStudentCommand => {
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return invalidParameters()
  }
  const body = rawBody as Record<string, unknown>
  if (
    typeof body.full_name !== 'string' ||
    typeof body.phone !== 'string' ||
    (typeof body.lessons_count !== 'string' && typeof body.lessons_count !== 'number') ||
    !optionalNullableString(body.username) ||
    !optionalNullableString(body.first_name) ||
    !optionalNullableString(body.last_name) ||
    !optionalNullableString(body.metro)
  ) {
    return invalidParameters()
  }
  return {
    fullName: body.full_name,
    phone: body.phone,
    lessonsCount: body.lessons_count,
    username: body.username ?? null,
    firstName: body.first_name ?? null,
    lastName: body.last_name ?? null,
    metro: body.metro ?? null,
  }
}

export const studentRegistrationCommandFrom = (
  request: StudentRegistrationRequest,
): RegisterStudentCommand => request.studentRegistrationCommand ?? invalidParameters()
