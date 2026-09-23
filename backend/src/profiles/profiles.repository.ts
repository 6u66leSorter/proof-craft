export abstract class ProfilesRepository {
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
