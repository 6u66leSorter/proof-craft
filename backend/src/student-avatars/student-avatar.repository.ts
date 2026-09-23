export type StudentAvatar = {
  avatarFileId: string | null
}

export abstract class StudentAvatarRepository {
  abstract findByUserId(userId: number): Promise<StudentAvatar | null>
}
