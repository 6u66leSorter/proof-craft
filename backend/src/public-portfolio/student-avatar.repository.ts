export type PublicStudentAvatar = {
  avatarFileId: string | null
}

export abstract class StudentAvatarRepository {
  abstract findVisibleStudentAvatar(studentId: number): Promise<PublicStudentAvatar | null>
}
