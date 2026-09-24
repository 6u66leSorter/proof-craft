export type AdminModerationStudent = {
  id: number
  userId: number
  telegramId: number
}

export type SaveAdminStudentModeration = {
  studentId: number
  studentUserId: number
  actorUserId: number
  action: string
  status: string
  auditAction: string
  message: string
  updatedAt: string
  replaceTeacherIds: number[] | null
}

export abstract class AdminStudentModerationRepository {
  abstract findStudent(studentId: number): Promise<AdminModerationStudent | null>
  abstract findFirstMissingTeacherId(teacherIds: number[]): Promise<number | null>
  abstract saveModeration(command: SaveAdminStudentModeration): Promise<void>
}
