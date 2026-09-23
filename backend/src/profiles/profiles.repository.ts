export abstract class ProfilesRepository {
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
