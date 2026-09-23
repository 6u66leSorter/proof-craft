export abstract class StudentProfileRepository {
  abstract updateAbout(
    userId: number,
    aboutMe: string | null,
    updatedAt: string,
  ): Promise<boolean>
}
