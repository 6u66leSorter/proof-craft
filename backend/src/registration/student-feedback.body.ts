import type { AuthenticationRequest } from '../auth/auth.types.js'
import { invalidParameters } from '../common/invalid-parameters.error.js'

export type SubmitStudentFeedbackCommand = {
  subject: 'teacher' | 'academy' | 'other'
  message: string
  requestKey: string
}

export type StudentFeedbackRequest = AuthenticationRequest & {
  studentFeedbackCommand?: SubmitStudentFeedbackCommand
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const parseStudentFeedback = (rawBody: unknown): SubmitStudentFeedbackCommand => {
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return invalidParameters()
  }
  const body = rawBody as Record<string, unknown>
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (
    !['teacher', 'academy', 'other'].includes(String(body.subject)) ||
    typeof body.message !== 'string' ||
    message.length < 1 ||
    message.length > 4000 ||
    typeof body.request_key !== 'string' ||
    !uuidPattern.test(body.request_key)
  ) {
    return invalidParameters()
  }
  return {
    subject: body.subject as SubmitStudentFeedbackCommand['subject'],
    message,
    requestKey: body.request_key,
  }
}

export const studentFeedbackCommandFrom = (
  request: StudentFeedbackRequest,
): SubmitStudentFeedbackCommand => request.studentFeedbackCommand ?? invalidParameters()
