import type { AdminTeacherApplicationAction } from './admin-teacher-application.body.js'

export type AdminTeacherApplicationApplicant = {
  userId: number
  telegramId: number
  teacherId: number | null
  hasTeacherRole: boolean
}

export type AdminTeacherApplicationTarget = {
  id: number
  fullName: string
  status: string
  applicant: AdminTeacherApplicationApplicant | null
}

export type SaveAdminTeacherApplicationDecision = {
  actorUserId: number
  application: AdminTeacherApplicationTarget
  action: AdminTeacherApplicationAction
  updatedAt: string
  notificationMessage: string
}

export type AdminTeacherApplicationDecisionResult = {
  alreadyTeacher: boolean
  notifyApplicant: boolean
}

export abstract class AdminTeacherApplicationRepository {
  abstract findById(id: number): Promise<AdminTeacherApplicationTarget | null>
  abstract saveDecision(
    command: SaveAdminTeacherApplicationDecision,
  ): Promise<AdminTeacherApplicationDecisionResult>
}
