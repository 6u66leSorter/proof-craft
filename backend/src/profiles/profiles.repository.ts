export type PendingProfileEdit = {
  id: number
  studentId: number
  newFullName: string
  newPhone: string
  newMetro: string | null
  createdAt: string
  currentFullName: string
  currentPhone: string
  currentMetro: string | null
  telegramId: number
}

export abstract class ProfilesRepository {
  abstract listPendingProfileEdits(): Promise<PendingProfileEdit[]>

  abstract findStudentForEdit(userId: number): Promise<{
    studentId: number
    fullName: string
    status: string
  } | null>

  abstract submitStudentProfileEdit(
    studentId: number,
    edit: { fullName: string; phone: string; metro: string | null },
  ): Promise<number>

  abstract recordStudentProfileEditSubmission(
    actorUserId: number,
    studentId: number,
    studentFullName: string,
  ): Promise<number[]>

  abstract updateStudentAbout(
    userId: number,
    aboutMe: string | null,
    updatedAt: string,
  ): Promise<boolean>

  abstract updateTeacherAbout(
    userId: number,
    aboutMe: string | null,
    updatedAt: string,
  ): Promise<boolean>
}
