import type { AuthenticationRequest } from '../auth/auth.types.js'
import { invalidParameters } from '../common/invalid-parameters.error.js'

export const ADMIN_STUDENT_STATUSES = [
  'studying',
  'completed',
  'moderation',
  'rejected',
] as const

export type AdminStudentStatus = (typeof ADMIN_STUDENT_STATUSES)[number]

export type AdminReadRequest = AuthenticationRequest & {
  params?: unknown
  adminFeedbackBefore?: number
  adminStudentStatus?: AdminStudentStatus
  adminStudentId?: number
  adminHomeworkStudentId?: number | null
  adminAuditLimit?: number
}

const objectFrom = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return invalidParameters()
  }
  return value as Record<string, unknown>
}

const optionalPositiveInteger = (value: unknown): number | undefined => {
  if (value === undefined) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : invalidParameters()
}

export const parseFeedbackBefore = (query: unknown): number | undefined =>
  optionalPositiveInteger(objectFrom(query).before)

export const parseStudentStatus = (query: unknown): AdminStudentStatus => {
  const status = objectFrom(query).status ?? 'studying'
  return typeof status === 'string' &&
    ADMIN_STUDENT_STATUSES.includes(status as AdminStudentStatus)
    ? (status as AdminStudentStatus)
    : invalidParameters()
}

export const parseStudentId = (params: unknown): number => {
  const id = optionalPositiveInteger(objectFrom(params).student_id)
  return id ?? invalidParameters()
}

export const parseHomeworkStudentId = (query: unknown): number | null => {
  const value = objectFrom(query).student_id
  if (value === undefined || value === null || value === '') return null
  return optionalPositiveInteger(value) ?? null
}

export const parseAuditLimit = (query: unknown): number => {
  const limit = objectFrom(query).limit
  if (limit === undefined) return 80
  const parsed = Number(limit)
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 200
    ? parsed
    : invalidParameters()
}
