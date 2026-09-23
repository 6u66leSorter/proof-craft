import type { AuthenticationRequest } from '../auth/auth.types.js'
import { invalidParameters } from '../common/invalid-parameters.error.js'

export type TeacherStudentHomeworksQuery = {
  studentId: number
  includeReviewed: boolean
}

export type TeacherCabinetRequest = AuthenticationRequest & {
  teacherStudentHomeworksQuery?: TeacherStudentHomeworksQuery
}

export const parseTeacherStudentHomeworksQuery = (
  rawQuery: unknown,
): TeacherStudentHomeworksQuery => {
  if (!rawQuery || typeof rawQuery !== 'object' || Array.isArray(rawQuery)) {
    return invalidParameters()
  }
  const query = rawQuery as Record<string, unknown>
  const studentId = Number(query.student_id)
  if (!Number.isSafeInteger(studentId) || studentId <= 0) {
    return invalidParameters()
  }
  const rawIncludeReviewed = query.include_reviewed
  return {
    studentId,
    includeReviewed:
      typeof rawIncludeReviewed === 'string'
        ? rawIncludeReviewed.toLowerCase() === 'true'
        : Boolean(rawIncludeReviewed),
  }
}

export const teacherStudentHomeworksQueryFrom = (
  request: TeacherCabinetRequest,
): TeacherStudentHomeworksQuery =>
  request.teacherStudentHomeworksQuery ?? invalidParameters()
