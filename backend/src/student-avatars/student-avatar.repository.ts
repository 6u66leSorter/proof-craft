export type StudentAvatar = {
  studentId: number
  avatarFileId: string | null
}

export type StudentAvatarAccess = StudentAvatar & {
  isOwner: boolean
  isAssignedTeacher: boolean
}

export abstract class StudentAvatarRepository {
  abstract findByUserId(userId: number): Promise<StudentAvatar | null>

  abstract findAccess(
    studentId: number,
    userId: number | null,
  ): Promise<StudentAvatarAccess | null>

  abstract updateAvatar(studentId: number, avatarFileId: string): Promise<void>
}
