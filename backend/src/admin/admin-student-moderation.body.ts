import type { AuthenticationRequest } from '../auth/auth.types.js'
import { invalidParameters } from '../common/invalid-parameters.error.js'

export type AdminStudentAction =
  | 'approve'
  | 'reject'
  | 'set_studying'
  | 'set_completed'

export type ModerateAdminStudentCommand = {
  studentId: number
  action: AdminStudentAction
  teacherIds?: number[]
}

export type AdminStudentModerationRequest = AuthenticationRequest & {
  adminStudentModerationCommand?: ModerateAdminStudentCommand
}

const actions: AdminStudentAction[] = [
  'approve',
  'reject',
  'set_studying',
  'set_completed',
]

export const parseAdminStudentModeration = (
  rawBody: unknown,
): ModerateAdminStudentCommand => {
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return invalidParameters()
  }
  const body = rawBody as Record<string, unknown>
  const studentId = Number(body.student_id)
  if (
    !Number.isSafeInteger(studentId) ||
    studentId <= 0 ||
    !actions.includes(body.action as AdminStudentAction)
  ) {
    return invalidParameters()
  }

  let teacherIds: number[] | undefined
  if (body.teacher_ids !== undefined) {
    if (!Array.isArray(body.teacher_ids) || body.teacher_ids.length > 80) {
      return invalidParameters()
    }
    teacherIds = body.teacher_ids.map(Number)
    if (teacherIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
      return invalidParameters()
    }
  }
  return {
    studentId,
    action: body.action as AdminStudentAction,
    ...(teacherIds === undefined ? {} : { teacherIds }),
  }
}

export const adminStudentModerationCommandFrom = (
  request: AdminStudentModerationRequest,
): ModerateAdminStudentCommand =>
  request.adminStudentModerationCommand ?? invalidParameters()
