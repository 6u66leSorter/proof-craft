import type { AuthenticationRequest } from '../auth/auth.types.js'
import { invalidParameters } from '../common/invalid-parameters.error.js'

export type UpdateStudentAboutCommand = {
  aboutMe: string | null
}

export type StudentAboutRequest = AuthenticationRequest & {
  studentAboutCommand?: UpdateStudentAboutCommand
}

export const parseStudentAboutBody = (rawBody: unknown): UpdateStudentAboutCommand => {
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return invalidParameters()
  }
  const aboutMe = (rawBody as Record<string, unknown>).about_me
  if (typeof aboutMe !== 'string' || aboutMe.length > 1000) {
    return invalidParameters()
  }
  const trimmed = aboutMe.trim()
  return { aboutMe: trimmed || null }
}

export const studentAboutCommandFrom = (
  request: StudentAboutRequest,
): UpdateStudentAboutCommand => request.studentAboutCommand ?? invalidParameters()
