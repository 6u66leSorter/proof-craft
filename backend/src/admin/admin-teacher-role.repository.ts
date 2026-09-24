import type { AdminTeacherRoleAction } from './admin-teacher-role.body.js'

export type AdminTeacherRoleTarget = {
  userId: number
  telegramId: number
  username: string | null
  firstName: string | null
  lastName: string | null
  teacherId: number | null
}

export type SaveAdminTeacherRole = {
  actorUserId: number
  target: AdminTeacherRoleTarget
  action: AdminTeacherRoleAction
  teacherName: string | null
  notificationKind: string
  message: string
}

export abstract class AdminTeacherRoleRepository {
  abstract findTargetByTelegramId(
    telegramId: number,
  ): Promise<AdminTeacherRoleTarget | null>
  abstract saveRoleChange(command: SaveAdminTeacherRole): Promise<void>
}
