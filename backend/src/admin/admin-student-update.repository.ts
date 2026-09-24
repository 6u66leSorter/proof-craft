import type {
  AdminStudentTrack,
  UpdateAdminStudentCommand,
} from './admin-student-update.body.js'

export type AdminStudentUpdateTarget = {
  id: number
  status: string
  track: string
}

export type AdminStudentProfilePatch = {
  studentId: number
  lessonsCount?: number
  studentTrack?: AdminStudentTrack
  updatedAt: string
}

export type AdminStudentUpdateAudit = UpdateAdminStudentCommand & {
  actorUserId: number
}

export abstract class AdminStudentUpdateRepository {
  abstract findStudent(id: number): Promise<AdminStudentUpdateTarget | null>
  abstract applyProfilePatch(command: AdminStudentProfilePatch): Promise<void>
  abstract findFirstMissingTeacherId(teacherIds: number[]): Promise<number | null>
  abstract replaceTeachers(
    studentId: number,
    teacherIds: number[],
    allowAssignments: boolean,
  ): Promise<void>
  abstract appendAudit(command: AdminStudentUpdateAudit): Promise<void>
}
