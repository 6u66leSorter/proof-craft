import type { AuthenticationRequest } from '../auth/auth.types.js'
import { invalidParameters } from '../common/invalid-parameters.error.js'

export type UpdateAboutCommand = {
  aboutMe: string | null
}

export type AboutRequest = AuthenticationRequest & {
  aboutCommand?: UpdateAboutCommand
}

export const parseAboutBody = (rawBody: unknown): UpdateAboutCommand => {
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

export const aboutCommandFrom = (request: AboutRequest): UpdateAboutCommand =>
  request.aboutCommand ?? invalidParameters()
