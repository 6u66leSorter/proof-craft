import type { AuthenticationRequest } from '../auth/auth.types.js'
import { invalidParameters } from '../common/invalid-parameters.error.js'

export type AdminStudentAssignmentCommand = {
  teacherId: number
  studentId: number
}

export type AdminStudentAssignmentRequest = AuthenticationRequest & {
  adminStudentAssignmentCommand?: AdminStudentAssignmentCommand
}

export const parseAdminStudentAssignment = (
  rawBody: unknown,
): AdminStudentAssignmentCommand => {
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return invalidParameters()
  }
  const body = rawBody as Record<string, unknown>
  const teacherId = Number(body.teacher_id)
  const studentId = Number(body.student_id)
  if (
    !Number.isSafeInteger(teacherId) ||
    teacherId <= 0 ||
    !Number.isSafeInteger(studentId) ||
    studentId <= 0
  ) {
    return invalidParameters()
  }
  return { teacherId, studentId }
}

export const adminStudentAssignmentCommandFrom = (
  request: AdminStudentAssignmentRequest,
): AdminStudentAssignmentCommand =>
  request.adminStudentAssignmentCommand ?? invalidParameters()
