import type { AuthenticationRequest } from '../auth/auth.types.js'
import { invalidParameters } from '../common/invalid-parameters.error.js'

export type AdminStudentTrack = 'student' | 'intern' | 'barber'

export type UpdateAdminStudentCommand = {
  studentId: number
  lessonsCount?: number
  studentTrack?: AdminStudentTrack
  teacherIds?: number[]
}

export type AdminStudentUpdateRequest = AuthenticationRequest & {
  adminStudentUpdateCommand?: UpdateAdminStudentCommand
}

const tracks: AdminStudentTrack[] = ['student', 'intern', 'barber']

export const parseAdminStudentUpdate = (
  rawBody: unknown,
): UpdateAdminStudentCommand => {
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return invalidParameters()
  }
  const body = rawBody as Record<string, unknown>
  const studentId = Number(body.student_id)
  if (!Number.isSafeInteger(studentId) || studentId <= 0) {
    return invalidParameters()
  }

  let lessonsCount: number | undefined
  if (body.lessons_count !== undefined) {
    lessonsCount = Number(body.lessons_count)
    if (!Number.isSafeInteger(lessonsCount) || lessonsCount < 0) {
      return invalidParameters()
    }
  }
  let studentTrack: AdminStudentTrack | undefined
  if (body.student_track !== undefined) {
    if (!tracks.includes(body.student_track as AdminStudentTrack)) {
      return invalidParameters()
    }
    studentTrack = body.student_track as AdminStudentTrack
  }
  let teacherIds: number[] | undefined
  if (body.teacher_ids !== undefined) {
    if (!Array.isArray(body.teacher_ids)) return invalidParameters()
    teacherIds = body.teacher_ids.map(Number)
    if (teacherIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
      return invalidParameters()
    }
  }
  return {
    studentId,
    ...(lessonsCount === undefined ? {} : { lessonsCount }),
    ...(studentTrack === undefined ? {} : { studentTrack }),
    ...(teacherIds === undefined ? {} : { teacherIds }),
  }
}

export const adminStudentUpdateCommandFrom = (
  request: AdminStudentUpdateRequest,
): UpdateAdminStudentCommand =>
  request.adminStudentUpdateCommand ?? invalidParameters()
